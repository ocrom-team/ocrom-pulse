using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Neocrom.Pulse
{
    internal sealed class NeocromPulseTransport
    {
        private NeocromPulseConfig _config;
        private bool _inFlight;
        private float _backoffSec;
        private double _nextRetryAt;
        private string OfflinePath => Path.Combine(Application.persistentDataPath, "neocrom_pulse_queue.jsonl");

        public bool IsBusy => _inFlight;

        public void Setup(NeocromPulseConfig config)
        {
            _config = config;
        }

        public bool CanAttemptSend()
        {
            if (_inFlight || _config == null) return false;
            return Time.realtimeSinceStartupAsDouble >= _nextRetryAt;
        }

        public IEnumerator SendEnvelopeCoroutine(Dictionary<string, object> envelope, Action<bool, long> onDone)
        {
            if (!CanAttemptSend())
            {
                onDone?.Invoke(false, 0);
                yield break;
            }

            _inFlight = true;
            string json = SimpleJson.Serialize(envelope);
            byte[] rawBytes = Encoding.UTF8.GetBytes(json);
            byte[] bodyBytes = rawBytes;
            bool useGzip = _config.enableGzip && rawBytes.Length >= 128 && Application.platform != RuntimePlatform.WebGLPlayer;

            if (useGzip)
            {
                byte[] compressed = CompressGzip(rawBytes);
                if (compressed.Length > 0 && compressed.Length < rawBytes.Length)
                {
                    bodyBytes = compressed;
                }
                else
                {
                    useGzip = false;
                }
            }

            string tsStr = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
            string sig = ComputeHmacSha256(_config.ingestKey, tsStr, bodyBytes);

            using var req = new UnityWebRequest(_config.endpointUrl, UnityWebRequest.kHttpVerbPOST);
            req.uploadHandler = new UploadHandlerRaw(bodyBytes);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.timeout = 8;
            req.SetRequestHeader("Content-Type", "application/json; charset=utf-8");
            req.SetRequestHeader("X-Neocrom-Key", _config.ingestKey);
            req.SetRequestHeader("X-Neocrom-Timestamp", tsStr);
            req.SetRequestHeader("X-Neocrom-Signature", "sha256=" + sig);
            if (useGzip) req.SetRequestHeader("Content-Encoding", "gzip");

            yield return req.SendWebRequest();

            _inFlight = false;
            bool ok = req.result == UnityWebRequest.Result.Success && req.responseCode >= 200 && req.responseCode < 300;
            RecordOutcome(ok, req.responseCode);
            onDone?.Invoke(ok, req.responseCode);
        }

        private void RecordOutcome(bool ok, long statusCode)
        {
            if (ok)
            {
                _backoffSec = 0f;
                _nextRetryAt = 0.0;
                return;
            }
            if (statusCode >= 400 && statusCode < 500 && statusCode != 429)
            {
                _backoffSec = 60f;
            }
            else
            {
                _backoffSec = _backoffSec <= 0f ? 5f : Mathf.Min(_backoffSec * 2f, 300f);
            }
            _nextRetryAt = Time.realtimeSinceStartupAsDouble + _backoffSec + UnityEngine.Random.Range(0f, 2.5f);
        }

        public void PersistOfflineEvents(List<Dictionary<string, object>> events)
        {
            if (_config == null || !_config.enableOfflineQueue || events == null || events.Count == 0) return;
            try
            {
                var lines = new List<string>();
                if (File.Exists(OfflinePath))
                {
                    foreach (var line in File.ReadAllLines(OfflinePath))
                    {
                        if (!string.IsNullOrWhiteSpace(line)) lines.Add(line.Trim());
                    }
                }
                foreach (var ev in events) lines.Add(SimpleJson.Serialize(ev));

                while (lines.Count > _config.maxQueueEvents) lines.RemoveAt(0);
                string serialized = string.Join("\n", lines) + "\n";
                while (serialized.Length > _config.maxOfflineBytes && lines.Count > 1)
                {
                    lines.RemoveAt(0);
                    serialized = string.Join("\n", lines) + "\n";
                }
                File.WriteAllText(OfflinePath, serialized, Encoding.UTF8);
            }
            catch { /* Never crash gameplay on disk I/O */ }
        }

        public List<string> PopOfflineRawLines(int maxCount)
        {
            var result = new List<string>();
            if (_config == null || !_config.enableOfflineQueue || !File.Exists(OfflinePath)) return result;
            try
            {
                var all = File.ReadAllLines(OfflinePath);
                var remaining = new List<string>();
                foreach (var raw in all)
                {
                    var line = raw.Trim();
                    if (string.IsNullOrEmpty(line)) continue;
                    if (result.Count < maxCount) result.Add(line);
                    else remaining.Add(line);
                }
                if (remaining.Count == 0) File.Delete(OfflinePath);
                else File.WriteAllText(OfflinePath, string.Join("\n", remaining) + "\n", Encoding.UTF8);
            }
            catch { }
            return result;
        }

        public void ClearOfflineQueue()
        {
            try { if (File.Exists(OfflinePath)) File.Delete(OfflinePath); } catch { }
        }

        public static byte[] CompressGzip(byte[] raw)
        {
            using var ms = new MemoryStream();
            using (var gz = new GZipStream(ms, CompressionMode.Compress, true))
            {
                gz.Write(raw, 0, raw.Length);
            }
            return ms.ToArray();
        }

        public static string ComputeHmacSha256(string secret, string timestamp, byte[] body)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret ?? string.Empty));
            byte[] prefix = Encoding.UTF8.GetBytes(timestamp + ".");
            byte[] combined = new byte[prefix.Length + body.Length];
            Buffer.BlockCopy(prefix, 0, combined, 0, prefix.Length);
            Buffer.BlockCopy(body, 0, combined, prefix.Length, body.Length);
            byte[] hash = hmac.ComputeHash(combined);
            var sb = new StringBuilder(hash.Length * 2);
            for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
            return sb.ToString();
        }
    }

    internal static class SimpleJson
    {
        public static string Serialize(object value)
        {
            var sb = new StringBuilder(256);
            WriteValue(sb, value);
            return sb.ToString();
        }

        private static void WriteValue(StringBuilder sb, object val)
        {
            if (val == null) { sb.Append("null"); return; }
            if (val is bool b) { sb.Append(b ? "true" : "false"); return; }
            if (val is int || val is long) { sb.Append(Convert.ToString(val, CultureInfo.InvariantCulture)); return; }
            if (val is float f) { sb.Append(f.ToString("G9", CultureInfo.InvariantCulture)); return; }
            if (val is double d) { sb.Append(d.ToString("G15", CultureInfo.InvariantCulture)); return; }
            if (val is string s) { WriteString(sb, s); return; }
            if (val is IDictionary<string, object> dict)
            {
                sb.Append('{');
                bool first = true;
                foreach (var kv in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, kv.Key);
                    sb.Append(':');
                    WriteValue(sb, kv.Value);
                }
                sb.Append('}');
                return;
            }
            if (val is IEnumerable<object> list)
            {
                sb.Append('[');
                bool first = true;
                foreach (var item in list)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteValue(sb, item);
                }
                sb.Append(']');
                return;
            }
            WriteString(sb, val.ToString());
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.AppendFormat(CultureInfo.InvariantCulture, "\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}

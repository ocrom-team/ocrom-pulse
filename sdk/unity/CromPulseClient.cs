// Crom Pulse Unity SDK Adapter (v1 Wire Protocol)
// Lightweight, privacy-first telemetry client for Unity 2022+ / Unity 6.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Neocrom.CromPulse
{
    public sealed class CromPulseClient : MonoBehaviour
    {
        public static CromPulseClient Instance { get; private set; }

        [Header("Neocrom Configuration")]
        public string projectId = "neocrom-demo";
        public string ingestKey = "";
        public string endpointUrl = "https://pulse.neocrom.pro/api/v1/ingest";
        public bool requireConsent = true;

        private string _sessionId;
        private bool _consentGranted;
        private readonly List<string> _queuedJsonEvents = new List<string>();

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            _sessionId = Guid.NewGuid().ToString("N");
        }

        public void SetConsent(bool granted)
        {
            _consentGranted = granted;
            if (!granted) _queuedJsonEvents.Clear();
        }

        public void TrackEvent(string eventName, string serializedPropsJson = "{}")
        {
            if (requireConsent && !_consentGranted) return;
            long ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            _queuedJsonEvents.Add($"{{\"type\":\"custom\",\"ts\":{ts},\"name\":\"{Escape(eventName)}\",\"props\":{serializedPropsJson}}}");
        }

        public static byte[] CompressGzip(byte[] raw)
        {
            using var ms = new MemoryStream();
            using (var gzip = new GZipStream(ms, CompressionMode.Compress, true))
                gzip.Write(raw, 0, raw.Length);
            return ms.ToArray();
        }

        public static string ComputeHmacSha256(string secret, string timestamp, byte[] body)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            byte[] prefix = Encoding.UTF8.GetBytes(timestamp + ".");
            byte[] combined = new byte[prefix.Length + body.Length];
            Buffer.BlockCopy(prefix, 0, combined, 0, prefix.Length);
            Buffer.BlockCopy(body, 0, combined, prefix.Length, body.Length);
            return BitConverter.ToString(hmac.ComputeHash(combined)).Replace("-", "").ToLowerInvariant();
        }

        private static string Escape(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}

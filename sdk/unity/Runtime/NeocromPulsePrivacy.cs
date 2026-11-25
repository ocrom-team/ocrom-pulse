using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Neocrom.Pulse
{
    [Serializable]
    public struct NeocromPulseConsent
    {
        public bool decided;
        public bool gameplay;
        public bool performance;
        public bool errors;
        public bool hardware;
        public bool publicBenchmark;
        public long updatedAt;

        public bool AnyTelemetryGranted => gameplay || performance || errors;
    }

    internal static class NeocromPulsePrivacy
    {
        private const string PrefPrefix = "NeocromPulse.Consent.";

        private static readonly Regex EmailRx = new Regex(@"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", RegexOptions.Compiled);
        private static readonly Regex WinUserRx = new Regex(@"[a-zA-Z]:\\Users\\[^\\\s/]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex UnixUserRx = new Regex(@"(?:/home/|/Users/)[^/\s]+", RegexOptions.Compiled);
        private static readonly Regex IpRx = new Regex(@"\b(?:\d{1,3}\.){3}\d{1,3}\b", RegexOptions.Compiled);
        private static readonly Regex TokenRx = new Regex(@"(?:bearer|token|key|secret)[=: ]+[a-zA-Z0-9._-]{10,}", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex JwtRx = new Regex(@"\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b", RegexOptions.Compiled);

        private static readonly HashSet<string> BlockedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "email", "password", "token", "secret", "ip", "username", "user_name",
            "address", "phone", "auth", "cookie", "jwt"
        };

        public static NeocromPulseConsent LoadConsent()
        {
            return new NeocromPulseConsent
            {
                decided = PlayerPrefs.GetInt(PrefPrefix + "decided", 0) == 1,
                gameplay = PlayerPrefs.GetInt(PrefPrefix + "gameplay", 0) == 1,
                performance = PlayerPrefs.GetInt(PrefPrefix + "performance", 0) == 1,
                errors = PlayerPrefs.GetInt(PrefPrefix + "errors", 0) == 1,
                hardware = PlayerPrefs.GetInt(PrefPrefix + "hardware", 0) == 1,
                publicBenchmark = PlayerPrefs.GetInt(PrefPrefix + "public_benchmark", 0) == 1,
                updatedAt = long.TryParse(PlayerPrefs.GetString(PrefPrefix + "updated_at", "0"), out var ts) ? ts : 0L,
            };
        }

        public static void SaveConsent(NeocromPulseConsent c)
        {
            PlayerPrefs.SetInt(PrefPrefix + "decided", c.decided ? 1 : 0);
            PlayerPrefs.SetInt(PrefPrefix + "gameplay", c.gameplay ? 1 : 0);
            PlayerPrefs.SetInt(PrefPrefix + "performance", c.performance ? 1 : 0);
            PlayerPrefs.SetInt(PrefPrefix + "errors", c.errors ? 1 : 0);
            PlayerPrefs.SetInt(PrefPrefix + "hardware", c.hardware ? 1 : 0);
            PlayerPrefs.SetInt(PrefPrefix + "public_benchmark", c.publicBenchmark ? 1 : 0);
            PlayerPrefs.SetString(PrefPrefix + "updated_at", c.updatedAt.ToString());
            PlayerPrefs.Save();
        }

        public static void ClearConsent()
        {
            foreach (var k in new[] { "decided", "gameplay", "performance", "errors", "hardware", "public_benchmark", "updated_at" })
            {
                PlayerPrefs.DeleteKey(PrefPrefix + k);
            }
            PlayerPrefs.Save();
        }

        public static string ScrubText(string input, int maxLen = 512)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;
            var outStr = input.Trim();
            outStr = EmailRx.Replace(outStr, "[redacted-email]");
            outStr = WinUserRx.Replace(outStr, @"C:\Users\[user]");
            outStr = UnixUserRx.Replace(outStr, "/home/[user]");
            outStr = IpRx.Replace(outStr, "[redacted-ip]");
            outStr = TokenRx.Replace(outStr, "[redacted-secret]");
            outStr = JwtRx.Replace(outStr, "[redacted-jwt]");
            if (outStr.Length > maxLen)
            {
                outStr = outStr.Substring(0, maxLen - 3) + "...";
            }
            return outStr;
        }

        public static Dictionary<string, object> ScrubProperties(IDictionary<string, object> props, int maxKeys = 16)
        {
            var clean = new Dictionary<string, object>();
            if (props == null) return clean;
            int count = 0;
            foreach (var kv in props)
            {
                if (count >= maxKeys) break;
                var key = (kv.Key ?? string.Empty).Trim();
                if (key.Length > 48) key = key.Substring(0, 48);
                if (string.IsNullOrEmpty(key) || BlockedKeys.Contains(key)) continue;

                var val = kv.Value;
                if (val is float f)
                {
                    if (float.IsNaN(f) || float.IsInfinity(f)) continue;
                    clean[key] = Math.Round(f, 4);
                }
                else if (val is double d)
                {
                    if (double.IsNaN(d) || double.IsInfinity(d)) continue;
                    clean[key] = Math.Round(d, 4);
                }
                else if (val is bool || val is int || val is long)
                {
                    clean[key] = val;
                }
                else if (val != null)
                {
                    clean[key] = ScrubText(val.ToString(), 128);
                }
                count++;
            }
            return clean;
        }

        public static Dictionary<string, object> CollectAnonymizedHardware()
        {
            string osFamily = "Other";
            switch (SystemInfo.operatingSystemFamily)
            {
                case OperatingSystemFamily.Windows: osFamily = "Windows"; break;
                case OperatingSystemFamily.Linux: osFamily = "Linux"; break;
                case OperatingSystemFamily.MacOSX: osFamily = "macOS"; break;
                default:
                    if (Application.platform == RuntimePlatform.Android) osFamily = "Android";
                    else if (Application.platform == RuntimePlatform.IPhonePlayer) osFamily = "iOS";
                    else if (Application.platform == RuntimePlatform.WebGLPlayer) osFamily = "Web";
                    break;
            }

            string arch = "other";
            if (Application.platform == RuntimePlatform.WebGLPlayer) arch = "wasm32";
            else if (SystemInfo.processorType != null && SystemInfo.processorType.ToLowerInvariant().Contains("apple")) arch = "arm64";
            else if (IntPtr.Size == 8) arch = "x86_64";
            else arch = "x86";

            int cores = SystemInfo.processorCount;
            string cpuBucket = cores >= 17 ? "17+" : cores >= 9 ? "9-16" : cores >= 5 ? "5-8" : cores >= 3 ? "3-4" : "1-2";

            float ramGb = SystemInfo.systemMemorySize / 1024f;
            string ramBucket = ramGb >= 48f ? "64+" : ramGb >= 24f ? "32" : ramGb >= 12f ? "16" : ramGb >= 6f ? "8" : "<=4";

            string rawVendor = (SystemInfo.graphicsDeviceVendor ?? string.Empty).ToLowerInvariant();
            string rawGpu = SystemInfo.graphicsDeviceName ?? string.Empty;
            string lowerGpu = rawGpu.ToLowerInvariant();

            string gpuVendor = "Other";
            if (rawVendor.Contains("nvidia") || lowerGpu.Contains("nvidia") || lowerGpu.Contains("geforce") || lowerGpu.Contains("rtx")) gpuVendor = "NVIDIA";
            else if (rawVendor.Contains("amd") || rawVendor.Contains("ati") || lowerGpu.Contains("radeon")) gpuVendor = "AMD";
            else if (rawVendor.Contains("intel") || lowerGpu.Contains("intel")) gpuVendor = "Intel";
            else if (rawVendor.Contains("apple") || lowerGpu.Contains("apple")) gpuVendor = "Apple";
            else if (rawVendor.Contains("arm") || lowerGpu.Contains("mali")) gpuVendor = "ARM";
            else if (rawVendor.Contains("qualcomm") || lowerGpu.Contains("adreno")) gpuVendor = "Qualcomm";
            else if (SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Null) gpuVendor = "Software";

            string gpuTier = CoarsenGpuName(lowerGpu, gpuVendor);

            int minDim = Mathf.Min(Screen.currentResolution.width, Screen.currentResolution.height);
            string displayBucket = minDim >= 2000 ? "4K+" : minDim >= 1350 ? "1440p" : minDim >= 1000 ? "1080p" : minDim >= 700 ? "720p" : "<720p";

            string lang = MapLanguageCode(Application.systemLanguage);

            return new Dictionary<string, object>
            {
                { "os_family", osFamily },
                { "arch", arch },
                { "cpu_cores_bucket", cpuBucket },
                { "ram_gb_bucket", ramBucket },
                { "gpu_vendor", gpuVendor },
                { "gpu_tier", gpuTier },
                { "display_bucket", displayBucket },
                { "locale_lang", lang },
            };
        }

        private static string CoarsenGpuName(string lower, string vendor)
        {
            if (vendor == "Software") return "Headless / Software";
            if (vendor == "Apple")
            {
                if (lower.Contains("m4")) return "Apple M4 Series";
                if (lower.Contains("m3")) return "Apple M3 Series";
                if (lower.Contains("m2")) return "Apple M2 Series";
                if (lower.Contains("m1")) return "Apple M1 Series";
                return "Apple GPU";
            }
            if (vendor == "NVIDIA")
            {
                if (lower.Contains("rtx 50")) return "NVIDIA RTX 50-Series";
                if (lower.Contains("rtx 40")) return "NVIDIA RTX 40-Series";
                if (lower.Contains("rtx 30")) return "NVIDIA RTX 30-Series";
                if (lower.Contains("rtx 20")) return "NVIDIA RTX 20-Series";
                if (lower.Contains("gtx 16")) return "NVIDIA GTX 16-Series";
                if (lower.Contains("gtx")) return "NVIDIA GTX Legacy";
                return "NVIDIA GPU";
            }
            if (vendor == "AMD")
            {
                if (lower.Contains("rx 8") || lower.Contains("rx 9")) return "AMD Radeon RX 8000/9000";
                if (lower.Contains("rx 7")) return "AMD Radeon RX 7000";
                if (lower.Contains("rx 6")) return "AMD Radeon RX 6000";
                if (lower.Contains("radeon")) return "AMD Radeon";
                return "AMD GPU";
            }
            if (vendor == "Intel")
            {
                if (lower.Contains("arc")) return "Intel Arc";
                if (lower.Contains("iris") || lower.Contains("uhd")) return "Intel Integrated";
                return "Intel GPU";
            }
            return vendor + " GPU";
        }

        private static string MapLanguageCode(SystemLanguage lang)
        {
            switch (lang)
            {
                case SystemLanguage.German: return "de";
                case SystemLanguage.French: return "fr";
                case SystemLanguage.Spanish: return "es";
                case SystemLanguage.Italian: return "it";
                case SystemLanguage.Portuguese: return "pt";
                case SystemLanguage.Japanese: return "ja";
                case SystemLanguage.Korean: return "ko";
                case SystemLanguage.Chinese:
                case SystemLanguage.ChineseSimplified:
                case SystemLanguage.ChineseTraditional: return "zh";
                case SystemLanguage.Russian: return "ru";
                case SystemLanguage.Polish: return "pl";
                case SystemLanguage.Dutch: return "nl";
                default: return "en";
            }
        }

        public static string Sha256HexPrefix(string input, int length = 20)
        {
            using var sha = System.Security.Cryptography.SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            var sb = new StringBuilder(bytes.Length * 2);
            for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2"));
            var full = sb.ToString();
            return full.Length > length ? full.Substring(0, length) : full;
        }
    }
}

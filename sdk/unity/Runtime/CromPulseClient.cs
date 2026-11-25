using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Neocrom.CromPulse
{
    /// <summary>
    /// Static developer-facing facade for Neocrom Pulse in Unity.
    /// Auto-initializes via RuntimeInitializeOnLoadMethod; zero scene setup required.
    /// </summary>
    public static class CromPulse
    {
        public static event Action<CromPulseConsent> ConsentChanged;
        public static event Action<int, bool> BatchFlushed;
        public static event Action<string> ErrorReported;

        public static bool HasDecidedConsent() => CromPulseClient.Instance.HasDecidedConsent();
        public static bool IsTelemetryEnabled() => CromPulseClient.Instance.IsTelemetryEnabled();
        public static CromPulseConsent GetConsent() => CromPulseClient.Instance.GetConsent();

        public static void SetConsent(bool gameplay, bool performance, bool errors, bool hardware, bool publicBenchmark = false) =>
            CromPulseClient.Instance.SetConsent(gameplay, performance, errors, hardware, publicBenchmark);

        public static void GrantAllConsent(bool includePublicBenchmark = true) =>
            SetConsent(true, true, true, true, includePublicBenchmark);

        public static void DeclineAllConsent() =>
            SetConsent(false, false, false, false, false);

        public static void ClearLocalData() => CromPulseClient.Instance.ResetConsent();
        public static void ShowConsentDialog() => CromPulseClient.Instance.ShowConsentDialog();

        public static void TrackEvent(string eventName, IDictionary<string, object> props = null) =>
            CromPulseClient.Instance.TrackEvent(eventName, props);

        public static void TrackProgression(string level, string status, int score = -1) =>
            CromPulseClient.Instance.TrackProgression(level, status, score);

        public static void TrackSetting(string settingName, object value) =>
            CromPulseClient.Instance.TrackSetting(settingName, value);

        public static void BeginLoad(string zoneName) => CromPulseClient.Instance.BeginLoad(zoneName);
        public static int EndLoad(string zoneName) => CromPulseClient.Instance.EndLoad(zoneName);

        public static T Measure<T>(string label, Func<T> action)
        {
            BeginLoad(label);
            try { return action(); }
            finally { EndLoad(label); }
        }

        public static void Measure(string label, Action action)
        {
            BeginLoad(label);
            try { action(); }
            finally { EndLoad(label); }
        }

        public static AsyncOperation LoadSceneAsync(string sceneName, LoadSceneMode mode = LoadSceneMode.Single) =>
            CromPulseClient.Instance.LoadSceneTrackedAsync(sceneName, mode);

        public static Dictionary<string, object> SamplePerformance() => CromPulseClient.Instance.SamplePerformance();

        public static string ReportError(string message, string severity = "error", string source = "") =>
            CromPulseClient.Instance.ReportError(message, severity, source);

        public static bool Flush() => CromPulseClient.Instance.Flush();
        public static string GetPrivacyPreviewJson() => CromPulseClient.Instance.GetPrivacyPreviewJson();
        public static Dictionary<string, object> GetDiagnostics() => CromPulseClient.Instance.GetDiagnostics();

        internal static void RaiseConsentChanged(CromPulseConsent c) => ConsentChanged?.Invoke(c);
        internal static void RaiseBatchFlushed(int count, bool ok) => BatchFlushed?.Invoke(count, ok);
        internal static void RaiseErrorReported(string fp) => ErrorReported?.Invoke(fp);
    }

    public sealed class CromPulseClient : MonoBehaviour
    {
        public const string SdkName = "crom-pulse-unity";
        public const string SdkVersion = "0.1.0";
        private const float ErrorCooldownSec = 10f;

        private static CromPulseClient _instance;
        public static CromPulseClient Instance
        {
            get
            {
                if (_instance == null) Bootstrap();
                return _instance;
            }
        }

        [SerializeField] private CromPulseConfig config;

        private CromPulseConsent _consent;
        private readonly CromPulsePerf _perf = new CromPulsePerf();
        private readonly CromPulseTransport _transport = new CromPulseTransport();
        private Dictionary<string, object> _hardwareProfile = new Dictionary<string, object>();

        private string _sessionId = string.Empty;
        private bool _sessionActive;
        private long _activePlayMs;
        private long _lastResumeMs;
        private bool _isPaused;

        private readonly List<Dictionary<string, object>> _eventQueue = new List<Dictionary<string, object>>();
        private readonly Dictionary<string, float> _errorCooldowns = new Dictionary<string, float>();

        private float _flushElapsed;
        private float _heartbeatElapsed;
        private float _perfElapsed;
        private string _pendingSceneLoad;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (_instance != null) return;
            var go = new GameObject("[CromPulse]");
            DontDestroyOnLoad(go);
            _instance = go.AddComponent<CromPulseClient>();
        }

        private void Awake()
        {
            if (_instance != null && _instance != this) { Destroy(gameObject); return; }
            _instance = this;
            DontDestroyOnLoad(gameObject);

            if (config == null)
            {
                config = Resources.Load<CromPulseConfig>("CromPulseConfig");
                if (config == null) config = ScriptableObject.CreateInstance<CromPulseConfig>();
            }

            _transport.Setup(config);
            CheckEndpointSecurity();

            _consent = CromPulsePrivacy.LoadConsent();
            if (!config.requireConsent && !_consent.decided)
            {
                _consent = new CromPulseConsent
                {
                    decided = true,
                    gameplay = true,
                    performance = true,
                    errors = true,
                    hardware = true,
                    publicBenchmark = false,
                    updatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                };
            }

            if (config.autoCaptureErrors) Application.logMessageReceived += OnUnityLogMessage;
            if (config.autoTrackSceneLoads) SceneManager.sceneLoaded += OnSceneLoaded;
            Application.quitting += OnApplicationQuitting;

            if (_consent.AnyTelemetryGranted)
            {
                RefreshHardwareProfile();
                StartSession();
            }
        }

        private void OnDestroy()
        {
            Application.logMessageReceived -= OnUnityLogMessage;
            SceneManager.sceneLoaded -= OnSceneLoaded;
            Application.quitting -= OnApplicationQuitting;
        }

        private void Update()
        {
            if (!_isPaused) _perf.RecordFrame(Time.unscaledDeltaTime);
            if (!_consent.AnyTelemetryGranted) return;

            float dt = Time.unscaledDeltaTime;
            _flushElapsed += dt;
            _heartbeatElapsed += dt;
            _perfElapsed += dt;

            if (_consent.gameplay && _sessionActive && _heartbeatElapsed >= config.heartbeatIntervalSec)
            {
                _heartbeatElapsed = 0f;
                EnqueueHeartbeat();
            }

            if (_consent.performance && _perfElapsed >= config.perfSampleIntervalSec)
            {
                _perfElapsed = 0f;
                SamplePerformance();
            }

            if (_flushElapsed >= config.flushIntervalSec)
            {
                _flushElapsed = 0f;
                Flush();
            }
        }

        private void OnApplicationPause(bool pauseStatus)
        {
            if (!_sessionActive) return;
            if (pauseStatus && !_isPaused)
            {
                _isPaused = true;
                _activePlayMs += Math.Max(0L, NowMs() - _lastResumeMs);
            }
            else if (!pauseStatus && _isPaused)
            {
                _isPaused = false;
                _lastResumeMs = NowMs();
            }
        }

        private void OnApplicationQuitting() => EndSession();

        private void OnUnityLogMessage(string condition, string stackTrace, LogType type)
        {
            if (!_consent.errors) return;
            if (type != LogType.Error && type != LogType.Exception && type != LogType.Assert) return;
            string source = string.Empty;
            if (!string.IsNullOrEmpty(stackTrace))
            {
                int nl = stackTrace.IndexOf('\n');
                source = nl > 0 ? stackTrace.Substring(0, nl) : stackTrace;
            }
            ReportError(condition, type == LogType.Exception ? "fatal" : "error", source);
        }

        private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            if (!string.IsNullOrEmpty(_pendingSceneLoad))
            {
                EndLoad(_pendingSceneLoad);
                _pendingSceneLoad = null;
            }
            else if (_consent.gameplay)
            {
                TrackEvent("scene_loaded", new Dictionary<string, object> { { "scene", scene.name } });
            }
        }

        public AsyncOperation LoadSceneTrackedAsync(string sceneName, LoadSceneMode mode)
        {
            _pendingSceneLoad = sceneName;
            BeginLoad(sceneName);
            return SceneManager.LoadSceneAsync(sceneName, mode);
        }

        public bool HasDecidedConsent() => _consent.decided;
        public bool IsTelemetryEnabled() => _consent.AnyTelemetryGranted;
        public CromPulseConsent GetConsent() => _consent;

        public void SetConsent(bool gameplay, bool performance, bool errors, bool hardware, bool publicBenchmark)
        {
            bool wasAllowed = _consent.AnyTelemetryGranted;
            _consent = new CromPulseConsent
            {
                decided = true,
                gameplay = gameplay,
                performance = performance,
                errors = errors,
                hardware = hardware,
                publicBenchmark = publicBenchmark && (gameplay || performance),
                updatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            };
            CromPulsePrivacy.SaveConsent(_consent);
            CromPulse.RaiseConsentChanged(_consent);

            if (_consent.AnyTelemetryGranted)
            {
                RefreshHardwareProfile();
                if (!wasAllowed || !_sessionActive) StartSession();
            }
            else
            {
                _eventQueue.Clear();
                _hardwareProfile.Clear();
                _transport.ClearOfflineQueue();
                _sessionActive = false;
                _sessionId = string.Empty;
            }
        }

        public void ResetConsent()
        {
            CromPulsePrivacy.ClearConsent();
            _consent = default;
            _eventQueue.Clear();
            _hardwareProfile.Clear();
            _transport.ClearOfflineQueue();
            _sessionActive = false;
            _sessionId = string.Empty;
            CromPulse.RaiseConsentChanged(_consent);
        }

        public void ShowConsentDialog()
        {
            CromPulseConsentUI.Show(this);
        }

        public void StartSession()
        {
            if (!_consent.AnyTelemetryGranted) return;
            if (string.IsNullOrEmpty(_sessionId)) _sessionId = Guid.NewGuid().ToString("N");
            _sessionActive = true;
            _lastResumeMs = NowMs();
            _activePlayMs = 0L;
            _isPaused = false;
            if (_consent.gameplay)
            {
                PushEvent(new Dictionary<string, object>
                {
                    { "type", "session_start" },
                    { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                });
            }
        }

        public void EndSession()
        {
            if (!_sessionActive) return;
            long durationMs = GetSessionDurationMs();
            if (_consent.gameplay)
            {
                PushEvent(new Dictionary<string, object>
                {
                    { "type", "session_end" },
                    { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                    { "duration_ms", durationMs },
                });
            }
            _sessionActive = false;
            if (_eventQueue.Count > 0)
            {
                _transport.PersistOfflineEvents(_eventQueue);
                _eventQueue.Clear();
            }
        }

        public long GetSessionDurationMs()
        {
            if (!_sessionActive) return _activePlayMs;
            long slice = _isPaused ? 0L : Math.Max(0L, NowMs() - _lastResumeMs);
            return _activePlayMs + slice;
        }

        public void TrackEvent(string eventName, IDictionary<string, object> props = null)
        {
            if (!_consent.gameplay) return;
            string cleanName = (eventName ?? string.Empty).Trim();
            if (cleanName.Length > 64) cleanName = cleanName.Substring(0, 64);
            if (string.IsNullOrEmpty(cleanName)) return;
            if (!_sessionActive) StartSession();

            var ev = new Dictionary<string, object>
            {
                { "type", "custom" },
                { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                { "name", cleanName },
            };
            var cleanProps = CromPulsePrivacy.ScrubProperties(props);
            if (cleanProps.Count > 0) ev["props"] = cleanProps;
            PushEvent(ev);
        }

        public void TrackProgression(string level, string status, int score)
        {
            var props = new Dictionary<string, object>
            {
                { "level", (level ?? string.Empty).Trim() },
                { "status", (status ?? string.Empty).Trim() },
            };
            if (score >= 0) props["score"] = score;
            TrackEvent("progression", props);
        }

        public void TrackSetting(string settingName, object value)
        {
            TrackEvent("setting_changed", new Dictionary<string, object>
            {
                { "setting", (settingName ?? string.Empty).Trim() },
                { "value", value },
            });
        }

        public void BeginLoad(string zoneName)
        {
            if (!_consent.performance) return;
            _perf.BeginLoad(zoneName);
        }

        public int EndLoad(string zoneName)
        {
            if (!_consent.performance) return -1;
            int ms = _perf.EndLoad(zoneName);
            if (ms < 0) return -1;
            string clean = string.IsNullOrWhiteSpace(zoneName) ? "default" : zoneName.Trim();
            if (clean.Length > 64) clean = clean.Substring(0, 64);
            PushEvent(new Dictionary<string, object>
            {
                { "type", "load_time" },
                { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                { "name", clean },
                { "duration_ms", ms },
            });
            return ms;
        }

        public Dictionary<string, object> SamplePerformance()
        {
            if (!_consent.performance) return new Dictionary<string, object>();
            var metrics = _perf.CollectSnapshot();
            PushEvent(new Dictionary<string, object>
            {
                { "type", "perf_sample" },
                { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                { "metrics", metrics },
            });
            return metrics;
        }

        public string ReportError(string message, string severity = "error", string source = "")
        {
            if (!_consent.errors) return string.Empty;
            string cleanSev = (severity ?? "error").ToLowerInvariant();
            if (cleanSev != "warning" && cleanSev != "error" && cleanSev != "fatal") cleanSev = "error";
            string cleanMsg = CromPulsePrivacy.ScrubText(message, 512);
            if (string.IsNullOrEmpty(cleanMsg)) return string.Empty;
            string cleanSrc = CromPulsePrivacy.ScrubText(source, 160);
            string fp = CromPulsePrivacy.Sha256HexPrefix($"{cleanSev}|{cleanSrc}|{(cleanMsg.Length > 120 ? cleanMsg.Substring(0, 120) : cleanMsg)}", 20);

            float now = Time.realtimeSinceStartup;
            if (_errorCooldowns.TryGetValue(fp, out float lastSent) && now - lastSent < ErrorCooldownSec) return fp;
            _errorCooldowns[fp] = now;

            PushEvent(new Dictionary<string, object>
            {
                { "type", "error" },
                { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                {
                    "error", new Dictionary<string, object>
                    {
                        { "severity", cleanSev },
                        { "fingerprint", fp },
                        { "message", cleanMsg },
                        { "source", cleanSrc },
                    }
                },
            });
            CromPulse.RaiseErrorReported(fp);
            return fp;
        }

        public bool Flush()
        {
            if (!_consent.AnyTelemetryGranted || !_transport.CanAttemptSend() || _eventQueue.Count == 0) return false;
            int count = Math.Min(config.maxBatchSize, _eventQueue.Count);
            var batch = _eventQueue.GetRange(0, count);
            _eventQueue.RemoveRange(0, count);

            var envelope = BuildEnvelope(batch);
            StartCoroutine(_transport.SendEnvelopeCoroutine(envelope, (ok, _code) =>
            {
                if (!ok) _transport.PersistOfflineEvents(batch);
                CromPulse.RaiseBatchFlushed(batch.Count, ok);
            }));
            return true;
        }

        public Dictionary<string, object> BuildEnvelope(List<Dictionary<string, object>> events)
        {
            if (string.IsNullOrEmpty(_sessionId)) _sessionId = Guid.NewGuid().ToString("N");
            var env = new Dictionary<string, object>
            {
                { "schema_version", 1 },
                { "project_id", config.projectId },
                { "session_id", _sessionId },
                { "sent_at", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                { "sdk", new Dictionary<string, object> { { "name", SdkName }, { "version", SdkVersion } } },
                { "engine", new Dictionary<string, object> { { "name", "unity" }, { "version", Application.unityVersion }, { "app_version", config.EffectiveAppVersion } } },
                {
                    "consent", new Dictionary<string, object>
                    {
                        { "gameplay", _consent.gameplay },
                        { "performance", _consent.performance },
                        { "errors", _consent.errors },
                        { "hardware", _consent.hardware },
                        { "public_benchmark", _consent.publicBenchmark },
                    }
                },
                { "events", events },
            };
            if (_consent.hardware)
            {
                if (_hardwareProfile.Count == 0) RefreshHardwareProfile();
                env["hardware"] = _hardwareProfile;
            }
            return env;
        }

        public string GetPrivacyPreviewJson()
        {
            int count = Math.Min(5, _eventQueue.Count);
            var sample = _eventQueue.GetRange(0, count);
            var preview = new Dictionary<string, object>
            {
                { "queued_event_count", _eventQueue.Count },
                { "session_id_ephemeral", string.IsNullOrEmpty(_sessionId) ? "(none until consent)" : _sessionId },
                { "sample_envelope", _consent.AnyTelemetryGranted ? BuildEnvelope(sample) : (object)new Dictionary<string, object> { { "note", "No telemetry collected or transmitted." } } },
            };
            return SimpleJson.Serialize(preview);
        }

        public Dictionary<string, object> GetDiagnostics()
        {
            return new Dictionary<string, object>
            {
                { "sdk", SdkName },
                { "version", SdkVersion },
                { "enabled", _consent.AnyTelemetryGranted },
                { "session_active", _sessionActive },
                { "queued_events", _eventQueue.Count },
                { "in_flight", _transport.IsBusy },
                { "endpoint", config != null ? config.endpointUrl : "" },
            };
        }

        private void EnqueueHeartbeat()
        {
            PushEvent(new Dictionary<string, object>
            {
                { "type", "session_heartbeat" },
                { "ts", DateTimeOffset.UtcNow.ToUnixTimeSeconds() },
                { "duration_ms", GetSessionDurationMs() },
            });
        }

        private void PushEvent(Dictionary<string, object> ev)
        {
            _eventQueue.Add(ev);
            while (_eventQueue.Count > config.maxQueueEvents) _eventQueue.RemoveAt(0);
            if (config.debugLogging) Debug.Log($"[CromPulse] queued: {ev["type"]}");
        }

        private void RefreshHardwareProfile()
        {
            _hardwareProfile = _consent.hardware ? CromPulsePrivacy.CollectAnonymizedHardware() : new Dictionary<string, object>();
        }

        private void CheckEndpointSecurity()
        {
            if (config == null || !Debug.isDebugBuild) return;
            var url = (config.endpointUrl ?? string.Empty).ToLowerInvariant();
            if (url.StartsWith("http://") && !url.Contains("127.0.0.1") && !url.Contains("localhost"))
            {
                Debug.LogWarning("[CromPulse] Using unencrypted http:// endpoint. Switch to https:// before shipping.");
            }
        }

        private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }
}

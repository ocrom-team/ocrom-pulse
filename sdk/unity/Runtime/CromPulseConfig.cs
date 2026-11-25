using UnityEngine;

namespace Neocrom.CromPulse
{
    [CreateAssetMenu(fileName = "CromPulseConfig", menuName = "Neocrom/Crom Pulse Config", order = 10)]
    public sealed class CromPulseConfig : ScriptableObject
    {
        [Header("Neocrom Project")]
        [Tooltip("Project slug registered in your Crom Pulse dashboard (e.g. neocrom-demo).")]
        public string projectId = "neocrom-demo";

        [Tooltip("Project ingest key used for authentication and HMAC-SHA256 payload signing.")]
        public string ingestKey = "cp_demo_public_ingest_key_2026";

        [Tooltip("Ingestion endpoint URL. Use https:// in production builds.")]
        public string endpointUrl = "http://127.0.0.1:4318/api/v1/ingest";

        [Tooltip("Override Application.version if needed.")]
        public string appVersionOverride = "";

        [Header("Privacy & Consent")]
        [Tooltip("When enabled, zero telemetry is collected or sent until the player decides.")]
        public bool requireConsent = true;

        [Tooltip("Automatically capture Unity Error/Exception logs (automatically PII-scrubbed and deduplicated).")]
        public bool autoCaptureErrors = true;

        [Tooltip("Automatically measure scene load times via SceneManager.sceneLoaded.")]
        public bool autoTrackSceneLoads = true;

        [Header("Batching & Performance")]
        [Range(5f, 300f)]
        public float flushIntervalSec = 15f;

        [Range(15f, 600f)]
        public float heartbeatIntervalSec = 60f;

        [Range(5f, 300f)]
        public float perfSampleIntervalSec = 30f;

        [Range(5, 100)]
        public int maxBatchSize = 40;

        public int maxQueueEvents = 250;
        public int maxOfflineBytes = 262144;
        public bool enableGzip = true;
        public bool enableOfflineQueue = true;
        public bool debugLogging = false;

        public string EffectiveAppVersion =>
            string.IsNullOrWhiteSpace(appVersionOverride) ? Application.version : appVersionOverride;
    }
}

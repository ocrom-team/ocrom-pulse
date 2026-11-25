using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Profiling;

namespace Neocrom.Pulse
{
    internal sealed class NeocromPulsePerf
    {
        private const int RingCapacity = 120;
        private readonly float[] _frameMsRing = new float[RingCapacity];
        private readonly float[] _scratch = new float[RingCapacity];
        private int _ringIndex;
        private int _ringCount;
        private readonly Dictionary<string, long> _loadTimers = new Dictionary<string, long>();

        public void RecordFrame(float unscaledDeltaSec)
        {
            if (unscaledDeltaSec <= 0f) return;
            float ms = Mathf.Clamp(unscaledDeltaSec * 1000f, 0.1f, 10000f);
            _frameMsRing[_ringIndex] = ms;
            _ringIndex = (_ringIndex + 1) % RingCapacity;
            if (_ringCount < RingCapacity) _ringCount++;
        }

        public void BeginLoad(string label)
        {
            var clean = string.IsNullOrWhiteSpace(label) ? "default" : label.Trim();
            if (clean.Length > 64) clean = clean.Substring(0, 64);
            _loadTimers[clean] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        public int EndLoad(string label)
        {
            var clean = string.IsNullOrWhiteSpace(label) ? "default" : label.Trim();
            if (clean.Length > 64) clean = clean.Substring(0, 64);
            if (!_loadTimers.TryGetValue(clean, out long startedMs)) return -1;
            _loadTimers.Remove(clean);
            long elapsed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedMs;
            return (int)Math.Max(0L, elapsed);
        }

        public Dictionary<string, object> CollectSnapshot()
        {
            double ramMb = Math.Round(Profiler.GetTotalAllocatedMemoryLong() / (1024.0 * 1024.0), 1);
            double gcMb = Math.Round(GC.GetTotalMemory(false) / (1024.0 * 1024.0), 1);
            double vramMb = Math.Round(SystemInfo.graphicsMemorySize, 1);

            if (_ringCount == 0)
            {
                return new Dictionary<string, object>
                {
                    { "fps_avg", 0.0 },
                    { "fps_min", 0.0 },
                    { "fps_p50", 0.0 },
                    { "fps_p95", 0.0 },
                    { "frame_time_max_ms", 0.0 },
                    { "ram_static_mb", ramMb },
                    { "ram_gc_mb", gcMb },
                    { "vram_mb", vramMb },
                };
            }

            float sumMs = 0f;
            float maxMs = 0f;
            for (int i = 0; i < _ringCount; i++)
            {
                float ms = _frameMsRing[i];
                _scratch[i] = ms;
                sumMs += ms;
                if (ms > maxMs) maxMs = ms;
            }

            Array.Sort(_scratch, 0, _ringCount);
            float avgMs = sumMs / _ringCount;
            float p50Ms = _scratch[(int)Math.Floor((_ringCount - 1) * 0.50)];
            float p95Ms = _scratch[(int)Math.Floor((_ringCount - 1) * 0.95)];

            return new Dictionary<string, object>
            {
                { "fps_avg", Math.Round(1000.0 / Math.Max(avgMs, 0.1), 1) },
                { "fps_min", Math.Round(1000.0 / Math.Max(maxMs, 0.1), 1) },
                { "fps_p50", Math.Round(1000.0 / Math.Max(p50Ms, 0.1), 1) },
                { "fps_p95", Math.Round(1000.0 / Math.Max(p95Ms, 0.1), 1) },
                { "frame_time_max_ms", Math.Round(maxMs, 1) },
                { "ram_static_mb", ramMb },
                { "ram_gc_mb", gcMb },
                { "vram_mb", vramMb },
            };
        }
    }
}

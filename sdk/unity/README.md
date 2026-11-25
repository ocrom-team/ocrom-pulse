# Neocrom Pulse — Unity SDK (UPM Package)

Lightweight, modular, privacy-first game analytics and telemetry SDK for **Unity 2021.3+ / Unity 6**, part of the [Neocrom](https://neocrom.pro) ecosystem.

## Installation (1 Minute via Unity Package Manager)

1. Open **Window → Package Manager** in Unity.
2. Click **+ → Add package from git URL…**
3. Enter:
   ```text
   https://github.com/neocrom-team/crom-pulse.git?path=/sdk/unity
   ```
4. Open **Tools → Neocrom → Neocrom Pulse Setup** and click **Create CromPulseConfig in Assets/Resources/**.
5. Set your `projectId`, `ingestKey`, and `endpointUrl` in the Inspector.

**Zero scene setup required:** `CromPulse` auto-bootstraps via `[RuntimeInitializeOnLoadMethod]` and survives scene loads automatically.

## Features Tailored to Unity

- **Automatic Error & Exception Capture**: Hooks `Application.logMessageReceived` (with PII scrubbing & deduplication cooldown).
- **Automatic Scene Load Timing**: Hooks `SceneManager.sceneLoaded` or use `CromPulse.LoadSceneAsync("Level02")`.
- **Zero-Allocation Performance Ring Buffer**: Tracks `Time.unscaledDeltaTime` (FPS avg/min/p50/p95), `Profiler.GetTotalAllocatedMemoryLong()`, GC heap, and VRAM.
- **Built-in Neocrom Consent UI**: Zero-asset uGUI overlay (`CromPulse.ShowConsentDialog()`).
- **GZIP + HMAC-SHA256 + Offline Queue**: Persists failed batches in `Application.persistentDataPath/crom_pulse_queue.jsonl`.

## Usage Example

```csharp
using Neocrom.CromPulse;
using UnityEngine;

public class GameBootstrap : MonoBehaviour
{
    void Start()
    {
        if (!CromPulse.HasDecidedConsent())
            CromPulse.ShowConsentDialog();

        CromPulse.TrackProgression("tutorial", "started");
        CromPulse.Measure("procedural_map", () => BuildLevel());
    }
}
```

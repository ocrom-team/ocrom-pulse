# Neocrom Pulse — Godot 4 Plugin (v0.3.1)

Lightweight, modular, privacy-first game analytics and telemetry SDK for **Godot 4.x** (GDScript & C#/.NET), built for the [Neocrom](https://neocrom.pro) ecosystem.

## Features

- **1-Click Editor Dock**: Configure `project_id`, `ingest_key`, `endpoint_url`, and `environment` directly in the **Neocrom Pulse** bottom panel — with **Test Connection**, **1-Click Project Creation**, **Signed Test Events**, and copyable GDScript/C# snippets.
- **Cross-Platform Ready**:
  - **Desktop** (Windows, Linux, macOS, Steam Deck)
  - **Web / HTML5** (single-thread `HTTPRequest` safety, CORS-safe headers, `fetch(..., { keepalive: true })` / `sendBeacon` on tab close)
  - **Mobile** (Android & iOS background flush on `NOTIFICATION_APPLICATION_PAUSED`, responsive mobile consent dialog)
  - **Headless / Dedicated Server** (safe UI skip, `"Headless / Dedicated Server"` hardware profile)
- **Godot .NET / C# Support**: Typed `Neocrom.Pulse.NeocromPulse` static wrapper in `addons/neocrom_pulse/csharp/NeocromPulse.cs` (ignored cleanly by non-.NET Godot projects).
- **Multilingual & Gamepad-Ready Consent UI**: Built-in translations (`en`, `de`, `es`, `fr`, `pt`, `ja`, `zh`), theme presets (`neocrom_dark`, `neocrom_light`, `high_contrast`), and full keyboard/gamepad focus navigation.
- **Zero Fingerprinting & PII Scrubbing**: Ephemeral per-session IDs, coarsened hardware tiers, and automatic redaction of emails, IPs, tokens, and home paths.

## Installation

1. Install via the **Godot Asset Library** (or copy `addons/neocrom_pulse/` into your project's `res://addons/`).
2. Enable **Neocrom Pulse** under **Project → Project Settings → Plugins**.
3. Open the **Neocrom Pulse** bottom panel in the Godot Editor to set your credentials and click **Test Connection (/health)**.

## Quick Usage (GDScript)

```gdscript
func _ready() -> void:
	if not NeocromPulse.has_decided_consent():
		NeocromPulse.show_consent_dialog(self)

func _on_level_load() -> void:
	NeocromPulse.change_scene_to_file("res://scenes/level_01.tscn")

func _on_boss_defeated() -> void:
	NeocromPulse.track_progression("level_01", "completed", 4500)
	NeocromPulse.track_event("boss_defeated", {"boss": "warden", "attempts": 2})

func _on_error(msg: String) -> void:
	NeocromPulse.report_error(msg, "error", "res://scripts/main.gd:42")
```

## Quick Usage (C# / Godot .NET)

```csharp
using Neocrom.Pulse;

public partial class Main : Node
{
    public override void _Ready()
    {
        if (!NeocromPulse.HasDecidedConsent())
            NeocromPulse.ShowConsentDialog(this);

        NeocromPulse.TrackProgression("level_01", "started");
    }
}
```

## License

MIT License — see [LICENSE](LICENSE).

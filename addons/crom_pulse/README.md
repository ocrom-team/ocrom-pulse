# Crom Pulse — Godot 4 Plugin

Lightweight, modular, privacy-first game analytics and telemetry SDK for Godot 4.x (part of the [Neocrom](https://neocrom.pro) ecosystem).

## Features

- **Zero Fingerprinting**: Ephemeral per-session random IDs, no IP logging, coarsened hardware tiers (`cpu_cores_bucket`, `ram_gb_bucket`, `gpu_tier`, `display_bucket`, `locale_lang`).
- **Built-in Consent UI**: Transparent monochrome consent dialog (`CromPulse.show_consent_dialog(self)`) with granular toggles (`gameplay`, `performance`, `errors`, `hardware`, `public_benchmark`) and live payload inspection. Zero data is collected or sent before consent.
- **Minimal Performance Impact**: Fixed-size `PackedFloat32Array` ring-buffer frame sampler (zero per-frame allocations), background `HTTPRequest` batching, GZIP compression, and HMAC-SHA256 request signing.
- **Offline Queue**: Bounded local queue (`user://crom_pulse_queue.jsonl`) with exponential backoff.
- **PII Scrubbing**: Automatically redacts emails, IPs, tokens, and local user directory paths (`C:\Users\...`, `/home/...`) from error reports and event properties.

## Installation

1. Install via the **Godot Asset Library** (or copy `addons/crom_pulse` into your project's `res://addons/`).
2. Enable **Crom Pulse** under **Project → Project Settings → Plugins**.
3. Configure `crom_pulse/project_id`, `crom_pulse/ingest_key`, and `crom_pulse/endpoint_url` in **Project Settings → Crom Pulse**.

## Quick Usage

```gdscript
func _ready() -> void:
	if not CromPulse.has_decided_consent():
		CromPulse.show_consent_dialog(self)

func _on_level_load() -> void:
	CromPulse.change_scene_to_file("res://scenes/level_01.tscn")

func _on_heavy_task() -> void:
	var result = CromPulse.measure("world_gen", func(): return generate_map())

func _on_boss_defeated() -> void:
	CromPulse.track_progression("level_01", "completed", 4500)
	CromPulse.track_event("boss_defeated", {"boss": "warden", "attempts": 2})

func _on_error(msg: String) -> void:
	CromPulse.report_error(msg, "error", "res://scripts/main.gd:42")
```

## License

MIT License — see [LICENSE](LICENSE).

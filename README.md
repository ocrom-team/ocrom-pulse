# Crom Pulse

**Crom Pulse** is a lightweight, modular, privacy-first game analytics and telemetry platform built for the **Neocrom** ecosystem (`neocrom.pro`).

- **Open Source (MIT)** — free to self-host or integrate into indie and commercial games.
- **Zero Fingerprinting** — ephemeral per-session IDs, no IP storage, coarsened hardware buckets, automatic PII scrubbing.
- **Granular Consent** — built-in monochrome Neocrom Consent Dialog; zero bytes transmitted before player approval.
- **Ultra-Low Operating Cost** — GZIP-compressed batches + zero-dependency Node.js & SQLite WAL pre-aggregated rollups.
- **Multi-Engine Ready** — unified `v1` JSON schema (`spec/telemetry-v1.schema.json`) with a production Godot 4 plugin plus Unity UPM, Unreal, and Web SDKs.
- **Neocrom Public Game Database** — opt-in, *k*-anonymized performance benchmarks ready for `neocrom.pro` game listings.

## Ecosystem & Distribution

| Platform | Status / Entry Point |
| :--- | :--- |
| **Neocrom HQ** | [neocrom.pro](https://neocrom.pro) |
| **GitHub Repository & Releases** | [neocrom-team/crom-pulse](https://github.com/neocrom-team/crom-pulse) · [Release v0.1.1](https://github.com/neocrom-team/crom-pulse/releases/tag/v0.1.1) |
| **Godot Asset Library** | [Asset #25115](https://godotengine.org/asset-library/asset/edit/25115) *(Pending Moderator Approval)* |
| **Unity Package Manager (Git)** | `https://github.com/neocrom-team/crom-pulse.git?path=/sdk/unity` |
| **OpenUPM (`pro.neocrom.crom-pulse`)** | [openupm/openupm#7280](https://github.com/openupm/openupm/pull/7280) *(PR submitted)* |
| **Notion Knowledge Base** | [Crom Pulse Docs](https://app.notion.com/p/42342660dfda81e9bd1acd4e9acf5785) |

## Quickstart

### 1. Start the Neocrom Telemetry API & Analytics Dashboard

Requires **Node.js >= 22.13** (uses built-in `node:sqlite`, zero external `npm` packages required):

```bash
npm start
```

Open **http://127.0.0.1:4318** to inspect:
- **Analytics Dashboard** (sessions, active duration, FPS avg/P95, RAM, load times, OS/GPU/RAM cohorts, deduplicated errors, live ingest stream)
- **Public Game DB** (*k*-anonymized benchmarks contributed voluntarily)
- **SDK & Privacy** integration snippets

### 2. Integrate the Godot 4 Plugin

1. Copy `addons/crom_pulse/` into your Godot 4 project's `res://addons/crom_pulse/`.
2. Enable **Crom Pulse** under **Project → Project Settings → Plugins**.
3. Configure `crom_pulse/project_id`, `crom_pulse/ingest_key`, and `crom_pulse/endpoint_url` in Project Settings.
4. Use the `CromPulse` autoload anywhere in GDScript:

```gdscript
if not CromPulse.has_decided_consent():
    CromPulse.show_consent_dialog(self)

CromPulse.begin_load("zone_foundry")
# ... load level ...
CromPulse.end_load("zone_foundry")

CromPulse.track_event("boss_defeated", {"boss": "warden", "attempts": 2})
CromPulse.report_error("Audio pool saturated", "warning", "res://audio/sfx.gd:41")
```

You can also open this repository directly in **Godot 4.x** and run `res://demo/demo_scene.tscn` to test the Consent UI, performance sampling, PII scrubbing, and live API flushing.

## Running Tests

```bash
# Node.js API, GZIP, HMAC, PII scrubbing & k-anonymity tests
npm test

# Godot 4 headless SDK tests
godot --headless --path . --script res://tests/godot/test_crom_pulse.gd
```

## Project Layout

- `addons/crom_pulse/` — Godot 4 plugin (autoload client, privacy/PII scrubber, ring-buffer perf monitor, GZIP+HMAC transport, offline queue, Neocrom Consent UI)
- `server/` — Zero-dependency Node.js ingestion API, SQLite WAL rollup store, and dashboard static server
- `dashboard/` — Vanilla ES-module Analytics & Public Game Database UI matching `neocrom.pro`
- `spec/telemetry-v1.schema.json` — Engine-agnostic `v1` wire protocol schema
- `sdk/` — Cross-engine reference adapters for Unity (`sdk/unity/`), Unreal Engine (`sdk/unreal/`), and Web (`sdk/web/`)
- `demo/` — Interactive Godot 4 sandbox scene
- `tests/` — Automated GDScript & Node.js test suites

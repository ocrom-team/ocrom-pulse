# Neocrom Pulse — Architecture & Multi-Engine Blueprint

Neocrom Pulse is a lightweight, modular, privacy-first telemetry platform built for the **Neocrom** ecosystem (`neocrom.pro`).

## Core Design Principles

1. **Privacy by Design (Zero Fingerprinting)**
   - Ephemeral per-session IDs (`session_id`) generated locally at session start; no persistent device IDs, MAC addresses, or IP address storage.
   - Hardware profiles are coarsened/bucketed on the client before transmission (`ram_gb_bucket`, `cpu_cores_bucket`, `display_bucket`, `locale_lang` without country/region) to prevent unique device fingerprinting.
   - Explicit opt-in consent gates every telemetry category (`gameplay`, `performance`, `errors`, `hardware`, `public_benchmark`). When consent is undecided or declined, **zero** network requests are sent.
   - Automatic PII scrubbing on custom properties and error messages (emails, tokens, home directory paths like `C:\Users\<user>` or `/home/<user>`).

2. **Minimal Performance Impact**
   - Non-blocking performance sampling via a fixed-size circular ring buffer (zero heap allocations per frame during normal gameplay).
   - Batched HTTP transport with GZIP payload compression (`Content-Encoding: gzip`), reducing bandwidth by ~70–85%.
   - Offline retry queue persisted to disk with hard size caps (`256 KiB` default) and exponential backoff with jitter.

3. **Ultra-Low Operating Cost & Scalability**
   - Single-binary / zero-dependency Node.js ingestion API backed by SQLite in WAL mode (or easily swapped to Cloudflare D1 / Turso / Postgres).
   - Incoming batches immediately update compact **hourly/daily aggregated rollups** (`daily_rollups`, `hardware_rollups`, `event_rollups`, `error_groups`) while raw event rows can be pruned on a short retention schedule (e.g., 7–14 days).
   - Keeping aggregated rollups means querying dashboards and the **Public Neocrom Game Database** stays O(1)/O(days) and runs comfortably on a \$4/mo VPS or free-tier edge worker.

4. **Engine-Agnostic Wire Protocol (`v1`)**
   - Every engine SDK emits the identical JSON envelope defined in `spec/telemetry-v1.schema.json`.
   - Engine adapters:
     - **Godot 4.x** (`addons/crom_pulse/`) — Reference implementation (Autoload + Inspector Plugin + Consent UI + Scene/Perf Collectors).
     - **Unity (C#)** (`sdk/unity/CromPulseClient.cs`) — `MonoBehaviour` / `UnityWebRequest` + `GZipStream` adapter.
     - **Unreal Engine (C++)** (`sdk/unreal/CromPulseSubsystem.h`) — `UGameInstanceSubsystem` + `FHttpModule` adapter.
     - **Web / Custom JS** (`sdk/web/crom-pulse.mjs`) — `fetch` + `CompressionStream('gzip')` + `navigator.sendBeacon` adapter.

5. **Public Neocrom Game Database (k-Anonymized Benchmarks)**
   - Only games whose developer enabled public sharing **and** players opted into `public_benchmark` contribute to the public benchmark index.
   - Hardware/FPS/Load-time rows are suppressed unless `sample_count >= k_anonymity_threshold` (default `k = 5`, configurable via `CROM_PULSE_K_ANONYMITY`), protecting small cohorts from re-identification.

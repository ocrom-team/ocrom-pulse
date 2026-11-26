# Godot Asset Library Submission Guide

Use these exact settings when submitting **Neocrom Pulse** to the [Godot Asset Library](https://godotengine.org/asset-library/asset):

- **Title**: `Neocrom Pulse`
- **Category**: `Tools` (or `Misc`)
- **Godot Version**: `4.3` (compatible with 4.3 – 4.7+)
- **License**: `MIT`
- **Version String**: `0.2.0`
- **Repository Host**: GitHub (or GitLab / Codeberg)
- **Download Commit / Tag**: Use the latest 40-char commit hash on `main` (the `.gitattributes` `export-ignore` rules ensure the downloaded ZIP only installs `addons/neocrom_pulse/`, `LICENSE`, and `README.md` into users' projects!)
- **Icon URL**: `https://raw.githubusercontent.com/neocrom-team/neocrom-pulse/main/addons/neocrom_pulse/icon.png`

## Description Template

> **Neocrom Pulse** is a lightweight, modular, privacy-first game analytics and telemetry SDK for Godot 4, built for the Neocrom ecosystem (`neocrom.pro`).
>
> **Key Features:**
> - **Session & Activity Tracking**: Ephemeral per-session IDs, active play duration, and heartbeats.
> - **Performance Metrics**: Zero-allocation ring-buffer FPS (avg/min/p50/p95), RAM/VRAM usage, and scene load timers.
> - **Anonymized Hardware Stats**: Coarsened OS, CPU cores, RAM, GPU class, and display resolution buckets (no fingerprinting).
> - **Error Reporting & Custom Events**: Deduplicated error reports and custom events with automatic PII scrubbing.
> - **Built-in Consent UI**: Transparent monochrome consent dialog with granular opt-in toggles and live payload preview.
> - **Efficient & Secure Transport**: GZIP-compressed batches, HMAC-SHA256 signing, and bounded offline disk queue.

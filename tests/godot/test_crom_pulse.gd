extends SceneTree

const ClientScript = preload("res://addons/crom_pulse/crom_pulse_client.gd")
const PrivacyScript = preload("res://addons/crom_pulse/crom_pulse_privacy.gd")
const TransportScript = preload("res://addons/crom_pulse/crom_pulse_transport.gd")

var _failures: int = 0
var _assertions: int = 0


func _assert(cond: bool, msg: String) -> void:
	_assertions += 1
	if not cond:
		_failures += 1
		push_error("ASSERTION FAILED: " + msg)
	else:
		print("  [PASS] ", msg)


func _initialize() -> void:
	print("=== Crom Pulse Godot 4 SDK Unit Tests ===")

	var client := ClientScript.new()
	client.name = "TestCromPulse"
	root.add_child(client)
	await process_frame

	var test_consent_path := "user://test_crom_pulse_consent.cfg"
	var test_queue_path := "user://test_crom_pulse_queue.jsonl"
	client.configure({
		"project_id": "test-project",
		"ingest_key": "test-secret-key",
		"consent_file_path": test_consent_path,
		"offline_queue_path": test_queue_path,
		"require_consent": true,
		"enable_gzip": true,
	})
	client.reset_consent()

	# 1. Consent gating: nothing queued or transmitted before consent
	_assert(not client.has_decided_consent(), "Consent initially undecided after reset")
	client.track_event("level_started", {"level": 1})
	client.sample_performance()
	client.report_error("Crash test", "error", "main.gd:10")
	_assert(client.get_queued_count() == 0, "Zero events queued before consent is granted")
	_assert(not client.flush(), "Flush returns false when consent is not granted")

	# 2. PII scrubbing & property sanitization
	var scrubbed := PrivacyScript.scrub_text("User alice@example.com failed at C:\\Users\\alice\\game.save from 192.168.1.42 with Bearer abcdefghij12345")
	_assert(not scrubbed.contains("alice@example.com"), "Email scrubbed from text")
	_assert(not scrubbed.contains("\\Users\\alice"), "Windows username scrubbed from path")
	_assert(not scrubbed.contains("192.168.1.42"), "IPv4 scrubbed from text")
	_assert(not scrubbed.contains("abcdefghij12345"), "Secret token scrubbed from text")

	var clean_props := PrivacyScript.scrub_properties({
		"level": 3,
		"email": "drop@me.com",
		"weapon": "railgun",
		"path": "/home/barney/save.dat",
	})
	_assert(not clean_props.has("email"), "Sensitive key 'email' dropped from properties")
	_assert(clean_props.get("weapon") == "railgun", "Safe string property preserved")
	_assert(not str(clean_props.get("path", "")).contains("barney"), "Unix home username scrubbed in properties")

	# 3. Grant consent & capture events
	client.grant_all_consent(true)
	_assert(client.has_decided_consent(), "Consent marked decided after grant_all_consent")
	_assert(client.get_session_id().length() == 32, "Ephemeral 32-char hex session_id generated")

	client.track_event("boss_defeated", {"boss": "warden", "attempts": 2})
	client.track_progression("level_01", "completed", 4500)
	client.track_setting("vsync", true)
	var measured: int = client.measure("world_gen", func() -> int: return 42)
	_assert(measured == 42, "measure() returns callable result and records load_time")
	_assert(client.is_telemetry_enabled(), "is_telemetry_enabled() reflects active consent")
	_assert(client.get_diagnostics().get("sdk", "") == "crom-pulse-godot", "get_diagnostics() exposes SDK metadata")
	client.begin_load("zone_foundry")
	var load_ms := client.end_load("zone_foundry")
	_assert(load_ms >= 0, "Load timer returns non-negative duration")

	# Feed perf ring buffer
	for i in range(10):
		client._perf.record_frame(0.016)
	var snap := client.sample_performance()
	_assert(float(snap.get("fps_avg", 0.0)) > 50.0, "Perf ring buffer computes expected ~60 FPS")

	# Error deduplication cooldown
	var fp1 := client.report_error("Null pointer in inventory", "error", "inv.gd:44")
	var fp2 := client.report_error("Null pointer in inventory", "error", "inv.gd:44")
	_assert(not fp1.is_empty() and fp1 == fp2, "Identical error yields deterministic fingerprint")

	# 4. Mock transport, GZIP compression & HMAC-SHA256 verification
	var captured: Array = []
	client.set_mock_sender(func(envelope: Dictionary, headers: PackedStringArray, body_bytes: PackedByteArray) -> bool:
		captured.append({"envelope": envelope, "headers": headers, "bytes": body_bytes})
		return true
	)

	var flushed := client.flush()
	_assert(flushed, "Flush succeeds with mock transport")
	_assert(captured.size() == 1, "Exactly one batch envelope transmitted")
	if captured.size() == 1:
		var env: Dictionary = captured[0]["envelope"]
		var hdrs: PackedStringArray = captured[0]["headers"]
		var bytes: PackedByteArray = captured[0]["bytes"]
		_assert(int(env.get("schema_version", 0)) == 1, "Envelope schema_version is 1")
		_assert(env.has("hardware") and env["hardware"].has("ram_gb_bucket"), "Coarsened hardware profile attached")
		_assert(Array(env.get("events", [])).size() >= 4, "Session, custom, load_time, perf_sample, error batched together")

		var has_sig := false
		var ts_val := ""
		var sig_val := ""
		for h in hdrs:
			if h.begins_with("X-Crom-Timestamp: "):
				ts_val = h.trim_prefix("X-Crom-Timestamp: ")
			elif h.begins_with("X-Crom-Signature: sha256="):
				sig_val = h.trim_prefix("X-Crom-Signature: sha256=")
				has_sig = true
		_assert(has_sig and sig_val.length() == 64, "HMAC-SHA256 signature header generated")
		var expected_sig := TransportScript.compute_hmac_signature("test-secret-key", ts_val, bytes)
		_assert(sig_val == expected_sig, "HMAC-SHA256 signature matches server verification formula")

	# 5. Offline queue persistence when transport fails
	client.set_mock_sender(func(_e, _h, _b) -> bool: return false)
	client.track_event("offline_event", {"ok": true})
	client.flush()
	var persisted := client._transport.pop_offline_events(10)
	_assert(persisted.size() >= 1, "Failed batch persisted to offline disk queue and recovered")

	# Cleanup test artifacts
	client.reset_consent()
	client.queue_free()

	print("=== Summary: ", _assertions - _failures, "/", _assertions, " passed ===")
	quit(1 if _failures > 0 else 0)

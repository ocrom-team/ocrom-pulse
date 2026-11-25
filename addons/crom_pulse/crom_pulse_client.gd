class_name CromPulseClient
extends Node

const ConfigScript = preload("res://addons/crom_pulse/crom_pulse_config.gd")
const PrivacyScript = preload("res://addons/crom_pulse/crom_pulse_privacy.gd")
const PerfScript = preload("res://addons/crom_pulse/crom_pulse_perf.gd")
const TransportScript = preload("res://addons/crom_pulse/crom_pulse_transport.gd")

signal consent_changed(consent: Dictionary)
signal batch_flushed(event_count: int, success: bool)
signal error_reported(fingerprint: String)

const SDK_NAME := "crom-pulse-godot"
const SDK_VERSION := "0.1.0"
const ERROR_COOLDOWN_SEC := 10.0

var config: ConfigScript
var _consent: Dictionary = {}
var _perf: PerfScript
var _transport: TransportScript
var _hardware_profile: Dictionary = {}

var _session_id: String = ""
var _session_active: bool = false
var _session_started_ms: int = 0
var _active_play_ms: int = 0
var _last_resume_ms: int = 0
var _is_paused: bool = false

var _event_queue: Array[Dictionary] = []
var _pending_batch: Array[Dictionary] = []
var _error_cooldowns: Dictionary = {}

var _flush_elapsed: float = 0.0
var _heartbeat_elapsed: float = 0.0
var _perf_elapsed: float = 0.0
var _consent_dialog: Node = null


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if config == null:
		config = ConfigScript.from_project_settings()
	_perf = PerfScript.new()
	_transport = TransportScript.new()
	_transport.name = "CromPulseTransport"
	add_child(_transport)
	_transport.setup(config)
	_transport.request_finished.connect(_on_transport_finished)
	_check_endpoint_security()

	_consent = PrivacyScript.load_consent(config.consent_file_path)
	if not config.require_consent and not bool(_consent.get("decided", false)):
		_consent = {
			"decided": true,
			"gameplay": true,
			"performance": true,
			"errors": true,
			"hardware": true,
			"public_benchmark": false,
			"updated_at": int(Time.get_unix_time_from_system()),
		}

	if _is_any_consent_granted():
		_refresh_hardware_profile()
		start_session()


func _process(delta: float) -> void:
	if _perf == null:
		return
	if not _is_paused:
		_perf.record_frame(delta)

	if not _is_any_consent_granted():
		return

	_flush_elapsed += delta
	_heartbeat_elapsed += delta
	_perf_elapsed += delta

	if bool(_consent.get("gameplay", false)) and _session_active and _heartbeat_elapsed >= config.heartbeat_interval_sec:
		_heartbeat_elapsed = 0.0
		_enqueue_heartbeat()

	if bool(_consent.get("performance", false)) and _perf_elapsed >= config.perf_sample_interval_sec:
		_perf_elapsed = 0.0
		sample_performance()

	if _flush_elapsed >= config.flush_interval_sec:
		_flush_elapsed = 0.0
		flush()


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT:
			if _session_active and not _is_paused:
				_is_paused = true
				_active_play_ms += maxi(0, Time.get_ticks_msec() - _last_resume_ms)
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_APPLICATION_FOCUS_IN:
			if _session_active and _is_paused:
				_is_paused = false
				_last_resume_ms = Time.get_ticks_msec()
		NOTIFICATION_WM_CLOSE_REQUEST:
			end_session()


func _exit_tree() -> void:
	if _session_active:
		end_session()


func configure(overrides: Dictionary) -> void:
	if config == null:
		config = ConfigScript.from_project_settings()
	config.apply_overrides(overrides)
	if _transport != null:
		_transport.setup(config)
	_consent = PrivacyScript.load_consent(config.consent_file_path)


func set_mock_sender(sender: Callable) -> void:
	if _transport != null:
		_transport.set_mock_sender(sender)


func has_decided_consent() -> bool:
	return bool(_consent.get("decided", false))


func get_consent() -> Dictionary:
	return _consent.duplicate()


func set_consent(gameplay: bool, performance: bool, errors: bool, hardware: bool, public_benchmark: bool = false) -> void:
	var was_allowed := _is_any_consent_granted()
	_consent = {
		"decided": true,
		"gameplay": gameplay,
		"performance": performance,
		"errors": errors,
		"hardware": hardware,
		"public_benchmark": public_benchmark and (gameplay or performance),
		"updated_at": int(Time.get_unix_time_from_system()),
	}
	PrivacyScript.save_consent(config.consent_file_path, _consent)
	consent_changed.emit(_consent.duplicate())

	if _is_any_consent_granted():
		_refresh_hardware_profile()
		if not was_allowed or not _session_active:
			start_session()
	else:
		_event_queue.clear()
		_pending_batch.clear()
		_hardware_profile.clear()
		_transport.clear_offline_queue()
		_session_active = false
		_session_id = ""


func grant_all_consent(include_public_benchmark: bool = true) -> void:
	set_consent(true, true, true, true, include_public_benchmark)


func decline_all_consent() -> void:
	set_consent(false, false, false, false, false)


func reset_consent() -> void:
	PrivacyScript.clear_consent(config.consent_file_path)
	_consent = PrivacyScript.DEFAULT_CONSENT.duplicate()
	_event_queue.clear()
	_pending_batch.clear()
	_hardware_profile.clear()
	_transport.clear_offline_queue()
	_session_active = false
	_session_id = ""
	consent_changed.emit(_consent.duplicate())


func show_consent_dialog(parent: Node = null) -> Node:
	if _consent_dialog != null and is_instance_valid(_consent_dialog):
		_consent_dialog.queue_free()
	var dialog_script := load("res://addons/crom_pulse/ui/crom_pulse_consent_dialog.gd")
	var dialog: Node = dialog_script.new()
	var target := parent if parent != null else get_tree().root
	target.add_child(dialog)
	dialog.setup(self)
	_consent_dialog = dialog
	return dialog


func start_session() -> void:
	if not _is_any_consent_granted():
		return
	if _session_id.is_empty():
		_session_id = _generate_session_id()
	_session_active = true
	_session_started_ms = Time.get_ticks_msec()
	_last_resume_ms = _session_started_ms
	_active_play_ms = 0
	_is_paused = false
	if bool(_consent.get("gameplay", false)):
		_push_event({
			"type": "session_start",
			"ts": int(Time.get_unix_time_from_system()),
		})


func end_session() -> void:
	if not _session_active:
		return
	var duration_ms := get_session_duration_ms()
	if bool(_consent.get("gameplay", false)):
		_push_event({
			"type": "session_end",
			"ts": int(Time.get_unix_time_from_system()),
			"duration_ms": duration_ms,
		})
	_session_active = false
	if not _event_queue.is_empty() and _transport != null:
		# Best-effort synchronous flush attempt or persist offline for next startup
		if not flush():
			_transport.persist_offline_events(_event_queue)
			_event_queue.clear()


func get_session_duration_ms() -> int:
	if not _session_active:
		return _active_play_ms
	var current_slice := 0 if _is_paused else maxi(0, Time.get_ticks_msec() - _last_resume_ms)
	return _active_play_ms + current_slice


func get_session_id() -> String:
	return _session_id


func track_event(event_name: String, props: Dictionary = {}) -> void:
	if not bool(_consent.get("gameplay", false)):
		return
	var clean_name := event_name.strip_edges().left(64)
	if clean_name.is_empty():
		return
	if not _session_active:
		start_session()
	var ev := {
		"type": "custom",
		"ts": int(Time.get_unix_time_from_system()),
		"name": clean_name,
	}
	var clean_props := PrivacyScript.scrub_properties(props)
	if not clean_props.is_empty():
		ev["props"] = clean_props
	_push_event(ev)


func is_telemetry_enabled() -> bool:
	return _is_any_consent_granted()


func track_progression(level: String, status: String, score: int = -1) -> void:
	var props := {
		"level": level.strip_edges().left(48),
		"status": status.strip_edges().left(24),
	}
	if score >= 0:
		props["score"] = score
	track_event("progression", props)


func track_setting(setting_name: String, value: Variant) -> void:
	track_event("setting_changed", {
		"setting": setting_name.strip_edges().left(48),
		"value": value,
	})


func measure(label: String, fn: Callable) -> Variant:
	begin_load(label)
	var result: Variant = fn.call()
	end_load(label)
	return result


func change_scene_to_file(path: String) -> Error:
	var label := path.get_file().get_basename()
	begin_load(label)
	var err := get_tree().change_scene_to_file(path)
	end_load(label)
	return err


func clear_local_data() -> void:
	reset_consent()


func get_diagnostics() -> Dictionary:
	return {
		"sdk": SDK_NAME,
		"version": SDK_VERSION,
		"enabled": _is_any_consent_granted(),
		"session_active": _session_active,
		"queued_events": _event_queue.size(),
		"in_flight": _transport.is_busy() if _transport != null else false,
		"endpoint": config.endpoint_url if config != null else "",
	}


func _check_endpoint_security() -> void:
	if config == null or not OS.is_debug_build():
		return
	var url := config.endpoint_url.to_lower()
	if url.begins_with("http://") and not (url.contains("127.0.0.1") or url.contains("localhost") or url.contains("[::1]")):
		push_warning("[CromPulse] Using unencrypted http:// endpoint in non-local URL. Switch to https:// before shipping.")


func begin_load(zone_name: String) -> void:
	if not bool(_consent.get("performance", false)):
		return
	_perf.begin_load(zone_name)


func end_load(zone_name: String) -> int:
	if not bool(_consent.get("performance", false)):
		return -1
	var duration_ms := _perf.end_load(zone_name)
	if duration_ms < 0:
		return -1
	var clean_zone := zone_name.strip_edges().left(64)
	if clean_zone.is_empty():
		clean_zone = "default"
	_push_event({
		"type": "load_time",
		"ts": int(Time.get_unix_time_from_system()),
		"name": clean_zone,
		"duration_ms": duration_ms,
	})
	return duration_ms


func sample_performance() -> Dictionary:
	if not bool(_consent.get("performance", false)):
		return {}
	var metrics := _perf.collect_snapshot()
	_push_event({
		"type": "perf_sample",
		"ts": int(Time.get_unix_time_from_system()),
		"metrics": metrics,
	})
	return metrics


func report_error(message: String, severity: String = "error", source: String = "") -> String:
	if not bool(_consent.get("errors", false)):
		return ""
	var clean_sev := severity.to_lower()
	if clean_sev not in ["warning", "error", "fatal"]:
		clean_sev = "error"
	var clean_msg := PrivacyScript.scrub_text(message, 512)
	if clean_msg.is_empty():
		return ""
	var clean_src := PrivacyScript.scrub_text(source, 160)
	var fp_raw := "%s|%s|%s" % [clean_sev, clean_src, clean_msg.left(120)]
	var fingerprint := fp_raw.sha256_text().left(20)

	var now := Time.get_unix_time_from_system()
	if _error_cooldowns.has(fingerprint):
		if now - float(_error_cooldowns[fingerprint]) < ERROR_COOLDOWN_SEC:
			return fingerprint
	_error_cooldowns[fingerprint] = now

	_push_event({
		"type": "error",
		"ts": int(now),
		"error": {
			"severity": clean_sev,
			"fingerprint": fingerprint,
			"message": clean_msg,
			"source": clean_src,
		},
	})
	error_reported.emit(fingerprint)
	return fingerprint


func flush() -> bool:
	if not _is_any_consent_granted() or _transport == null:
		return false
	if not _transport.can_attempt_send():
		return false

	if _event_queue.size() < config.max_batch_size:
		var offline := _transport.pop_offline_events(config.max_batch_size - _event_queue.size())
		for ev in offline:
			_event_queue.append(ev)

	if _event_queue.is_empty():
		return false

	var batch_size := mini(config.max_batch_size, _event_queue.size())
	_pending_batch = _event_queue.slice(0, batch_size)
	_event_queue = _event_queue.slice(batch_size)

	var envelope := build_envelope(_pending_batch)
	var started := _transport.send_envelope(envelope)
	if not started:
		# Requeue failed attempt
		var restored: Array[Dictionary] = []
		restored.append_array(_pending_batch)
		restored.append_array(_event_queue)
		_event_queue = restored
		_pending_batch.clear()
		return false
	return true


func build_envelope(events: Array) -> Dictionary:
	if _session_id.is_empty():
		_session_id = _generate_session_id()
	var envelope := {
		"schema_version": 1,
		"project_id": config.project_id,
		"session_id": _session_id,
		"sent_at": int(Time.get_unix_time_from_system()),
		"sdk": {
			"name": SDK_NAME,
			"version": SDK_VERSION,
		},
		"engine": {
			"name": "godot",
			"version": Engine.get_version_info().get("string", "4.x"),
			"app_version": config.app_version,
		},
		"consent": {
			"gameplay": bool(_consent.get("gameplay", false)),
			"performance": bool(_consent.get("performance", false)),
			"errors": bool(_consent.get("errors", false)),
			"hardware": bool(_consent.get("hardware", false)),
			"public_benchmark": bool(_consent.get("public_benchmark", false)),
		},
		"events": events.duplicate(),
	}
	if bool(_consent.get("hardware", false)):
		if _hardware_profile.is_empty():
			_refresh_hardware_profile()
		envelope["hardware"] = _hardware_profile
	return envelope


func get_privacy_preview() -> Dictionary:
	var preview_events := _event_queue.slice(0, mini(5, _event_queue.size()))
	return {
		"consent": get_consent(),
		"queued_event_count": _event_queue.size(),
		"session_id_ephemeral": _session_id if not _session_id.is_empty() else "(none until consent)",
		"sample_envelope": build_envelope(preview_events) if _is_any_consent_granted() else { "note": "No telemetry collected or transmitted." },
	}


func get_queued_count() -> int:
	return _event_queue.size()


func _enqueue_heartbeat() -> void:
	_push_event({
		"type": "session_heartbeat",
		"ts": int(Time.get_unix_time_from_system()),
		"duration_ms": get_session_duration_ms(),
	})


func _push_event(ev: Dictionary) -> void:
	_event_queue.append(ev)
	while _event_queue.size() > config.max_queue_events:
		_event_queue.pop_front()
	if config.debug_logging:
		print("[CromPulse] queued: ", ev.get("type", ""), " ", ev.get("name", ""))


func _on_transport_finished(success: bool, _status_code: int) -> void:
	var count := _pending_batch.size()
	if not success and not _pending_batch.is_empty():
		_transport.persist_offline_events(_pending_batch)
	_pending_batch = []
	batch_flushed.emit(count, success)


func _refresh_hardware_profile() -> void:
	if bool(_consent.get("hardware", false)):
		_hardware_profile = PrivacyScript.collect_anonymized_hardware()
	else:
		_hardware_profile = {}


func _is_any_consent_granted() -> bool:
	return bool(_consent.get("gameplay", false)) \
		or bool(_consent.get("performance", false)) \
		or bool(_consent.get("errors", false))


static func _generate_session_id() -> String:
	var crypto := Crypto.new()
	return crypto.generate_random_bytes(16).hex_encode()

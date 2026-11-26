@tool
extends EditorPlugin

const AUTOLOAD_NAME := "NeocromPulse"
const AUTOLOAD_PATH := "res://addons/neocrom_pulse/neocrom_pulse_client.gd"
const DOCK_SCRIPT := preload("res://addons/neocrom_pulse/editor/neocrom_pulse_dock.gd")

var _dock: Control

const SETTINGS_DEFAULTS := {
	"neocrom_pulse/project_id": { "value": "neocrom-demo", "type": TYPE_STRING, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/ingest_key": { "value": "cp_demo_public_ingest_key_2026", "type": TYPE_STRING, "hint": PROPERTY_HINT_PASSWORD, "hint_string": "" },
	"neocrom_pulse/endpoint_url": { "value": "http://127.0.0.1:4318/api/v1/ingest", "type": TYPE_STRING, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/app_version": { "value": "0.1.0", "type": TYPE_STRING, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/environment": { "value": "dev", "type": TYPE_STRING, "hint": PROPERTY_HINT_ENUM, "hint_string": "dev,staging,prod" },
	"neocrom_pulse/require_consent": { "value": true, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/auto_track_scenes": { "value": false, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/auto_track_errors": { "value": false, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/consent_locale": { "value": "auto", "type": TYPE_STRING, "hint": PROPERTY_HINT_ENUM, "hint_string": "auto,en,de,es,fr,pt,ja,zh" },
	"neocrom_pulse/consent_theme": { "value": "neocrom_dark", "type": TYPE_STRING, "hint": PROPERTY_HINT_ENUM, "hint_string": "neocrom_dark,neocrom_light,high_contrast" },
	"neocrom_pulse/flush_interval_sec": { "value": 15.0, "type": TYPE_FLOAT, "hint": PROPERTY_HINT_RANGE, "hint_string": "5.0,300.0,1.0" },
	"neocrom_pulse/heartbeat_interval_sec": { "value": 60.0, "type": TYPE_FLOAT, "hint": PROPERTY_HINT_RANGE, "hint_string": "15.0,600.0,5.0" },
	"neocrom_pulse/perf_sample_interval_sec": { "value": 30.0, "type": TYPE_FLOAT, "hint": PROPERTY_HINT_RANGE, "hint_string": "5.0,300.0,1.0" },
	"neocrom_pulse/max_batch_size": { "value": 40, "type": TYPE_INT, "hint": PROPERTY_HINT_RANGE, "hint_string": "5,100,1" },
	"neocrom_pulse/enable_gzip": { "value": true, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/web_disable_gzip": { "value": true, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/enable_offline_queue": { "value": true, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
	"neocrom_pulse/debug_logging": { "value": false, "type": TYPE_BOOL, "hint": PROPERTY_HINT_NONE, "hint_string": "" },
}


func _enter_tree() -> void:
	var added_any := false
	for key: String in SETTINGS_DEFAULTS:
		var spec: Dictionary = SETTINGS_DEFAULTS[key]
		if not ProjectSettings.has_setting(key):
			ProjectSettings.set_setting(key, spec["value"])
			added_any = true
		ProjectSettings.set_initial_value(key, spec["value"])
		ProjectSettings.add_property_info({
			"name": key,
			"type": spec["type"],
			"hint": spec["hint"],
			"hint_string": spec["hint_string"],
		})
	if added_any:
		ProjectSettings.save()
	add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)
	_dock = DOCK_SCRIPT.new()
	add_control_to_bottom_panel(_dock, "Neocrom Pulse")


func _exit_tree() -> void:
	if _dock != null:
		remove_control_from_bottom_panel(_dock)
		_dock.queue_free()
		_dock = null
	remove_autoload_singleton(AUTOLOAD_NAME)


func _get_plugin_name() -> String:
	return "Neocrom Pulse"


func _get_plugin_icon() -> Texture2D:
	const ICON_PATH := "res://addons/neocrom_pulse/icon.svg"
	if ResourceLoader.exists(ICON_PATH):
		return load(ICON_PATH) as Texture2D
	return null

class_name NeocromPulseConfig
extends RefCounted

var project_id: String = "neocrom-demo"
var ingest_key: String = "cp_demo_public_ingest_key_2026"
var endpoint_url: String = "http://127.0.0.1:4318/api/v1/ingest"
var app_version: String = "0.1.0"
var environment: String = "dev"
var require_consent: bool = true
var auto_track_scenes: bool = false
var auto_track_errors: bool = false
var consent_locale: String = "auto"
var consent_theme: String = "neocrom_dark"
var flush_interval_sec: float = 15.0
var heartbeat_interval_sec: float = 60.0
var perf_sample_interval_sec: float = 30.0
var max_batch_size: int = 40
var max_queue_events: int = 250
var max_offline_bytes: int = 262144
var enable_gzip: bool = true
var web_disable_gzip: bool = true
var enable_offline_queue: bool = true
var debug_logging: bool = false
var consent_file_path: String = "user://neocrom_pulse_consent.cfg"
var offline_queue_path: String = "user://neocrom_pulse_queue.jsonl"


static func from_project_settings():
	var cfg = new()
	cfg.project_id = str(ProjectSettings.get_setting("neocrom_pulse/project_id", cfg.project_id))
	cfg.ingest_key = str(ProjectSettings.get_setting("neocrom_pulse/ingest_key", cfg.ingest_key))
	cfg.endpoint_url = str(ProjectSettings.get_setting("neocrom_pulse/endpoint_url", cfg.endpoint_url))
	cfg.app_version = str(ProjectSettings.get_setting("neocrom_pulse/app_version", ProjectSettings.get_setting("application/config/version", cfg.app_version)))
	cfg.environment = str(ProjectSettings.get_setting("neocrom_pulse/environment", cfg.environment))
	if cfg.environment not in ["dev", "staging", "prod"]:
		cfg.environment = "dev"
	cfg.require_consent = bool(ProjectSettings.get_setting("neocrom_pulse/require_consent", cfg.require_consent))
	cfg.auto_track_scenes = bool(ProjectSettings.get_setting("neocrom_pulse/auto_track_scenes", cfg.auto_track_scenes))
	cfg.auto_track_errors = bool(ProjectSettings.get_setting("neocrom_pulse/auto_track_errors", cfg.auto_track_errors))
	cfg.consent_locale = str(ProjectSettings.get_setting("neocrom_pulse/consent_locale", cfg.consent_locale))
	cfg.consent_theme = str(ProjectSettings.get_setting("neocrom_pulse/consent_theme", cfg.consent_theme))
	cfg.flush_interval_sec = clampf(float(ProjectSettings.get_setting("neocrom_pulse/flush_interval_sec", cfg.flush_interval_sec)), 5.0, 300.0)
	cfg.heartbeat_interval_sec = clampf(float(ProjectSettings.get_setting("neocrom_pulse/heartbeat_interval_sec", cfg.heartbeat_interval_sec)), 15.0, 600.0)
	cfg.perf_sample_interval_sec = clampf(float(ProjectSettings.get_setting("neocrom_pulse/perf_sample_interval_sec", cfg.perf_sample_interval_sec)), 5.0, 300.0)
	cfg.max_batch_size = clampi(int(ProjectSettings.get_setting("neocrom_pulse/max_batch_size", cfg.max_batch_size)), 5, 100)
	cfg.enable_gzip = bool(ProjectSettings.get_setting("neocrom_pulse/enable_gzip", cfg.enable_gzip))
	cfg.web_disable_gzip = bool(ProjectSettings.get_setting("neocrom_pulse/web_disable_gzip", cfg.web_disable_gzip))
	cfg.enable_offline_queue = bool(ProjectSettings.get_setting("neocrom_pulse/enable_offline_queue", cfg.enable_offline_queue))
	cfg.debug_logging = bool(ProjectSettings.get_setting("neocrom_pulse/debug_logging", cfg.debug_logging))
	return cfg


func apply_overrides(overrides: Dictionary) -> void:
	for key in overrides:
		if key in self:
			set(key, overrides[key])

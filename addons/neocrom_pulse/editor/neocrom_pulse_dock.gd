@tool
extends MarginContainer

var _tabs: TabContainer
var _http: HTTPRequest
var _pending_action: String = ""

var _ed_project_id: LineEdit
var _ed_ingest_key: LineEdit
var _ed_endpoint: LineEdit
var _ed_app_version: LineEdit
var _opt_env: OptionButton
var _chk_consent: CheckBox
var _chk_auto_scenes: CheckBox
var _chk_web_no_gzip: CheckBox
var _opt_locale: OptionButton
var _opt_theme: OptionButton

var _status_label: RichTextLabel
var _diag_output: TextEdit

const ENV_OPTIONS := ["dev", "staging", "prod"]
const LOCALE_OPTIONS := ["auto", "en", "de", "es", "fr", "pt", "ja", "zh"]
const THEME_OPTIONS := ["neocrom_dark", "neocrom_light", "high_contrast"]


func _ready() -> void:
	custom_minimum_size = Vector2(0, 220)
	add_theme_constant_override("margin_left", 8)
	add_theme_constant_override("margin_right", 8)
	add_theme_constant_override("margin_top", 6)
	add_theme_constant_override("margin_bottom", 6)

	_http = HTTPRequest.new()
	_http.timeout = 8.0
	add_child(_http)
	_http.request_completed.connect(_on_http_completed)

	_tabs = TabContainer.new()
	_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_tabs)

	_build_setup_tab()
	_build_diagnostics_tab()
	_build_snippets_tab()
	_load_from_project_settings()


func _build_setup_tab() -> void:
	var scroll := ScrollContainer.new()
	scroll.name = "Setup & Connection"
	_tabs.add_child(scroll)

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 8)
	scroll.add_child(vbox)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 6)
	vbox.add_child(grid)

	_ed_project_id = _add_line_field(grid, "Project ID")
	_ed_ingest_key = _add_line_field(grid, "Ingest Key", true)
	_ed_endpoint = _add_line_field(grid, "Endpoint URL")
	_ed_app_version = _add_line_field(grid, "App Version")

	_opt_env = _add_option_field(grid, "Environment", ENV_OPTIONS)
	_opt_locale = _add_option_field(grid, "Consent Locale", LOCALE_OPTIONS)
	_opt_theme = _add_option_field(grid, "Consent Theme", THEME_OPTIONS)
	grid.add_child(Control.new())
	grid.add_child(Control.new())

	var toggles := HBoxContainer.new()
	toggles.add_theme_constant_override("separation", 16)
	vbox.add_child(toggles)

	_chk_consent = CheckBox.new()
	_chk_consent.text = "Require Consent"
	toggles.add_child(_chk_consent)

	_chk_auto_scenes = CheckBox.new()
	_chk_auto_scenes.text = "Auto-Track Scenes"
	toggles.add_child(_chk_auto_scenes)

	_chk_web_no_gzip = CheckBox.new()
	_chk_web_no_gzip.text = "Disable GZIP on Web Export"
	toggles.add_child(_chk_web_no_gzip)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	vbox.add_child(actions)

	var btn_save := Button.new()
	btn_save.text = "Save to ProjectSettings"
	btn_save.pressed.connect(_save_to_project_settings)
	actions.add_child(btn_save)

	var btn_ping := Button.new()
	btn_ping.text = "Test Connection (/health)"
	btn_ping.pressed.connect(_on_test_connection)
	actions.add_child(btn_ping)

	var btn_create := Button.new()
	btn_create.text = "1-Click Create Project"
	btn_create.pressed.connect(_on_create_project)
	actions.add_child(btn_create)

	var btn_reload := Button.new()
	btn_reload.text = "Reload"
	btn_reload.pressed.connect(_load_from_project_settings)
	actions.add_child(btn_reload)

	_status_label = RichTextLabel.new()
	_status_label.fit_content = true
	_status_label.bbcode_enabled = true
	_status_label.text = "[color=#999999]Ready. Configure settings or test connection.[/color]"
	vbox.add_child(_status_label)


func _build_diagnostics_tab() -> void:
	var vbox := VBoxContainer.new()
	vbox.name = "Diagnostics & Test"
	vbox.add_theme_constant_override("separation", 8)
	_tabs.add_child(vbox)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	vbox.add_child(row)

	var btn_send_test := Button.new()
	btn_send_test.text = "Send Signed Test Event"
	btn_send_test.pressed.connect(_on_send_test_event)
	row.add_child(btn_send_test)

	var btn_reset_local := Button.new()
	btn_reset_local.text = "Reset Local Consent & Offline Queue"
	btn_reset_local.pressed.connect(_on_reset_local_data)
	row.add_child(btn_reset_local)

	_diag_output = TextEdit.new()
	_diag_output.editable = false
	_diag_output.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_diag_output.text = "Click 'Send Signed Test Event' to verify end-to-end HMAC + JSON ingestion."
	vbox.add_child(_diag_output)


func _build_snippets_tab() -> void:
	var vbox := VBoxContainer.new()
	vbox.name = "Code Snippets"
	_tabs.add_child(vbox)

	var text := TextEdit.new()
	text.editable = false
	text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	text.text = """# --- GDScript ---
if not NeocromPulse.has_decided_consent():
\tNeocromPulse.show_consent_dialog(self)

NeocromPulse.track_progression("level_01", "completed", 4500)
NeocromPulse.track_event("boss_defeated", {"boss": "warden"})
NeocromPulse.report_error("Audio pool full", "warning", "res://audio.gd:41")

// --- C# (Godot .NET) ---
using Neocrom.Pulse;
if (!NeocromPulse.HasDecidedConsent())
    NeocromPulse.ShowConsentDialog(this);

NeocromPulse.TrackProgression("level_01", "completed", 4500);
NeocromPulse.TrackEvent("boss_defeated", new Godot.Collections.Dictionary { { "boss", "warden" } });"""
	vbox.add_child(text)


func _add_line_field(grid: GridContainer, label_text: String, secret: bool = false) -> LineEdit:
	var lbl := Label.new()
	lbl.text = label_text
	grid.add_child(lbl)
	var ed := LineEdit.new()
	ed.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ed.secret = secret
	grid.add_child(ed)
	return ed


func _add_option_field(grid: GridContainer, label_text: String, items: Array) -> OptionButton:
	var lbl := Label.new()
	lbl.text = label_text
	grid.add_child(lbl)
	var opt := OptionButton.new()
	opt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for item in items:
		opt.add_item(str(item))
	grid.add_child(opt)
	return opt


func _load_from_project_settings() -> void:
	_ed_project_id.text = str(ProjectSettings.get_setting("neocrom_pulse/project_id", "neocrom-demo"))
	_ed_ingest_key.text = str(ProjectSettings.get_setting("neocrom_pulse/ingest_key", "cp_demo_public_ingest_key_2026"))
	_ed_endpoint.text = str(ProjectSettings.get_setting("neocrom_pulse/endpoint_url", "http://127.0.0.1:4318/api/v1/ingest"))
	_ed_app_version.text = str(ProjectSettings.get_setting("neocrom_pulse/app_version", "0.1.0"))
	_select_option(_opt_env, ENV_OPTIONS, str(ProjectSettings.get_setting("neocrom_pulse/environment", "dev")))
	_select_option(_opt_locale, LOCALE_OPTIONS, str(ProjectSettings.get_setting("neocrom_pulse/consent_locale", "auto")))
	_select_option(_opt_theme, THEME_OPTIONS, str(ProjectSettings.get_setting("neocrom_pulse/consent_theme", "neocrom_dark")))
	_chk_consent.button_pressed = bool(ProjectSettings.get_setting("neocrom_pulse/require_consent", true))
	_chk_auto_scenes.button_pressed = bool(ProjectSettings.get_setting("neocrom_pulse/auto_track_scenes", false))
	_chk_web_no_gzip.button_pressed = bool(ProjectSettings.get_setting("neocrom_pulse/web_disable_gzip", true))


func _select_option(opt: OptionButton, items: Array, value: String) -> void:
	var idx := items.find(value)
	opt.selected = idx if idx >= 0 else 0


func _save_to_project_settings() -> void:
	ProjectSettings.set_setting("neocrom_pulse/project_id", _ed_project_id.text.strip_edges())
	ProjectSettings.set_setting("neocrom_pulse/ingest_key", _ed_ingest_key.text.strip_edges())
	ProjectSettings.set_setting("neocrom_pulse/endpoint_url", _ed_endpoint.text.strip_edges())
	ProjectSettings.set_setting("neocrom_pulse/app_version", _ed_app_version.text.strip_edges())
	ProjectSettings.set_setting("neocrom_pulse/environment", ENV_OPTIONS[_opt_env.selected])
	ProjectSettings.set_setting("neocrom_pulse/consent_locale", LOCALE_OPTIONS[_opt_locale.selected])
	ProjectSettings.set_setting("neocrom_pulse/consent_theme", THEME_OPTIONS[_opt_theme.selected])
	ProjectSettings.set_setting("neocrom_pulse/require_consent", _chk_consent.button_pressed)
	ProjectSettings.set_setting("neocrom_pulse/auto_track_scenes", _chk_auto_scenes.button_pressed)
	ProjectSettings.set_setting("neocrom_pulse/web_disable_gzip", _chk_web_no_gzip.button_pressed)
	var err := ProjectSettings.save()
	if err == OK:
		_set_status("[color=#4ade80]Settings saved to project.godot.[/color]")
	else:
		_set_status("[color=#f87171]Failed to save ProjectSettings (error %d).[/color]" % err)


func _get_api_base() -> String:
	var ep := _ed_endpoint.text.strip_edges()
	var idx := ep.find("/api/v1/")
	if idx >= 0:
		return ep.substr(0, idx)
	return ep.trim_suffix("/")


func _on_test_connection() -> void:
	_pending_action = "health"
	var url := _get_api_base() + "/api/v1/health"
	_set_status("[color=#93c5fd]Pinging %s ...[/color]" % url)
	var err := _http.request(url)
	if err != OK:
		_set_status("[color=#f87171]HTTPRequest error: %d[/color]" % err)


func _on_create_project() -> void:
	_pending_action = "create_project"
	var pid := _ed_project_id.text.strip_edges().to_lower()
	if pid.length() < 3:
		pid = "godot-game-" + str(randi() % 9000 + 1000)
	var url := _get_api_base() + "/api/v1/projects"
	var body := JSON.stringify({
		"id": pid,
		"name": str(ProjectSettings.get_setting("application/config/name", pid)),
		"engine_hint": "godot",
	})
	_set_status("[color=#93c5fd]Creating project '%s' ...[/color]" % pid)
	var err := _http.request(url, PackedStringArray(["Content-Type: application/json"]), HTTPClient.METHOD_POST, body)
	if err != OK:
		_set_status("[color=#f87171]HTTPRequest error: %d[/color]" % err)


func _on_send_test_event() -> void:
	_pending_action = "test_event"
	_save_to_project_settings()
	var pid := _ed_project_id.text.strip_edges()
	var key := _ed_ingest_key.text.strip_edges()
	var url := _ed_endpoint.text.strip_edges()
	var now := int(Time.get_unix_time_from_system())
	var payload := {
		"schema_version": 1,
		"project_id": pid,
		"session_id": "editor_test_" + str(now),
		"sent_at": now,
		"sdk": {"name": "neocrom-pulse-godot-editor", "version": "0.3.0"},
		"engine": {"name": "godot", "version": Engine.get_version_info().get("string", "4.x"), "app_version": _ed_app_version.text, "environment": ENV_OPTIONS[_opt_env.selected]},
		"consent": {"gameplay": true, "performance": false, "errors": false, "hardware": false, "public_benchmark": false},
		"events": [{"type": "custom", "ts": now, "name": "editor_ping"}],
	}
	var raw_bytes := JSON.stringify(payload).to_utf8_buffer()
	var ts_str := str(now)
	var ctx := HMACContext.new()
	ctx.start(HashingContext.HASH_SHA256, key.to_utf8_buffer())
	ctx.update(ts_str.to_utf8_buffer())
	ctx.update(".".to_utf8_buffer())
	ctx.update(raw_bytes)
	var sig := ctx.finish().hex_encode()
	var headers := PackedStringArray([
		"Content-Type: application/json; charset=utf-8",
		"X-Neocrom-Key: " + key,
		"X-Neocrom-Timestamp: " + ts_str,
		"X-Neocrom-Signature: sha256=" + sig,
	])
	_diag_output.text = "Sending signed test event to %s ..." % url
	var err := _http.request_raw(url, headers, HTTPClient.METHOD_POST, raw_bytes)
	if err != OK:
		_diag_output.text = "HTTPRequest error: %d" % err


func _on_reset_local_data() -> void:
	for path in ["user://neocrom_pulse_consent.cfg", "user://neocrom_pulse_queue.jsonl"]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	_diag_output.text = "Cleared local consent & offline queue files in user://."


func _on_http_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	if _pending_action == "health":
		if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
			_set_status("[color=#4ade80]Connected! %s[/color]" % text)
		else:
			_set_status("[color=#f87171]Connection failed (result=%d, status=%d). Is the server running?[/color]" % [result, response_code])
	elif _pending_action == "create_project":
		if result == HTTPRequest.RESULT_SUCCESS and (response_code == 201 or response_code == 200):
			var parsed = JSON.parse_string(text)
			if parsed is Dictionary and parsed.has("project"):
				var p: Dictionary = parsed["project"]
				_ed_project_id.text = str(p.get("id", _ed_project_id.text))
				_ed_ingest_key.text = str(p.get("ingest_key", _ed_ingest_key.text))
				_save_to_project_settings()
				_set_status("[color=#4ade80]Project '%s' created & saved![/color]" % _ed_project_id.text)
				return
		_set_status("[color=#f87171]Create project failed (status=%d): %s[/color]" % [response_code, text])
	elif _pending_action == "test_event":
		_diag_output.text = "Status: %d (result=%d)\nResponse: %s" % [response_code, result, text]


func _set_status(bbcode: String) -> void:
	if _status_label != null:
		_status_label.text = bbcode

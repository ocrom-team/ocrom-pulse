extends CanvasLayer

const ClientScript = preload("res://addons/crom_pulse/crom_pulse_client.gd")

signal consent_saved(consent: Dictionary)

var _client: ClientScript
var _cb_gameplay: CheckButton
var _cb_performance: CheckButton
var _cb_errors: CheckButton
var _cb_hardware: CheckButton
var _cb_public: CheckButton
var _preview_box: TextEdit


func setup(client: ClientScript) -> void:
	_client = client
	layer = 100
	_build_ui()


func _build_ui() -> void:
	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.color = Color(0, 0, 0, 0.82)
	add_child(backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(540, 0)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#0b0b0b")
	style.border_color = Color("#464646")
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(24)
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)

	var root_box := VBoxContainer.new()
	root_box.add_theme_constant_override("separation", 14)
	panel.add_child(root_box)

	var header := Label.new()
	header.text = "NEOCROM // CROM PULSE TELEMETRY"
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color.WHITE)
	root_box.add_child(header)

	var subtitle := Label.new()
	subtitle.text = "Transparent, privacy-first diagnostics. Zero persistent tracking IDs, zero IP logging. Choose what you want to share:"
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.add_theme_color_override("font_color", Color("#b1b1b1"))
	subtitle.add_theme_font_size_override("font_size", 13)
	root_box.add_child(subtitle)

	var current := _client.get_consent()
	_cb_gameplay = _make_toggle("Gameplay & Session Duration (ephemeral random ID)", bool(current.get("gameplay", true)))
	_cb_performance = _make_toggle("Performance Metrics (FPS, RAM, load times)", bool(current.get("performance", true)))
	_cb_errors = _make_toggle("Crash & Error Reports (auto PII-scrubbed)", bool(current.get("errors", true)))
	_cb_hardware = _make_toggle("Coarsened Hardware Tier (OS, RAM/GPU class)", bool(current.get("hardware", true)))
	_cb_public = _make_toggle("Contribute to Public Neocrom Game Database (k-anonymized)", bool(current.get("public_benchmark", false)))

	for cb in [_cb_gameplay, _cb_performance, _cb_errors, _cb_hardware, _cb_public]:
		root_box.add_child(cb)

	_preview_box = TextEdit.new()
	_preview_box.editable = false
	_preview_box.visible = false
	_preview_box.custom_minimum_size = Vector2(0, 140)
	_preview_box.add_theme_font_size_override("font_size", 11)
	root_box.add_child(_preview_box)

	var btn_row := HBoxContainer.new()
	btn_row.add_theme_constant_override("separation", 8)
	root_box.add_child(btn_row)

	var btn_preview := _make_button("Inspect Payload", false)
	btn_preview.pressed.connect(_on_toggle_preview)
	btn_row.add_child(btn_preview)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn_row.add_child(spacer)

	var btn_decline := _make_button("Decline All", false)
	btn_decline.pressed.connect(_on_decline)
	btn_row.add_child(btn_decline)

	var btn_save := _make_button("Save Preferences", false)
	btn_save.pressed.connect(_on_save_selected)
	btn_row.add_child(btn_save)

	var btn_accept := _make_button("Accept & Enable", true)
	btn_accept.pressed.connect(_on_accept_all)
	btn_row.add_child(btn_accept)


func _make_toggle(label_text: String, initial: bool) -> CheckButton:
	var cb := CheckButton.new()
	cb.text = label_text
	cb.button_pressed = initial
	cb.add_theme_color_override("font_color", Color.WHITE)
	cb.add_theme_font_size_override("font_size", 13)
	return cb


func _make_button(label_text: String, primary: bool) -> Button:
	var btn := Button.new()
	btn.text = label_text
	btn.custom_minimum_size = Vector2(0, 38)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color.WHITE if primary else Color("#101010")
	normal.border_color = Color.WHITE if primary else Color("#444444")
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(5)
	normal.set_content_margin_all(10)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_color_override("font_color", Color.BLACK if primary else Color.WHITE)
	return btn


func _on_toggle_preview() -> void:
	_preview_box.visible = not _preview_box.visible
	if _preview_box.visible and _client != null:
		_preview_box.text = JSON.stringify(_client.get_privacy_preview(), "  ")


func _on_decline() -> void:
	_client.decline_all_consent()
	consent_saved.emit(_client.get_consent())
	queue_free()


func _on_save_selected() -> void:
	_client.set_consent(
		_cb_gameplay.button_pressed,
		_cb_performance.button_pressed,
		_cb_errors.button_pressed,
		_cb_hardware.button_pressed,
		_cb_public.button_pressed
	)
	consent_saved.emit(_client.get_consent())
	queue_free()


func _on_accept_all() -> void:
	_client.set_consent(true, true, true, true, _cb_public.button_pressed)
	consent_saved.emit(_client.get_consent())
	queue_free()

extends CanvasLayer

const ClientScript = preload("res://addons/neocrom_pulse/neocrom_pulse_client.gd")
const I18nScript = preload("res://addons/neocrom_pulse/ui/neocrom_pulse_i18n.gd")

signal consent_saved(consent: Dictionary)

const THEME_PRESETS := {
	"neocrom_dark": {
		"backdrop": Color(0.0, 0.0, 0.0, 0.82),
		"panel_bg": Color("#0b0b0b"),
		"panel_border": Color("#464646"),
		"title": Color.WHITE,
		"subtitle": Color("#b1b1b1"),
		"text": Color.WHITE,
		"primary_bg": Color.WHITE,
		"primary_fg": Color.BLACK,
		"secondary_bg": Color("#101010"),
		"secondary_fg": Color.WHITE,
		"secondary_border": Color("#444444"),
	},
	"neocrom_light": {
		"backdrop": Color(0.0, 0.0, 0.0, 0.55),
		"panel_bg": Color("#f6f7f9"),
		"panel_border": Color("#c8cdd5"),
		"title": Color("#111318"),
		"subtitle": Color("#4a5260"),
		"text": Color("#1a1d24"),
		"primary_bg": Color("#111318"),
		"primary_fg": Color.WHITE,
		"secondary_bg": Color.WHITE,
		"secondary_fg": Color("#1a1d24"),
		"secondary_border": Color("#b8c0cc"),
	},
	"high_contrast": {
		"backdrop": Color(0.0, 0.0, 0.0, 0.92),
		"panel_bg": Color("#000000"),
		"panel_border": Color("#ffff00"),
		"title": Color("#ffff00"),
		"subtitle": Color("#ffffff"),
		"text": Color("#ffffff"),
		"primary_bg": Color("#ffff00"),
		"primary_fg": Color("#000000"),
		"secondary_bg": Color("#000000"),
		"secondary_fg": Color("#ffffff"),
		"secondary_border": Color("#ffffff"),
	},
}

var _client: ClientScript
var _locale: String = "auto"
var _theme_preset: String = "neocrom_dark"
var _custom_texts: Dictionary = {}

var _cb_gameplay: CheckButton
var _cb_performance: CheckButton
var _cb_errors: CheckButton
var _cb_hardware: CheckButton
var _cb_public: CheckButton
var _preview_box: TextEdit
var _btn_accept: Button


func setup(client: ClientScript, locale: String = "auto", theme_preset: String = "neocrom_dark", custom_texts: Dictionary = {}) -> void:
	_client = client
	if locale != "auto":
		_locale = locale
	elif _client != null and _client.config != null:
		_locale = _client.config.consent_locale
	if theme_preset != "neocrom_dark":
		_theme_preset = theme_preset
	elif _client != null and _client.config != null:
		_theme_preset = _client.config.consent_theme
	_custom_texts = custom_texts.duplicate()
	layer = 100
	_build_ui()


func _build_ui() -> void:
	for child in get_children():
		child.queue_free()

	var palette: Dictionary = THEME_PRESETS.get(_theme_preset, THEME_PRESETS["neocrom_dark"])
	var texts := I18nScript.get_texts(_locale, _custom_texts)

	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.color = palette["backdrop"]
	add_child(backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.add_child(center)

	var vp_width := 540.0
	if get_viewport() != null:
		vp_width = float(get_viewport().get_visible_rect().size.x)
	var target_width := clampf(vp_width - 32.0, 280.0, 560.0)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(target_width, 0)
	var style := StyleBoxFlat.new()
	style.bg_color = palette["panel_bg"]
	style.border_color = palette["panel_border"]
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(24)
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)

	var root_box := VBoxContainer.new()
	root_box.add_theme_constant_override("separation", 12)
	panel.add_child(root_box)

	var header := Label.new()
	header.text = texts["title"]
	header.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", palette["title"])
	root_box.add_child(header)

	var subtitle := Label.new()
	subtitle.text = texts["subtitle"]
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.add_theme_color_override("font_color", palette["subtitle"])
	subtitle.add_theme_font_size_override("font_size", 13)
	root_box.add_child(subtitle)

	var current := _client.get_consent() if _client != null else {}
	_cb_gameplay = _make_toggle(texts["toggle_gameplay"], bool(current.get("gameplay", true)), palette)
	_cb_performance = _make_toggle(texts["toggle_performance"], bool(current.get("performance", true)), palette)
	_cb_errors = _make_toggle(texts["toggle_errors"], bool(current.get("errors", true)), palette)
	_cb_hardware = _make_toggle(texts["toggle_hardware"], bool(current.get("hardware", true)), palette)
	_cb_public = _make_toggle(texts["toggle_public"], bool(current.get("public_benchmark", false)), palette)

	var toggles: Array[CheckButton] = [_cb_gameplay, _cb_performance, _cb_errors, _cb_hardware, _cb_public]
	for cb in toggles:
		root_box.add_child(cb)

	_preview_box = TextEdit.new()
	_preview_box.editable = false
	_preview_box.visible = false
	_preview_box.custom_minimum_size = Vector2(0, 140)
	_preview_box.add_theme_font_size_override("font_size", 11)
	root_box.add_child(_preview_box)

	var btn_row := HFlowContainer.new()
	btn_row.add_theme_constant_override("h_separation", 8)
	btn_row.add_theme_constant_override("v_separation", 8)
	root_box.add_child(btn_row)

	var btn_preview := _make_button(texts["btn_preview"], false, palette)
	btn_preview.pressed.connect(_on_toggle_preview)
	btn_row.add_child(btn_preview)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn_row.add_child(spacer)

	var btn_decline := _make_button(texts["btn_decline"], false, palette)
	btn_decline.pressed.connect(_on_decline)
	btn_row.add_child(btn_decline)

	var btn_save := _make_button(texts["btn_save"], false, palette)
	btn_save.pressed.connect(_on_save_selected)
	btn_row.add_child(btn_save)

	_btn_accept = _make_button(texts["btn_accept"], true, palette)
	_btn_accept.pressed.connect(_on_accept_all)
	btn_row.add_child(_btn_accept)

	_wire_focus_navigation(toggles, [btn_preview, btn_decline, btn_save, _btn_accept])
	if is_inside_tree():
		_btn_accept.call_deferred("grab_focus")


func _wire_focus_navigation(toggles: Array[CheckButton], buttons: Array[Button]) -> void:
	for i in range(toggles.size()):
		toggles[i].focus_mode = Control.FOCUS_ALL
		if i > 0:
			toggles[i].focus_neighbor_top = toggles[i - 1].get_path()
		if i < toggles.size() - 1:
			toggles[i].focus_neighbor_bottom = toggles[i + 1].get_path()
		else:
			toggles[i].focus_neighbor_bottom = buttons[buttons.size() - 1].get_path()

	for j in range(buttons.size()):
		buttons[j].focus_mode = Control.FOCUS_ALL
		buttons[j].focus_neighbor_top = toggles[toggles.size() - 1].get_path()
		if j > 0:
			buttons[j].focus_neighbor_left = buttons[j - 1].get_path()
		if j < buttons.size() - 1:
			buttons[j].focus_neighbor_right = buttons[j + 1].get_path()


func _make_toggle(label_text: String, initial: bool, palette: Dictionary) -> CheckButton:
	var cb := CheckButton.new()
	cb.text = label_text
	cb.button_pressed = initial
	cb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	cb.add_theme_color_override("font_color", palette["text"])
	cb.add_theme_font_size_override("font_size", 13)
	return cb


func _make_button(label_text: String, primary: bool, palette: Dictionary) -> Button:
	var btn := Button.new()
	btn.text = label_text
	btn.custom_minimum_size = Vector2(0, 38)
	var normal := StyleBoxFlat.new()
	normal.bg_color = palette["primary_bg"] if primary else palette["secondary_bg"]
	normal.border_color = palette["primary_bg"] if primary else palette["secondary_border"]
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(5)
	normal.set_content_margin_all(10)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_color_override("font_color", palette["primary_fg"] if primary else palette["secondary_fg"])
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

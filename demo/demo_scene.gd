extends Control

@onready var status_label: Label = %StatusLabel
@onready var preview_text: TextEdit = %PreviewText


func _ready() -> void:
	CromPulse.consent_changed.connect(_on_consent_changed)
	CromPulse.batch_flushed.connect(_on_batch_flushed)
	_refresh_status()
	if not CromPulse.has_decided_consent():
		CromPulse.show_consent_dialog(self)


func _on_consent_changed(_consent: Dictionary) -> void:
	_refresh_status()


func _on_batch_flushed(event_count: int, success: bool) -> void:
	status_label.text = "Flushed %d event(s) -> %s" % [event_count, "202 Accepted" if success else "Queued offline"]
	_refresh_status()

func _on_consent_btn_pressed() -> void:
	CromPulse.show_consent_dialog(self)

func _on_event_btn_pressed() -> void:
	CromPulse.track_event("real_player_action", {
		"action": "jump_dash",
		"location": "chamber_alpha",
		"combo_count": randi_range(1, 12),
	})
	CromPulse.flush()
	_refresh_status()

func _on_load_btn_pressed() -> void:
	CromPulse.begin_load("level_dungeon_01")
	await get_tree().create_timer(0.25).timeout
	var ms := CromPulse.end_load("level_dungeon_01")
	status_label.text = "Recorded load_time: %d ms" % ms
	CromPulse.flush()
	_refresh_status()

func _on_perf_btn_pressed() -> void:
	var snap := CromPulse.sample_performance()
	status_label.text = "Live Sample: %.1f FPS · %.1f MiB RAM" % [snap.get("fps_avg", 0.0), snap.get("ram_static_mb", 0.0)]
	CromPulse.flush()
	_refresh_status()

func _on_error_btn_pressed() -> void:
	var fp := CromPulse.report_error("Vulkan memory barrier timeout in render_pass_3", "error", "res://rendering/pipeline.gd:78")
	status_label.text = "Reported live error (FP: %s)" % fp
	CromPulse.flush()
	_refresh_status()

func _on_flush_btn_pressed() -> void:
	var started := CromPulse.flush()
	if not started:
		status_label.text = "Queue empty or flush already in flight"
	_refresh_status()


func _refresh_status() -> void:
	var c := CromPulse.get_consent()
	status_label.text = "Consent decided: %s | Queued: %d | Session: %s" % [
		str(c.get("decided", false)),
		CromPulse.get_queued_count(),
		CromPulse.get_session_id().left(8) if not CromPulse.get_session_id().is_empty() else "none",
	]
	_refresh_preview()


func _refresh_preview() -> void:
	preview_text.text = JSON.stringify(CromPulse.get_privacy_preview(), "  ")

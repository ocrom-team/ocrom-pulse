class_name NeocromPulseTransport
extends Node

const ConfigScript = preload("res://addons/neocrom_pulse/neocrom_pulse_config.gd")

signal request_finished(success: bool, status_code: int)

var _config: ConfigScript
var _http: HTTPRequest
var _in_flight: bool = false
var _backoff_sec: float = 0.0
var _next_retry_at: float = 0.0
var _mock_sender: Callable = Callable()


func setup(config: ConfigScript) -> void:
	_config = config
	if _http == null:
		_http = HTTPRequest.new()
		_http.name = "NeocromPulseHTTP"
		_http.timeout = 8.0
		_http.use_threads = true
		add_child(_http)
		_http.request_completed.connect(_on_request_completed)


func set_mock_sender(sender: Callable) -> void:
	_mock_sender = sender


func is_busy() -> bool:
	return _in_flight


func can_attempt_send() -> bool:
	if _in_flight:
		return false
	return Time.get_unix_time_from_system() >= _next_retry_at


static func compute_hmac_signature(secret: String, timestamp_str: String, payload_bytes: PackedByteArray) -> String:
	var ctx := HMACContext.new()
	if ctx.start(HashingContext.HASH_SHA256, secret.to_utf8_buffer()) != OK:
		return ""
	ctx.update(timestamp_str.to_utf8_buffer())
	ctx.update(".".to_utf8_buffer())
	ctx.update(payload_bytes)
	var digest := ctx.finish()
	return digest.hex_encode()


func send_envelope(envelope: Dictionary) -> bool:
	if _config == null:
		return false
	if not can_attempt_send():
		return false

	var json_str := JSON.stringify(envelope)
	var raw_bytes := json_str.to_utf8_buffer()
	var body_bytes := raw_bytes
	var use_gzip := _config.enable_gzip and raw_bytes.size() >= 128

	if use_gzip:
		var compressed := raw_bytes.compress(FileAccess.COMPRESSION_GZIP)
		if compressed.size() > 0 and compressed.size() < raw_bytes.size():
			body_bytes = compressed
		else:
			use_gzip = false

	var timestamp_str := str(int(Time.get_unix_time_from_system()))
	var signature := compute_hmac_signature(_config.ingest_key, timestamp_str, body_bytes)

	var headers := PackedStringArray([
		"Content-Type: application/json; charset=utf-8",
		"X-Neocrom-Key: " + _config.ingest_key,
		"X-Neocrom-Timestamp: " + timestamp_str,
		"X-Neocrom-Signature: sha256=" + signature,
		"User-Agent: NeocromPulse-Godot/0.1.0",
	])
	if use_gzip:
		headers.append("Content-Encoding: gzip")

	if _mock_sender.is_valid():
		var ok: bool = bool(_mock_sender.call(envelope, headers, body_bytes))
		_record_outcome(ok, 202 if ok else 503)
		request_finished.emit(ok, 202 if ok else 503)
		return ok

	if _http == null or not is_inside_tree():
		return false

	_in_flight = true
	var err := _http.request_raw(_config.endpoint_url, headers, HTTPClient.METHOD_POST, body_bytes)
	if err != OK:
		_in_flight = false
		_record_outcome(false, 0)
		request_finished.emit(false, 0)
		return false
	return true


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	_in_flight = false
	var ok := (result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300)
	_record_outcome(ok, response_code)
	request_finished.emit(ok, response_code)


func _record_outcome(ok: bool, status_code: int) -> void:
	if ok:
		_backoff_sec = 0.0
		_next_retry_at = 0.0
		return
	if status_code >= 400 and status_code < 500 and status_code != 429:
		# Client-side validation error: do not spin aggressively
		_backoff_sec = 60.0
	else:
		_backoff_sec = 5.0 if _backoff_sec <= 0.0 else minf(_backoff_sec * 2.0, 300.0)
	var jitter := randf_range(0.0, 2.5)
	_next_retry_at = Time.get_unix_time_from_system() + _backoff_sec + jitter


func persist_offline_events(events: Array) -> void:
	if _config == null or not _config.enable_offline_queue or events.is_empty():
		return
	var path := _config.offline_queue_path
	var existing_lines: Array[String] = []
	if FileAccess.file_exists(path):
		var rf := FileAccess.open(path, FileAccess.READ)
		if rf != null:
			while not rf.eof_reached():
				var line := rf.get_line().strip_edges()
				if not line.is_empty():
					existing_lines.append(line)
			rf.close()

	for ev in events:
		existing_lines.append(JSON.stringify(ev))

	while existing_lines.size() > _config.max_queue_events:
		existing_lines.pop_front()

	var serialized := "\n".join(existing_lines) + "\n"
	while serialized.length() > _config.max_offline_bytes and existing_lines.size() > 1:
		existing_lines.pop_front()
		serialized = "\n".join(existing_lines) + "\n"

	var wf := FileAccess.open(path, FileAccess.WRITE)
	if wf != null:
		wf.store_string(serialized)
		wf.close()


func pop_offline_events(max_count: int) -> Array:
	if _config == null or not _config.enable_offline_queue:
		return []
	var path := _config.offline_queue_path
	if not FileAccess.file_exists(path):
		return []
	var rf := FileAccess.open(path, FileAccess.READ)
	if rf == null:
		return []
	var all_lines: Array[String] = []
	while not rf.eof_reached():
		var line := rf.get_line().strip_edges()
		if not line.is_empty():
			all_lines.append(line)
	rf.close()

	if all_lines.is_empty():
		return []

	var popped: Array = []
	var remaining: Array[String] = []
	for i in range(all_lines.size()):
		if popped.size() < max_count:
			var parsed = JSON.parse_string(all_lines[i])
			if parsed is Dictionary:
				popped.append(parsed)
		else:
			remaining.append(all_lines[i])

	if remaining.is_empty():
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	else:
		var wf := FileAccess.open(path, FileAccess.WRITE)
		if wf != null:
			wf.store_string("\n".join(remaining) + "\n")
			wf.close()
	return popped


func clear_offline_queue() -> void:
	if _config == null:
		return
	var path := _config.offline_queue_path
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

class_name NeocromPulsePerf
extends RefCounted

const RING_CAPACITY := 120

var _frame_ms_ring: PackedFloat32Array
var _scratch_samples: Array[float] = []
var _ring_index: int = 0
var _ring_count: int = 0
var _load_timers: Dictionary = {}


func _init() -> void:
	_frame_ms_ring.resize(RING_CAPACITY)
	_scratch_samples.resize(RING_CAPACITY)


func record_frame(delta_sec: float) -> void:
	if delta_sec <= 0.0:
		return
	var frame_ms := clampf(delta_sec * 1000.0, 0.1, 10000.0)
	_frame_ms_ring[_ring_index] = frame_ms
	_ring_index = (_ring_index + 1) % RING_CAPACITY
	if _ring_count < RING_CAPACITY:
		_ring_count += 1


func begin_load(label: String) -> void:
	var clean_label := label.strip_edges().left(64)
	if clean_label.is_empty():
		clean_label = "default"
	_load_timers[clean_label] = Time.get_ticks_msec()


func end_load(label: String) -> int:
	var clean_label := label.strip_edges().left(64)
	if clean_label.is_empty():
		clean_label = "default"
	if not _load_timers.has(clean_label):
		return -1
	var started_ms: int = int(_load_timers[clean_label])
	_load_timers.erase(clean_label)
	return maxi(0, Time.get_ticks_msec() - started_ms)


func collect_snapshot() -> Dictionary:
	var fps_now := float(Performance.get_monitor(Performance.TIME_FPS))
	var ram_static_mb := float(Performance.get_monitor(Performance.MEMORY_STATIC)) / (1024.0 * 1024.0)
	var ram_peak_mb := float(Performance.get_monitor(Performance.MEMORY_STATIC_MAX)) / (1024.0 * 1024.0)
	var vram_mb := float(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)) / (1024.0 * 1024.0)

	if _ring_count == 0:
		return {
			"fps_avg": snappedf(fps_now, 0.1),
			"fps_min": snappedf(fps_now, 0.1),
			"fps_p50": snappedf(fps_now, 0.1),
			"fps_p95": snappedf(fps_now, 0.1),
			"frame_time_max_ms": 0.0,
			"ram_static_mb": snappedf(ram_static_mb, 0.1),
			"ram_peak_mb": snappedf(ram_peak_mb, 0.1),
			"vram_mb": snappedf(vram_mb, 0.1),
		}

	var samples: Array = _scratch_samples.slice(0, _ring_count)
	var sum_ms := 0.0
	var max_ms := 0.0
	for i in range(_ring_count):
		var ms: float = _frame_ms_ring[i]
		samples[i] = ms
		sum_ms += ms
		if ms > max_ms:
			max_ms = ms

	samples.sort()
	var avg_ms := sum_ms / float(_ring_count)
	var p50_ms: float = samples[int(floor(float(_ring_count - 1) * 0.50))]
	var p95_ms: float = samples[int(floor(float(_ring_count - 1) * 0.95))]

	return {
		"fps_avg": snappedf(1000.0 / maxf(avg_ms, 0.1), 0.1),
		"fps_min": snappedf(1000.0 / maxf(max_ms, 0.1), 0.1),
		"fps_p50": snappedf(1000.0 / maxf(p50_ms, 0.1), 0.1),
		"fps_p95": snappedf(1000.0 / maxf(p95_ms, 0.1), 0.1),
		"frame_time_max_ms": snappedf(max_ms, 0.1),
		"ram_static_mb": snappedf(ram_static_mb, 0.1),
		"ram_peak_mb": snappedf(ram_peak_mb, 0.1),
		"vram_mb": snappedf(vram_mb, 0.1),
	}

class_name CromPulsePrivacy
extends RefCounted

const CONSENT_SECTION := "consent"
const DEFAULT_CONSENT := {
	"decided": false,
	"gameplay": false,
	"performance": false,
	"errors": false,
	"hardware": false,
	"public_benchmark": false,
	"updated_at": 0,
}

static var _email_regex: RegEx
static var _win_user_regex: RegEx
static var _unix_user_regex: RegEx
static var _ip_regex: RegEx
static var _token_regex: RegEx
static var _jwt_regex: RegEx


static func _ensure_regexes() -> void:
	if _email_regex != null:
		return
	_email_regex = RegEx.new()
	_email_regex.compile("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}")
	_win_user_regex = RegEx.new()
	_win_user_regex.compile("(?i)[a-z]:\\\\Users\\\\[^\\\\/\\s]+")
	_unix_user_regex = RegEx.new()
	_unix_user_regex.compile("(?:/home/|/Users/)[^/\\s]+")
	_ip_regex = RegEx.new()
	_ip_regex.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b")
	_token_regex = RegEx.new()
	_token_regex.compile("(?i)(?:bearer|token|key|secret)[=: ]+[a-zA-Z0-9._-]{10,}")
	_jwt_regex = RegEx.new()
	_jwt_regex.compile("\\beyJ[a-zA-Z0-9_-]{8,}\\.[a-zA-Z0-9_-]{8,}\\.[a-zA-Z0-9_-]{8,}\\b")


static func load_consent(path: String) -> Dictionary:
	var result := DEFAULT_CONSENT.duplicate()
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return result
	result["decided"] = bool(cfg.get_value(CONSENT_SECTION, "decided", false))
	result["gameplay"] = bool(cfg.get_value(CONSENT_SECTION, "gameplay", false))
	result["performance"] = bool(cfg.get_value(CONSENT_SECTION, "performance", false))
	result["errors"] = bool(cfg.get_value(CONSENT_SECTION, "errors", false))
	result["hardware"] = bool(cfg.get_value(CONSENT_SECTION, "hardware", false))
	result["public_benchmark"] = bool(cfg.get_value(CONSENT_SECTION, "public_benchmark", false))
	result["updated_at"] = int(cfg.get_value(CONSENT_SECTION, "updated_at", 0))
	return result


static func save_consent(path: String, consent: Dictionary) -> int:
	var cfg := ConfigFile.new()
	for key in DEFAULT_CONSENT:
		cfg.set_value(CONSENT_SECTION, key, consent.get(key, DEFAULT_CONSENT[key]))
	return cfg.save(path)


static func clear_consent(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


static func scrub_text(input_text: String, max_len: int = 512) -> String:
	if input_text.is_empty():
		return ""
	_ensure_regexes()
	var out := input_text.strip_edges()
	out = _email_regex.sub(out, "[redacted-email]", true)
	out = _win_user_regex.sub(out, "C:\\Users\\[user]", true)
	out = _unix_user_regex.sub(out, "/home/[user]", true)
	out = _ip_regex.sub(out, "[redacted-ip]", true)
	out = _token_regex.sub(out, "[redacted-secret]", true)
	out = _jwt_regex.sub(out, "[redacted-jwt]", true)
	if out.length() > max_len:
		out = out.substr(0, max_len - 3) + "..."
	return out


static func scrub_properties(props: Dictionary, max_keys: int = 16) -> Dictionary:
	var clean := {}
	var count := 0
	for raw_key in props:
		if count >= max_keys:
			break
		var key := str(raw_key).strip_edges().left(48)
		if key.is_empty():
			continue
		var lower := key.to_lower()
		if lower in ["email", "password", "token", "secret", "ip", "username", "user_name", "address", "phone", "auth", "cookie", "jwt"]:
			continue
		var val = props[raw_key]
		if val is float:
			if is_nan(val) or is_inf(val):
				continue
			clean[key] = snappedf(val, 0.0001)
		elif val is bool or val is int:
			clean[key] = val
		elif val is String:
			clean[key] = scrub_text(val, 128)
		else:
			clean[key] = scrub_text(str(val), 128)
		count += 1
	return clean


static func collect_anonymized_hardware() -> Dictionary:
	var os_name := OS.get_name()
	var os_family := "Other"
	match os_name:
		"Windows": os_family = "Windows"
		"Linux", "FreeBSD", "NetBSD", "OpenBSD", "BSD": os_family = "Linux"
		"macOS": os_family = "macOS"
		"Android": os_family = "Android"
		"iOS": os_family = "iOS"
		"Web": os_family = "Web"

	var arch_raw := Engine.get_architecture_name().to_lower()
	var arch := "other"
	if arch_raw.contains("x86_64") or arch_raw.contains("amd64"):
		arch = "x86_64"
	elif arch_raw.contains("arm64") or arch_raw.contains("aarch64"):
		arch = "arm64"
	elif arch_raw.contains("x86") or arch_raw.contains("32"):
		arch = "x86"
	elif arch_raw.contains("wasm"):
		arch = "wasm32"

	var cores := OS.get_processor_count()
	var cpu_bucket := "1-2"
	if cores >= 17:
		cpu_bucket = "17+"
	elif cores >= 9:
		cpu_bucket = "9-16"
	elif cores >= 5:
		cpu_bucket = "5-8"
	elif cores >= 3:
		cpu_bucket = "3-4"

	var mem_info := OS.get_memory_info()
	var physical_bytes: int = int(mem_info.get("physical", 0))
	var ram_gb := float(physical_bytes) / (1024.0 * 1024.0 * 1024.0)
	var ram_bucket := "<=4"
	if ram_gb >= 48.0:
		ram_bucket = "64+"
	elif ram_gb >= 24.0:
		ram_bucket = "32"
	elif ram_gb >= 12.0:
		ram_bucket = "16"
	elif ram_gb >= 6.0:
		ram_bucket = "8"

	var adapter_vendor := RenderingServer.get_video_adapter_vendor().to_lower()
	var adapter_name := RenderingServer.get_video_adapter_name()
	var gpu_vendor := "Other"
	if adapter_vendor.contains("nvidia") or adapter_name.to_lower().contains("nvidia") or adapter_name.to_lower().contains("geforce") or adapter_name.to_lower().contains("rtx"):
		gpu_vendor = "NVIDIA"
	elif adapter_vendor.contains("amd") or adapter_vendor.contains("ati") or adapter_name.to_lower().contains("radeon"):
		gpu_vendor = "AMD"
	elif adapter_vendor.contains("intel") or adapter_name.to_lower().contains("intel"):
		gpu_vendor = "Intel"
	elif adapter_vendor.contains("apple") or adapter_name.to_lower().contains("apple"):
		gpu_vendor = "Apple"
	elif adapter_vendor.contains("arm") or adapter_name.to_lower().contains("mali"):
		gpu_vendor = "ARM"
	elif adapter_vendor.contains("qualcomm") or adapter_name.to_lower().contains("adreno"):
		gpu_vendor = "Qualcomm"
	elif adapter_name.to_lower().contains("llvmpipe") or adapter_name.to_lower().contains("swiftshader") or adapter_name.is_empty():
		gpu_vendor = "Software"

	var gpu_tier := _coarsen_gpu_name(adapter_name, gpu_vendor)

	var screen_size := DisplayServer.screen_get_size() if DisplayServer.get_name() != "headless" else Vector2i(1920, 1080)
	var min_dim := mini(screen_size.x, screen_size.y)
	var display_bucket := "<720p"
	if min_dim >= 2000:
		display_bucket = "4K+"
	elif min_dim >= 1350:
		display_bucket = "1440p"
	elif min_dim >= 1000:
		display_bucket = "1080p"
	elif min_dim >= 700:
		display_bucket = "720p"

	var raw_locale := OS.get_locale_language().to_lower()
	var lang := raw_locale.substr(0, 2) if raw_locale.length() >= 2 else "en"

	return {
		"os_family": os_family,
		"arch": arch,
		"cpu_cores_bucket": cpu_bucket,
		"ram_gb_bucket": ram_bucket,
		"gpu_vendor": gpu_vendor,
		"gpu_tier": gpu_tier,
		"display_bucket": display_bucket,
		"locale_lang": lang,
	}


static func _coarsen_gpu_name(raw_name: String, vendor: String) -> String:
	var lower := raw_name.to_lower()
	if vendor == "Software":
		return "Headless / Software"
	if vendor == "Apple":
		if lower.contains("m4"): return "Apple M4 Series"
		if lower.contains("m3"): return "Apple M3 Series"
		if lower.contains("m2"): return "Apple M2 Series"
		if lower.contains("m1"): return "Apple M1 Series"
		return "Apple GPU"
	if vendor == "NVIDIA":
		if lower.contains("rtx 50"): return "NVIDIA RTX 50-Series"
		if lower.contains("rtx 40"): return "NVIDIA RTX 40-Series"
		if lower.contains("rtx 30"): return "NVIDIA RTX 30-Series"
		if lower.contains("rtx 20"): return "NVIDIA RTX 20-Series"
		if lower.contains("gtx 16"): return "NVIDIA GTX 16-Series"
		if lower.contains("gtx"): return "NVIDIA GTX Legacy"
		return "NVIDIA GPU"
	if vendor == "AMD":
		if lower.contains("rx 8") or lower.contains("rx 9"): return "AMD Radeon RX 8000/9000"
		if lower.contains("rx 7"): return "AMD Radeon RX 7000"
		if lower.contains("rx 6"): return "AMD Radeon RX 6000"
		if lower.contains("radeon"): return "AMD Radeon"
		return "AMD GPU"
	if vendor == "Intel":
		if lower.contains("arc"): return "Intel Arc"
		if lower.contains("iris") or lower.contains("uhd"): return "Intel Integrated"
		return "Intel GPU"
	return vendor + " GPU"

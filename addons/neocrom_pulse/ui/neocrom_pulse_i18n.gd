class_name NeocromPulseI18n
extends RefCounted

const TRANSLATIONS := {
	"en": {
		"title": "NEOCROM PULSE TELEMETRY",
		"subtitle": "Transparent, privacy-first diagnostics. Zero persistent tracking IDs, zero IP logging. Choose what you want to share:",
		"toggle_gameplay": "Gameplay & Session Duration (ephemeral random ID)",
		"toggle_performance": "Performance Metrics (FPS, RAM, load times)",
		"toggle_errors": "Crash & Error Reports (auto PII-scrubbed)",
		"toggle_hardware": "Coarsened Hardware Tier (OS, RAM/GPU class)",
		"toggle_public": "Contribute to Public Neocrom Game Database (k-anonymized)",
		"btn_preview": "Inspect Payload",
		"btn_decline": "Decline All",
		"btn_save": "Save Preferences",
		"btn_accept": "Accept & Enable",
	},
	"de": {
		"title": "NEOCROM PULSE TELEMETRIE",
		"subtitle": "Transparente, datenschutzfreundliche Diagnose. Keine dauerhaften Tracking-IDs, keine IP-Speicherung. Wähle, was du teilen möchtest:",
		"toggle_gameplay": "Gameplay & Sitzungsdauer (flüchtige Zufalls-ID)",
		"toggle_performance": "Leistungsmetriken (FPS, RAM, Ladezeiten)",
		"toggle_errors": "Absturz- & Fehlerberichte (automatisch PII-bereinigt)",
		"toggle_hardware": "Vergröberte Hardware-Klasse (OS, RAM/GPU-Klasse)",
		"toggle_public": "Zur öffentlichen Neocrom Game Database beitragen (k-anonymisiert)",
		"btn_preview": "Payload ansehen",
		"btn_decline": "Alle ablehnen",
		"btn_save": "Auswahl speichern",
		"btn_accept": "Akzeptieren & aktivieren",
	},
	"es": {
		"title": "TELEMETRÍA NEOCROM PULSE",
		"subtitle": "Diagnóstico transparente y privado. Sin IDs persistentes ni registro de IP. Elige qué compartir:",
		"toggle_gameplay": "Juego y duración de sesión (ID aleatoria efímera)",
		"toggle_performance": "Métricas de rendimiento (FPS, RAM, tiempos de carga)",
		"toggle_errors": "Informes de errores y fallos (sin datos personales)",
		"toggle_hardware": "Perfil de hardware agrupado (SO, clase RAM/GPU)",
		"toggle_public": "Contribuir a la base pública Neocrom (k-anonimizada)",
		"btn_preview": "Ver datos",
		"btn_decline": "Rechazar todo",
		"btn_save": "Guardar selección",
		"btn_accept": "Aceptar y activar",
	},
	"fr": {
		"title": "TÉLÉMÉTRIE NEOCROM PULSE",
		"subtitle": "Diagnostics transparents et respectueux de la vie privée. Aucun identifiant persistant ni journalisation IP.",
		"toggle_gameplay": "Gameplay et durée de session (ID aléatoire éphémère)",
		"toggle_performance": "Métriques de performance (FPS, RAM, chargements)",
		"toggle_errors": "Rapports d'erreurs et plantages (nettoyés auto)",
		"toggle_hardware": "Catégorie matérielle agrégée (OS, RAM/GPU)",
		"toggle_public": "Contribuer à la base publique Neocrom (k-anonymisée)",
		"btn_preview": "Inspecter",
		"btn_decline": "Tout refuser",
		"btn_save": "Enregistrer",
		"btn_accept": "Accepter et activer",
	},
	"pt": {
		"title": "TELEMETRIA NEOCROM PULSE",
		"subtitle": "Diagnóstico transparente com foco em privacidade. Sem IDs persistentes nem registro de IP.",
		"toggle_gameplay": "Jogabilidade e duração da sessão (ID aleatório efêmero)",
		"toggle_performance": "Métricas de desempenho (FPS, RAM, carregamento)",
		"toggle_errors": "Relatórios de erros e falhas (limpeza automática de PII)",
		"toggle_hardware": "Classe de hardware agrupada (SO, RAM/GPU)",
		"toggle_public": "Contribuir para a base pública Neocrom (k-anonimizada)",
		"btn_preview": "Ver payload",
		"btn_decline": "Recusar tudo",
		"btn_save": "Salvar preferências",
		"btn_accept": "Aceitar e ativar",
	},
	"ja": {
		"title": "NEOCROM PULSE テレメトリ",
		"subtitle": "プライバシー優先の透明な診断機能です。永続的な追跡IDやIP記録はありません。共有項目を選択してください：",
		"toggle_gameplay": "ゲームプレイとセッション時間（一時ランダムID）",
		"toggle_performance": "パフォーマンス指標（FPS・RAM・ロード時間）",
		"toggle_errors": "クラッシュ・エラー報告（個人情報自動除去）",
		"toggle_hardware": "概算ハードウェア情報（OS・RAM/GPUクラス）",
		"toggle_public": "Neocrom公開ゲームDBへ貢献（k-匿名化）",
		"btn_preview": "データ確認",
		"btn_decline": "すべて拒否",
		"btn_save": "設定を保存",
		"btn_accept": "同意して有効化",
	},
	"zh": {
		"title": "NEOCROM PULSE 遥测",
		"subtitle": "透明且隐私优先的诊断系统。无持久追踪ID，不记录IP地址。请选择您愿意分享的数据：",
		"toggle_gameplay": "游戏玩法与会话时长（临时随机ID）",
		"toggle_performance": "性能指标（FPS、内存、加载时间）",
		"toggle_errors": "崩溃与错误报告（自动清除个人隐私）",
		"toggle_hardware": "粗粒度硬件分级（系统、内存/显卡级别）",
		"toggle_public": "贡献至 Neocrom 公开游戏数据库（k-匿名化）",
		"btn_preview": "查看载荷",
		"btn_decline": "全部拒绝",
		"btn_save": "保存偏好",
		"btn_accept": "同意并启用",
	},
}


static func resolve_locale(requested: String = "auto") -> String:
	var lang := requested.strip_edges().to_lower()
	if lang.is_empty() or lang == "auto":
		lang = OS.get_locale_language().to_lower()
	lang = lang.substr(0, 2)
	if TRANSLATIONS.has(lang):
		return lang
	return "en"


static func get_texts(requested_locale: String = "auto", overrides: Dictionary = {}) -> Dictionary:
	var lang := resolve_locale(requested_locale)
	var base: Dictionary = TRANSLATIONS["en"].duplicate()
	if lang != "en":
		var localized: Dictionary = TRANSLATIONS[lang]
		for k in localized:
			base[k] = localized[k]
	for k in overrides:
		if base.has(k):
			base[k] = str(overrides[k])
	return base

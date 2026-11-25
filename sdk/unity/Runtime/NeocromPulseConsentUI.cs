using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Neocrom.Pulse
{
    /// <summary>
    /// Zero-asset monochrome Neocrom Consent Dialog built programmatically with Unity UI.
    /// </summary>
    public sealed class NeocromPulseConsentUI : MonoBehaviour
    {
        private NeocromPulseClient _client;
        private Toggle _tgGameplay;
        private Toggle _tgPerformance;
        private Toggle _tgErrors;
        private Toggle _tgHardware;
        private Toggle _tgPublic;
        private Text _previewText;
        private GameObject _previewContainer;

        public static void Show(NeocromPulseClient client)
        {
            if (EventSystem.current == null)
            {
                var es = new GameObject("[NeocromPulseEventSystem]");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }
            var go = new GameObject("[NeocromPulseConsentDialog]");
            var ui = go.AddComponent<NeocromPulseConsentUI>();
            ui.Build(client);
        }

        private void Build(NeocromPulseClient client)
        {
            _client = client;
            var current = client.GetConsent();

            var canvas = gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 9999;
            var scaler = gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            gameObject.AddComponent<GraphicRaycaster>();

            var backdrop = CreatePanel(transform, new Color(0f, 0f, 0f, 0.85f));
            StretchFull(backdrop.rectTransform);

            var modal = CreatePanel(backdrop.transform, new Color(0.045f, 0.045f, 0.045f, 1f));
            var modalRect = modal.rectTransform;
            modalRect.sizeDelta = new Vector2(560, 440);
            var outline = modal.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0.27f, 0.27f, 0.27f, 1f);
            outline.effectDistance = new Vector2(1, 1);

            var layout = modal.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(24, 24, 24, 24);
            layout.spacing = 10;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            CreateLabel(modal.transform, "NEOCROM PULSE TELEMETRY", 18, Color.white, FontStyle.Bold);
            CreateLabel(modal.transform, "Transparent, privacy-first diagnostics. Zero persistent tracking IDs, zero IP logging.", 13, new Color(0.7f, 0.7f, 0.7f, 1f), FontStyle.Normal);

            _tgGameplay = CreateToggle(modal.transform, "Gameplay & Session Duration (ephemeral random ID)", !current.decided || current.gameplay);
            _tgPerformance = CreateToggle(modal.transform, "Performance Metrics (FPS, RAM, load times)", !current.decided || current.performance);
            _tgErrors = CreateToggle(modal.transform, "Crash & Error Reports (auto PII-scrubbed)", !current.decided || current.errors);
            _tgHardware = CreateToggle(modal.transform, "Coarsened Hardware Tier (OS, RAM/GPU class)", !current.decided || current.hardware);
            _tgPublic = CreateToggle(modal.transform, "Contribute to Public Neocrom Game Database (k-anonymized)", current.publicBenchmark);

            _previewContainer = CreatePanel(modal.transform, new Color(0.07f, 0.07f, 0.07f, 1f)).gameObject;
            var prevLe = _previewContainer.AddComponent<LayoutElement>();
            prevLe.preferredHeight = 90;
            _previewText = CreateLabel(_previewContainer.transform, "", 11, new Color(0.85f, 0.85f, 0.85f, 1f), FontStyle.Normal);
            StretchFull(_previewText.rectTransform);
            _previewContainer.SetActive(false);

            var btnRow = new GameObject("Buttons").AddComponent<RectTransform>();
            btnRow.SetParent(modal.transform, false);
            var hLayout = btnRow.gameObject.AddComponent<HorizontalLayoutGroup>();
            hLayout.spacing = 8;
            hLayout.childForceExpandWidth = true;
            btnRow.gameObject.AddComponent<LayoutElement>().preferredHeight = 38;

            CreateButton(btnRow, "Inspect Payload", false, () =>
            {
                _previewContainer.SetActive(!_previewContainer.activeSelf);
                if (_previewContainer.activeSelf) _previewText.text = _client.GetPrivacyPreviewJson();
            });
            CreateButton(btnRow, "Decline All", false, () =>
            {
                _client.SetConsent(false, false, false, false, false);
                Destroy(gameObject);
            });
            CreateButton(btnRow, "Save", false, () =>
            {
                _client.SetConsent(_tgGameplay.isOn, _tgPerformance.isOn, _tgErrors.isOn, _tgHardware.isOn, _tgPublic.isOn);
                Destroy(gameObject);
            });
            CreateButton(btnRow, "Accept & Enable", true, () =>
            {
                _client.SetConsent(true, true, true, true, _tgPublic.isOn);
                Destroy(gameObject);
            });
        }

        private static Image CreatePanel(Transform parent, Color color)
        {
            var go = new GameObject("Panel");
            go.transform.SetParent(parent, false);
            var img = go.AddComponent<Image>();
            img.color = color;
            return img;
        }

        private static Text CreateLabel(Transform parent, string text, int size, Color color, FontStyle style)
        {
            var go = new GameObject("Label");
            go.transform.SetParent(parent, false);
            var txt = go.AddComponent<Text>();
            txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.text = text;
            txt.fontSize = size;
            txt.color = color;
            txt.fontStyle = style;
            txt.horizontalOverflow = HorizontalWrapMode.Wrap;
            txt.verticalOverflow = VerticalWrapMode.Overflow;
            return txt;
        }

        private static Toggle CreateToggle(Transform parent, string label, bool initial)
        {
            var row = new GameObject("ToggleRow");
            row.transform.SetParent(parent, false);
            row.AddComponent<LayoutElement>().preferredHeight = 24;
            var tg = row.AddComponent<Toggle>();
            tg.isOn = initial;

            var box = CreatePanel(row.transform, new Color(0.15f, 0.15f, 0.15f, 1f));
            box.rectTransform.anchorMin = new Vector2(0, 0.5f);
            box.rectTransform.anchorMax = new Vector2(0, 0.5f);
            box.rectTransform.anchoredPosition = new Vector2(10, 0);
            box.rectTransform.sizeDelta = new Vector2(18, 18);

            var check = CreatePanel(box.transform, Color.white);
            check.rectTransform.sizeDelta = new Vector2(10, 10);
            tg.targetGraphic = box;
            tg.graphic = check;

            var lbl = CreateLabel(row.transform, label, 13, Color.white, FontStyle.Normal);
            lbl.rectTransform.anchorMin = new Vector2(0, 0);
            lbl.rectTransform.anchorMax = new Vector2(1, 1);
            lbl.rectTransform.offsetMin = new Vector2(28, 0);
            lbl.rectTransform.offsetMax = Vector2.zero;
            lbl.alignment = TextAnchor.MiddleLeft;
            return tg;
        }

        private static void CreateButton(Transform parent, string label, bool primary, UnityEngine.Events.UnityAction onClick)
        {
            var bg = CreatePanel(parent, primary ? Color.white : new Color(0.08f, 0.08f, 0.08f, 1f));
            var btn = bg.gameObject.AddComponent<Button>();
            btn.onClick.AddListener(onClick);
            var txt = CreateLabel(bg.transform, label, 13, primary ? Color.black : Color.white, FontStyle.Bold);
            txt.alignment = TextAnchor.MiddleCenter;
            StretchFull(txt.rectTransform);
        }

        private static void StretchFull(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }
    }
}

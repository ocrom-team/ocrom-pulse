using System.IO;
using UnityEditor;
using UnityEngine;

namespace Neocrom.Pulse.Editor
{
    public sealed class NeocromPulseEditorWindow : EditorWindow
    {
        private const string ConfigAssetPath = "Assets/Resources/NeocromPulseConfig.asset";

        [MenuItem("Tools/Neocrom/Neocrom Pulse Setup")]
        public static void ShowWindow()
        {
            var win = GetWindow<NeocromPulseEditorWindow>("Neocrom Pulse");
            win.minSize = new Vector2(440, 340);
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("NEOCROM PULSE", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Privacy-first game analytics & telemetry for Unity. Zero scene setup required — NeocromPulse auto-initializes at runtime.", MessageType.Info);

            EditorGUILayout.Space(8);
            var existing = Resources.Load<NeocromPulseConfig>("NeocromPulseConfig");
            if (existing == null)
            {
                if (GUILayout.Button("Create NeocromPulseConfig in Assets/Resources/", GUILayout.Height(34)))
                {
                    CreateConfigAsset();
                }
            }
            else
            {
                if (GUILayout.Button("Select NeocromPulseConfig Asset", GUILayout.Height(30)))
                {
                    Selection.activeObject = existing;
                    EditorGUIUtility.PingObject(existing);
                }
            }

            EditorGUILayout.Space(12);
            EditorGUILayout.LabelField("Quick Integration (C#)", EditorStyles.boldLabel);
            EditorGUILayout.TextArea(
                "if (!NeocromPulse.HasDecidedConsent()) NeocromPulse.ShowConsentDialog();\n" +
                "NeocromPulse.TrackProgression(\"level_01\", \"completed\", 4200);\n" +
                "NeocromPulse.Measure(\"world_gen\", () => GenerateMap());\n" +
                "NeocromPulse.LoadSceneAsync(\"ArenaScene\");",
                GUILayout.Height(78)
            );
        }

        private static void CreateConfigAsset()
        {
            Directory.CreateDirectory("Assets/Resources");
            var asset = CreateInstance<NeocromPulseConfig>();
            AssetDatabase.CreateAsset(asset, ConfigAssetPath);
            AssetDatabase.SaveAssets();
            Selection.activeObject = asset;
            EditorGUIUtility.PingObject(asset);
        }
    }
}

using System.IO;
using UnityEditor;
using UnityEngine;

namespace Neocrom.CromPulse.Editor
{
    public sealed class CromPulseEditorWindow : EditorWindow
    {
        private const string ConfigAssetPath = "Assets/Resources/CromPulseConfig.asset";

        [MenuItem("Tools/Neocrom/Crom Pulse Setup")]
        public static void ShowWindow()
        {
            var win = GetWindow<CromPulseEditorWindow>("Crom Pulse");
            win.minSize = new Vector2(440, 340);
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("NEOCROM // CROM PULSE", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Privacy-first game analytics & telemetry for Unity. Zero scene setup required — CromPulse auto-initializes at runtime.", MessageType.Info);

            EditorGUILayout.Space(8);
            var existing = Resources.Load<CromPulseConfig>("CromPulseConfig");
            if (existing == null)
            {
                if (GUILayout.Button("Create CromPulseConfig in Assets/Resources/", GUILayout.Height(34)))
                {
                    CreateConfigAsset();
                }
            }
            else
            {
                if (GUILayout.Button("Select CromPulseConfig Asset", GUILayout.Height(30)))
                {
                    Selection.activeObject = existing;
                    EditorGUIUtility.PingObject(existing);
                }
            }

            EditorGUILayout.Space(12);
            EditorGUILayout.LabelField("Quick Integration (C#)", EditorStyles.boldLabel);
            EditorGUILayout.TextArea(
                "if (!CromPulse.HasDecidedConsent()) CromPulse.ShowConsentDialog();\n" +
                "CromPulse.TrackProgression(\"level_01\", \"completed\", 4200);\n" +
                "CromPulse.Measure(\"world_gen\", () => GenerateMap());\n" +
                "CromPulse.LoadSceneAsync(\"ArenaScene\");",
                GUILayout.Height(78)
            );
        }

        private static void CreateConfigAsset()
        {
            Directory.CreateDirectory("Assets/Resources");
            var asset = CreateInstance<CromPulseConfig>();
            AssetDatabase.CreateAsset(asset, ConfigAssetPath);
            AssetDatabase.SaveAssets();
            Selection.activeObject = asset;
            EditorGUIUtility.PingObject(asset);
        }
    }
}

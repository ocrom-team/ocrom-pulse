using Godot;
using Godot.Collections;

namespace Neocrom.Pulse
{
    /// <summary>
    /// Typed C# bridge for the NeocromPulse GDScript autoload singleton.
    /// Drop-in compatible with Godot 4 .NET projects without duplicating transport/privacy logic.
    /// </summary>
    public static class NeocromPulse
    {
        private static Node GetAutoload()
        {
            if (Engine.GetMainLoop() is SceneTree tree && tree.Root != null)
            {
                return tree.Root.GetNodeOrNull("NeocromPulse");
            }
            return null;
        }

        public static bool HasDecidedConsent()
        {
            var node = GetAutoload();
            return node != null && node.Call("has_decided_consent").AsBool();
        }

        public static Node ShowConsentDialog(Node parent = null, string locale = "auto", string themePreset = "neocrom_dark")
        {
            var node = GetAutoload();
            if (node == null) return null;
            return node.Call("show_consent_dialog", parent, locale, themePreset).As<Node>();
        }

        public static void GrantAllConsent(bool includePublicBenchmark = true)
        {
            GetAutoload()?.Call("grant_all_consent", includePublicBenchmark);
        }

        public static void DeclineAllConsent()
        {
            GetAutoload()?.Call("decline_all_consent");
        }

        public static void SetConsent(bool gameplay, bool performance, bool errors, bool hardware, bool publicBenchmark = false)
        {
            GetAutoload()?.Call("set_consent", gameplay, performance, errors, hardware, publicBenchmark);
        }

        public static void TrackEvent(string eventName, Dictionary props = null)
        {
            GetAutoload()?.Call("track_event", eventName, props ?? new Dictionary());
        }

        public static void TrackProgression(string level, string status, int score = -1)
        {
            GetAutoload()?.Call("track_progression", level, status, score);
        }

        public static void TrackSetting(string settingName, Variant value)
        {
            GetAutoload()?.Call("track_setting", settingName, value);
        }

        public static void BeginLoad(string zoneName)
        {
            GetAutoload()?.Call("begin_load", zoneName);
        }

        public static int EndLoad(string zoneName)
        {
            var node = GetAutoload();
            return node != null ? node.Call("end_load", zoneName).AsInt32() : -1;
        }

        public static string ReportError(string message, string severity = "error", string source = "")
        {
            var node = GetAutoload();
            return node != null ? node.Call("report_error", message, severity, source).AsString() : string.Empty;
        }

        public static bool Flush()
        {
            var node = GetAutoload();
            return node != null && node.Call("flush").AsBool();
        }

        public static Dictionary GetDiagnostics()
        {
            var node = GetAutoload();
            return node != null ? node.Call("get_diagnostics").AsGodotDictionary() : new Dictionary();
        }
    }
}

import { useSettingsStore } from "../store/settingsStore";
import { useCallback } from "react";
import {
  Brain, Cpu, Thermometer, Layers, Palette, Monitor, Type, Code, PlugZap,
  Eye, EyeOff, RefreshCw, CheckCircle2, Gauge,
  Sliders, Key, Globe, Command, Minimize2, Bell,
  MessageSquareWarning,
} from "lucide-react";



export default function UserProfilePanel(props: { onBack: () => void }): JSX.Element {
  return (
    <section className="flex h-full flex-col">
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--border-panel)" }}
      >
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            User profile
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Manage your account details and preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onBack}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{
            border: "1px solid var(--border-panel)",
            background: "transparent",
            color: "var(--text-primary)",
          }}
        >
          Back to chat
        </button>
      </header>
        <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex flex-col gap-6">
                <div>
                    <h3 className="text-md font-medium" style={{ color: "var(--text-primary)" }}>
                        Account Information
                    </h3>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        View and edit your account details.
                    </p>
                </div>
                <div>
                    <textarea
                        className="w-full rounded-md p-3 text-sm resize-none outline-none"
                        style={{
                            backgroundColor: 'var(--bg-panel)',
                            border: '1px solid var(--border-panel)',
                            color: 'var(--text-primary)',
                            fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif',
                        }}
                        inputMode="text"
                        placeholder="Write your First Name here..."

                    />
                    First Name
                    <textarea
                        className="w-full rounded-md p-3 text-sm resize-none outline-none mt-2"
                        style={{
                            backgroundColor: 'var(--bg-panel)',
                            border: '1px solid var(--border-panel)',
                            color: 'var(--text-primary)',
                            fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif',
                        }}
                        inputMode="text"
                        placeholder="Write your Last Name here..."
                    />
                    Last Name
                        
                </div>
                <div>
                    <h3 className="text-md font-medium" style={{ color: "var(--text-primary)" }}>
                        Preferences
                    </h3>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Customize your experience and settings.
                    </p>
                </div>
                <div>
                    <h3 className="text-md font-medium" style={{ color: "var(--text-primary)" }}>
                        Security
                    </h3>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Manage your password and security settings.
                    </p>
                </div>
            </div>
        </div>
    </section>  

);
}
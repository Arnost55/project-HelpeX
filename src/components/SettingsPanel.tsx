import { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { checkProviderHealth, listProviderModels } from "../api/providers";
import { getAvailableThemes, type ThemeDefinition } from "../api/settingsApi";
import {
  Brain, Cpu, Thermometer, Layers, Palette, Monitor, Type, Code, PlugZap,
  Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Wifi, Gauge,
  Settings2, Sliders, Key, Globe, Command, Minimize2, Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Provider = "openai" | "claude" | "ollama" | "groq" | "together";
type SettingsTab = "ai" | "integration" | "appearance" | "system";

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "ai", label: "AI Engine", icon: Brain },
  { id: "integration", label: "Integration", icon: PlugZap },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "system", label: "System", icon: Monitor },
];

const KNOWN_THUMB_CLASSES: Record<string, string> = {
  default: "theme-thumb-default",
  "community-blue-neon": "theme-thumb-blue-neon",
};

function thumbClass(id: string): string {
  return KNOWN_THUMB_CLASSES[id] ?? "";
}

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
        <Icon size={16} className="text-cyan-400" />
      </div>
      <div>
        <h3 className="text-[#F0F6FC] font-semibold text-sm">{title}</h3>
        <p className="text-[#8B949E] text-xs">Control Center</p>
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[#8B949E] text-xs font-semibold uppercase tracking-[0.1em]">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-[#30363D] to-transparent" />
    </div>
  );
}

export default function SettingsPanel(props: { activeTab: SettingsTab; onTabChange: (tab: SettingsTab) => void; onThemeChange?: (theme: ThemeDefinition) => void }): JSX.Element {
  const provider = useSettingsStore((s) => s.provider);
  const model = useSettingsStore((s) => s.model);
  const temperature = useSettingsStore((s) => s.temperature);
  const maxTokens = useSettingsStore((s) => s.maxTokens);
  const theme = useSettingsStore((s) => s.theme);
  const openAiApiKey = useSettingsStore((s) => s.openAiApiKey);
  const claudeApiKey = useSettingsStore((s) => s.claudeApiKey);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const togetherApiKey = useSettingsStore((s) => s.togetherApiKey);
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl);
  const groqBaseUrl = useSettingsStore((s) => s.groqBaseUrl);
  const togetherBaseUrl = useSettingsStore((s) => s.togetherBaseUrl);
  const fallbackProvider = useSettingsStore((s) => s.fallbackProvider);
  const fallbackModel = useSettingsStore((s) => s.fallbackModel);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const setModel = useSettingsStore((s) => s.setModel);
  const setTemperature = useSettingsStore((s) => s.setTemperature);
  const setMaxTokens = useSettingsStore((s) => s.setMaxTokens);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setOpenAiApiKey = useSettingsStore((s) => s.setOpenAiApiKey);
  const setClaudeApiKey = useSettingsStore((s) => s.setClaudeApiKey);
  const setGroqApiKey = useSettingsStore((s) => s.setGroqApiKey);
  const setTogetherApiKey = useSettingsStore((s) => s.setTogetherApiKey);
  const setOllamaBaseUrl = useSettingsStore((s) => s.setOllamaBaseUrl);
  const setGroqBaseUrl = useSettingsStore((s) => s.setGroqBaseUrl);
  const setTogetherBaseUrl = useSettingsStore((s) => s.setTogetherBaseUrl);
  const setFallbackProvider = useSettingsStore((s) => s.setFallbackProvider);
  const setFallbackModel = useSettingsStore((s) => s.setFallbackModel);

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ healthy: boolean; message: string; latencyMs: number } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<string, boolean>>({});
  const [interfaceFont, setInterfaceFont] = useState("Inter");
  const [codeFont, setCodeFont] = useState("JetBrains Mono");
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);

  useEffect(() => {
    handleHealthCheck();
    getAvailableThemes().then(setAvailableThemes).catch(() => {});
  }, []);

  useEffect(() => {
    setAvailableModels([]);
    setHealthStatus(null);
    handleHealthCheck();
  }, [provider]);

  async function handleHealthCheck() {
    setCheckingHealth(true);
    setHealthStatus(null);
    try {
      const result = await checkProviderHealth({
        provider,
        apiKey: getApiKeyForProvider(provider),
        baseUrl: getBaseUrlForProvider(provider),
      });
      setHealthStatus({
        healthy: result.healthy,
        message: result.message,
        latencyMs: result.latencyMs,
      });
    } catch {
      setHealthStatus({ healthy: false, message: "Connection failed", latencyMs: 0 });
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleFetchModels() {
    setLoadingModels(true);
    try {
      const models = await listProviderModels({
        provider,
        apiKey: getApiKeyForProvider(provider),
        baseUrl: getBaseUrlForProvider(provider),
      });
      setAvailableModels(models);
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }

  function getApiKeyForProvider(p: Provider): string | undefined {
    switch (p) {
      case "openai": return openAiApiKey || undefined;
      case "claude": return claudeApiKey || undefined;
      case "groq": return groqApiKey || undefined;
      case "together": return togetherApiKey || undefined;
      default: return undefined;
    }
  }

  function getBaseUrlForProvider(p: Provider): string | undefined {
    switch (p) {
      case "ollama": return ollamaBaseUrl || undefined;
      case "groq": return groqBaseUrl || undefined;
      case "together": return togetherBaseUrl || undefined;
      default: return undefined;
    }
  }

  function handleProviderChange(value: string) {
    setProvider(value as Provider);
    setAvailableModels([]);
    setHealthStatus(null);
  }

  function maskKey(key: string): string {
    if (!key) return "Not configured";
    if (key.length < 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    return key.slice(0, 4) + "\u2022\u2022\u2022\u2022" + key.slice(-4);
  }

  function toggleKeyVisibility(keyId: string) {
    setApiKeyVisibility((prev) => ({
      ...prev,
      [keyId]: !prev[keyId],
    }));
  }

  const apiKeyFields = [
    { id: "openai", label: "OpenAI API Key", value: openAiApiKey, setter: setOpenAiApiKey },
    { id: "claude", label: "Claude API Key", value: claudeApiKey, setter: setClaudeApiKey },
    { id: "groq", label: "Groq API Key", value: groqApiKey, setter: setGroqApiKey },
    { id: "together", label: "Together API Key", value: togetherApiKey, setter: setTogetherApiKey },
  ];

  const baseUrlFields = [
    { id: "ollama", label: "Ollama Base URL", value: ollamaBaseUrl, setter: setOllamaBaseUrl },
    { id: "groq", label: "Groq Base URL", value: groqBaseUrl, setter: setGroqBaseUrl },
    { id: "together", label: "Together Base URL", value: togetherBaseUrl, setter: setTogetherBaseUrl },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-[#30363D] bg-[#0D1117]/50">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => props.onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-medium transition-all duration-200 border-b-2 ${
                props.activeTab === tab.id
                  ? "border-cyan-400 text-cyan-400 bg-cyan-500/5"
                  : "border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D]"
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="settings-modal-content flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {props.activeTab === "ai" && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold text-[#F0F6FC] tracking-tight">AI Engine</h2>
                <p className="text-xs text-[#8B949E] mt-0.5">Configure provider, model, and generation</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${healthStatus?.healthy ? 'bg-green-500' : healthStatus === null ? 'bg-[#30363D]' : 'bg-red-500'}`} />
                <span className="text-xs text-[#8B949E]">
                  {healthStatus?.healthy ? `Connected (${healthStatus.latencyMs}ms)` : healthStatus ? 'Disconnected' : 'Idle'}
                </span>
              </div>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Brain} title="AI Configuration" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Cpu size={12} />
                    Primary Provider
                  </label>
                  <select className="cyber-select w-full" value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="ollama">Ollama</option>
                    <option value="groq">Groq</option>
                    <option value="together">Together</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Layers size={12} />
                    Model
                  </label>
                  <div className="relative">
                    <input className="cyber-input w-full pr-8" placeholder="e.g. gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} />
                    <button onClick={handleFetchModels} disabled={loadingModels} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-cyan-400 transition-colors" title="Fetch models">
                      <RefreshCw size={14} className={loadingModels ? "animate-spin" : ""} />
                    </button>
                  </div>
                  {availableModels.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                      {availableModels.map((m) => (
                        <button key={m} className={`w-full text-left px-3 py-1.5 rounded text-xs font-mono transition-colors ${m === model ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-[#8B949E] hover:bg-[#21262D] border border-transparent"}`} onClick={() => setModel(m)}>
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Thermometer size={12} />
                    Temperature
                  </label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={2} step={0.1} className="cyber-slider flex-1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
                    <span className="text-xs font-mono text-cyan-400 w-8 text-right tabular-nums">{temperature.toFixed(1)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Sliders size={12} />
                    Max Tokens
                  </label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={64} max={8192} step={64} className="cyber-slider flex-1" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
                    <span className="text-xs font-mono text-cyan-400 w-14 text-right tabular-nums">{maxTokens >= 1000 ? `${(maxTokens / 1000).toFixed(1)}k` : maxTokens}</span>
                  </div>
                </div>
              </div>
              <SectionDivider label="Fallback" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium">Fallback Provider</label>
                  <select className="cyber-select w-full" value={fallbackProvider} onChange={(e) => setFallbackProvider(e.target.value as "none" | Provider)}>
                    <option value="none">None</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="ollama">Ollama</option>
                    <option value="groq">Groq</option>
                    <option value="together">Together</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium">Fallback Model</label>
                  <input className="cyber-input w-full" placeholder="e.g. gpt-4o-mini" value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[#30363D] flex items-center justify-between">
                <button onClick={handleHealthCheck} disabled={checkingHealth} className="cyber-btn cyber-btn-ghost text-xs">
                  <Gauge size={14} />
                  {checkingHealth ? "Checking..." : "Test Connection"}
                </button>
                {healthStatus && (
                  <div className="flex items-center gap-2 text-xs">
                    {healthStatus.healthy ? <CheckCircle2 size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                    <span className={healthStatus.healthy ? "text-green-500" : "text-red-500"}>{healthStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {props.activeTab === "integration" && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-[#F0F6FC] tracking-tight">Integration</h2>
              <p className="text-xs text-[#8B949E] mt-0.5">API keys and connection URLs</p>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Key} title="API Keys" />
              <div className="space-y-2">
                {apiKeyFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-[#8B949E] font-medium uppercase tracking-wider">{field.label}</label>
                      <div className="relative">
                        <input type={apiKeyVisibility[field.id] ? "text" : "password"} className="cyber-input w-full font-mono text-xs pr-10" value={field.value} onChange={(e) => field.setter(e.target.value)} placeholder="sk-..." />
                        <button onClick={() => toggleKeyVisibility(field.id)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-cyan-400 transition-colors">
                          {apiKeyVisibility[field.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex-shrink-0 pt-5">
                      <div className="w-20 h-8 rounded bg-[#21262D] border border-[#30363D] flex items-center justify-center">
                        <span className="text-[10px] font-mono text-[#8B949E]">{field.value ? maskKey(field.value) : "\u2014"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Globe} title="Base URLs" />
              <div className="space-y-2">
                {baseUrlFields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label className="text-[10px] text-[#8B949E] font-medium uppercase tracking-wider">{field.label}</label>
                    <input className="cyber-input w-full font-mono text-xs" value={field.value} onChange={(e) => field.setter(e.target.value)} placeholder="http://..." />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {props.activeTab === "appearance" && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-[#F0F6FC] tracking-tight">Appearance</h2>
              <p className="text-xs text-[#8B949E] mt-0.5">Theme, fonts, and visual preferences</p>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Palette} title="Theme" />
              <div className="grid grid-cols-3 gap-3">
                {availableThemes.map((t) => (
                  <button key={t.id} onClick={() => props.onThemeChange ? props.onThemeChange(t) : setTheme(t.id)} className={`theme-thumb ${thumbClass(t.id)} ${theme === t.id ? "active" : ""}`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[10px] font-semibold tracking-wider ${theme === t.id ? "text-cyan-400" : "text-[#8B949E]"}`}>{t.label}</span>
                    </div>
                    {theme === t.id && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center">
                        <CheckCircle2 size={10} className="text-[#0D1117]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Type} title="Typography" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Type size={12} />
                    Interface Font
                  </label>
                  <select className="cyber-select w-full" value={interfaceFont} onChange={(e) => setInterfaceFont(e.target.value)}>
                    <option value="Inter">Inter</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value="Manrope">Manrope</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8B949E] font-medium flex items-center gap-1.5">
                    <Code size={12} />
                    Code Font
                  </label>
                  <select className="cyber-select w-full" value={codeFont} onChange={(e) => setCodeFont(e.target.value)}>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                    <option value="Fira Code">Fira Code</option>
                    <option value="Source Code Pro">Source Code Pro</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

        {props.activeTab === "system" && (
          <>
            <div className="mb-2">
              <h2 className="text-lg font-bold text-[#F0F6FC] tracking-tight">System</h2>
              <p className="text-xs text-[#8B949E] mt-0.5">Hotkeys, tray, and application behavior</p>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Command} title="Global Hotkeys" />
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#21262D] border border-[#30363D]">
                  <div className="flex items-center gap-2">
                    <Command size={14} className="text-cyan-400" />
                    <span className="text-xs text-[#F0F6FC]">Toggle Window</span>
                  </div>
                  <kbd className="text-[10px] font-mono text-[#8B949E] bg-[#0D1117] px-2 py-0.5 rounded border border-[#30363D]">Ctrl+Space</kbd>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#21262D] border border-[#30363D]">
                  <div className="flex items-center gap-2">
                    <Command size={14} className="text-cyan-400" />
                    <span className="text-xs text-[#F0F6FC]">Command Palette</span>
                  </div>
                  <kbd className="text-[10px] font-mono text-[#8B949E] bg-[#0D1117] px-2 py-0.5 rounded border border-[#30363D]">Ctrl+K</kbd>
                </div>
              </div>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Minimize2} title="System Tray" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#F0F6FC]">Minimize to tray</p>
                  <p className="text-[10px] text-[#8B949E]">JARVIS runs in the background when closed</p>
                </div>
                <label className="cyber-toggle">
                  <input type="checkbox" defaultChecked />
                  <div className="cyber-toggle-track"><div className="cyber-toggle-thumb" /></div>
                </label>
              </div>
            </div>

            <div className="cyber-card p-5">
              <SectionHeader icon={Bell} title="Notifications" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#F0F6FC]">Desktop notifications</p>
                  <p className="text-[10px] text-[#8B949E]">Show alerts for system events</p>
                </div>
                <label className="cyber-toggle">
                  <input type="checkbox" defaultChecked />
                  <div className="cyber-toggle-track"><div className="cyber-toggle-thumb" /></div>
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

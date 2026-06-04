import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import { checkProviderHealth, listProviderModels } from "../api/providers";
import { getAvailableThemes, type ThemeDefinition } from "../api/settingsApi";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { McpControlCenter } from "../components/McpControlCenter";
import { CyberInput, CyberSelect, CyberToggle, CyberSlider } from "../components/ui";
import { restartApplication } from "../utils/basicFunc";
import {
  Brain, Cpu, Thermometer, Layers, Palette, Type, Code, PlugZap,
  Eye, EyeOff, RefreshCw, CheckCircle2, Gauge,
  Sliders, Key, Globe, Command, Minimize2, Bell,
  MessageSquareWarning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Provider = "openai" | "claude" | "ollama" | "groq" | "together";
type SettingsTab = "ai" | "integration" | "appearance" | "system";

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "ai", label: "AI Engine" },
  { id: "integration", label: "Integration" },
  { id: "appearance", label: "Appearance" },
  { id: "system", label: "System" },
];

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: "var(--accent-soft)",
          border: "1px solid var(--message-user-border)",
        }}
      >
        <Icon size={16} style={{ color: "var(--accent-glow)" }} />
      </div>
      <div>
        <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="text-micro" style={{ color: "var(--text-muted)" }}>
          Control Center
        </p>
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="text-micro font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{
          backgroundColor: "var(--border-panel)",
        }}
      />
    </div>
  );
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onThemeChange?: (theme: ThemeDefinition) => void;
}

export default function Settings({ isOpen, onClose, activeTab, onTabChange, onThemeChange }: SettingsProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

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
  const [healthStatus, setHealthStatus] = useState<{
    healthy: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<string, boolean>>({});
  const [interfaceFont, setInterfaceFont] = useState("Manrope");
  const [codeFont, setCodeFont] = useState("Fira Code");
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);

  const { schedule } = useDebouncedSave(600);
  const prevValues = useRef({ provider, model, theme, temperature, maxTokens });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => panelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const p = prevValues.current;
    if (
      p.provider !== provider ||
      p.model !== model ||
      p.theme !== theme ||
      p.temperature !== temperature ||
      p.maxTokens !== maxTokens
    ) {
      schedule({ provider, model, activeTheme: theme, temperature, maxTokens });
      prevValues.current = { provider, model, theme, temperature, maxTokens };
    }
  }, [provider, model, theme, temperature, maxTokens, schedule]);

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
      setHealthStatus({
        healthy: false,
        message: "Connection failed",
        latencyMs: 0,
      });
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

  function handleReset() {
    if (window.confirm("Are you sure you want to reset to factory settings? This action cannot be undone.")) {
      invoke("reset_database").then(() => {
        restartApplication();
      });
    }
  }

  function maskKey(key: string): string {
    if (!key) return "Not configured";
    if (key.length < 8) return "••••••••";
    return key.slice(0, 4) + "••••" + key.slice(-4);
  }

  function toggleKeyVisibility(keyId: string) {
    setApiKeyVisibility((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden outline-none motion-safe:transition-crisp"
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-panel)",
          height: "75vh",
          minHeight: "500px",
          maxHeight: "700px",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-panel)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            JARVIS Control Configuration
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md motion-safe:transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Split Pane Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Nav */}
          <nav
            className="w-[220px] shrink-0 flex flex-col p-3 gap-0.5 overflow-y-auto"
            style={{ borderRight: "1px solid rgba(255,255,255,0.03)" }}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium outline-none motion-safe:transition-colors duration-150 ease-out"
                  style={{
                    color: isActive ? "var(--accent-glow)" : "var(--text-muted)",
                    backgroundColor: isActive
                      ? "var(--accent-soft)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Content */}
          <div
            className="flex-1 settings-modal-content overflow-y-auto px-6 py-5"
            style={{ backgroundColor: "var(--bg-main)" }}
          >
            {activeTab === "ai" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      AI Engine
                    </h2>
                    <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                      Configure provider, model, and generation
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`status-dot ${
                        healthStatus?.healthy
                          ? "healthy"
                          : healthStatus === null
                            ? "idle"
                            : "disconnected"
                      }`}
                    />
                    <span className="token-readout">
                      {healthStatus?.healthy
                        ? `Connected (${healthStatus.latencyMs}ms)`
                        : healthStatus
                          ? "Disconnected"
                          : "Idle"}
                    </span>
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Brain} title="AI Configuration" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Cpu size={12} />
                        Primary Provider
                      </label>
                      <CyberSelect
                        value={provider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="claude">Claude</option>
                        <option value="ollama">Ollama</option>
                        <option value="groq">Groq</option>
                        <option value="together">Together</option>
                      </CyberSelect>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Layers size={12} />
                        Model
                      </label>
                      <div className="relative">
                        <CyberInput
                          placeholder="e.g. gpt-4o-mini"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="pr-8"
                        />
                        <button
                          onClick={handleFetchModels}
                          disabled={loadingModels}
                          className="absolute right-2 top-1/2 -translate-y-1/2 motion-safe:transition-colors duration-150 ease-out"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = "var(--accent-glow)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = "var(--text-muted)")
                          }
                          title="Fetch models"
                        >
                          <RefreshCw
                            size={14}
                            className={loadingModels ? "animate-spin" : ""}
                          />
                        </button>
                      </div>
                      {availableModels.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                          {availableModels.map((m) => (
                            <button
                              key={m}
                              className={`w-full text-left px-3 py-1.5 rounded text-micro font-mono motion-safe:transition-colors duration-150 ease-out ${
                                m === model
                                  ? ""
                                  : "hover:bg-[rgba(255,255,255,0.02)] border border-transparent"
                              }`}
                              style={{
                                color: m === model ? "var(--accent-glow)" : "var(--text-muted)",
                                backgroundColor: m === model ? "var(--accent-soft)" : "transparent",
                                borderColor: m === model ? "var(--border-focus)" : "transparent",
                              }}
                              onClick={() => setModel(m)}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Thermometer size={12} />
                        Temperature
                      </label>
                      <CyberSlider
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => setTemperature(Number(e.target.value))}
                        valueLabel={temperature.toFixed(1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Sliders size={12} />
                        Max Tokens
                      </label>
                      <CyberSlider
                        min={64}
                        max={8192}
                        step={64}
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                        valueLabel={
                          maxTokens >= 1000
                            ? `${(maxTokens / 1000).toFixed(1)}k`
                            : String(maxTokens)
                        }
                      />
                    </div>
                  </div>

                  <SectionDivider label="Fallback" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Fallback Provider
                      </label>
                      <CyberSelect
                        value={fallbackProvider}
                        onChange={(e) => setFallbackProvider(e.target.value as "none" | Provider)}
                      >
                        <option value="none">None</option>
                        <option value="openai">OpenAI</option>
                        <option value="claude">Claude</option>
                        <option value="ollama">Ollama</option>
                        <option value="groq">Groq</option>
                        <option value="together">Together</option>
                      </CyberSelect>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Fallback Model
                      </label>
                      <CyberInput
                        placeholder="e.g. gpt-4o-mini"
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: "1px solid var(--border-panel)" }}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleHealthCheck}
                        disabled={checkingHealth}
                        className="cyber-btn"
                      >
                        <Gauge size={14} />
                        {checkingHealth ? "Checking..." : "Test Connection"}
                      </button>
                      {healthStatus && (
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`status-dot ${
                              healthStatus.healthy ? "healthy" : "disconnected"
                            }`}
                          />
                          <span
                            style={{
                              color: healthStatus.healthy
                                ? "var(--accent-glow)"
                                : "var(--danger)",
                            }}
                            className="text-micro"
                          >
                            {healthStatus.message}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "integration" && (
              <>
                <div className="mb-4">
                  <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    Integration
                  </h2>
                  <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                    API keys and connection URLs
                  </p>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Key} title="API Keys" />
                  <div className="space-y-3">
                    {apiKeyFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-3">
                        <div className="flex-1 space-y-1">
                          <label
                            className="text-micro font-medium uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {field.label}
                          </label>
                          <div className="relative">
                            <CyberInput
                              type={apiKeyVisibility[field.id] ? "text" : "password"}
                              value={field.value}
                              onChange={(e) => field.setter(e.target.value)}
                              placeholder="sk-..."
                              className="pr-10 font-mono"
                            />
                            <button
                              onClick={() => toggleKeyVisibility(field.id)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 motion-safe:transition-colors duration-150 ease-out"
                              style={{ color: "var(--text-muted)" }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "var(--accent-glow)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "var(--text-muted)")
                              }
                            >
                              {apiKeyVisibility[field.id] ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="flex-shrink-0 pt-5">
                          <div
                            className="w-20 h-8 rounded flex items-center justify-center"
                            style={{
                              backgroundColor: "var(--bg-field)",
                              border: "1px solid var(--border-field)",
                            }}
                          >
                            <span
                              className="text-micro font-mono"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {field.value ? maskKey(field.value) : "\u2014"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Globe} title="Base URLs" />
                  <div className="space-y-3">
                    {baseUrlFields.map((field) => (
                      <div key={field.id} className="space-y-1">
                        <label
                          className="text-micro font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {field.label}
                        </label>
                        <CyberInput
                          value={field.value}
                          onChange={(e) => field.setter(e.target.value)}
                          placeholder="http://..."
                          className="font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={PlugZap} title="MCP Servers" />
                  <McpControlCenter />
                </div>
              </>
            )}

            {activeTab === "appearance" && (
              <>
                <div className="mb-4">
                  <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    Appearance
                  </h2>
                  <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                    Theme, fonts, and visual preferences
                  </p>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Palette} title="Theme" />
                  <div className="flex flex-row gap-3 mt-2">
                    {availableThemes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() =>
                          onThemeChange
                            ? onThemeChange(t)
                            : setTheme(t.id)
                        }
                        className="flex-1 p-3 rounded-md border text-center cursor-pointer motion-safe:transition-all duration-150 ease-out"
                        style={{
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          borderColor:
                            theme === t.id
                              ? "var(--accent-glow)"
                              : "var(--border-panel)",
                        }}
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className="text-xs font-semibold tracking-wider"
                            style={{
                              color:
                                theme === t.id
                                  ? "var(--accent-glow)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {t.label}
                          </span>
                          {theme === t.id && (
                            <CheckCircle2
                              size={12}
                              style={{ color: "var(--accent-glow)" }}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Type} title="Typography" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Type size={12} />
                        Interface Font
                      </label>
                      <CyberSelect
                        value={interfaceFont}
                        onChange={(e) => setInterfaceFont(e.target.value)}
                      >
                        <option value="Manrope">Manrope</option>
                        <option value="Inter">Inter</option>
                        <option value="Space Grotesk">Space Grotesk</option>
                      </CyberSelect>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-micro font-medium flex items-center gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Code size={12} />
                        Code Font
                      </label>
                      <CyberSelect
                        value={codeFont}
                        onChange={(e) => setCodeFont(e.target.value)}
                      >
                        <option value="Fira Code">Fira Code</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Source Code Pro">Source Code Pro</option>
                      </CyberSelect>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "system" && (
              <>
                <div className="mb-4">
                  <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    System
                  </h2>
                  <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                    Hotkeys, tray, and application behavior
                  </p>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Command} title="Global Hotkeys" />
                  <div className="space-y-2">
                    {[
                      { label: "Toggle Window", keys: "Ctrl+Space" },
                      { label: "Command Palette", keys: "Ctrl+K" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between py-2 px-3 rounded-lg"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.25)",
                          border: "1px solid var(--border-panel)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Command
                            size={14}
                            style={{ color: "var(--accent-glow)" }}
                          />
                          <span className="text-xs" style={{ color: "var(--text-primary)" }}>
                            {item.label}
                          </span>
                        </div>
                        <kbd
                          className="text-micro font-mono px-2 py-0.5 rounded border"
                          style={{
                            backgroundColor: "var(--bg-main)",
                            borderColor: "var(--border-panel)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {item.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Minimize2} title="System Tray" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        Minimize to tray
                      </p>
                      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                        JARVIS runs in the background when closed
                      </p>
                    </div>
                    <CyberToggle defaultChecked />
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={Bell} title="Notifications" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        Desktop notifications
                      </p>
                      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                        Show alerts for system events
                      </p>
                    </div>
                    <CyberToggle defaultChecked />
                  </div>
                </div>

                <div className="cyber-card">
                  <SectionHeader icon={MessageSquareWarning} title="Destructive Actions" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        Reset to factory settings
                      </p>
                      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                        Clear all data and preferences
                      </p>
                    </div>
                    <button
                      className="cyber-btn bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                      id="rst-btn"
                      onClick={handleReset}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

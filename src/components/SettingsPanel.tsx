import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { checkProviderHealth, listProviderModels } from "../api/providers";
import { getAvailableThemes, type ThemeDefinition } from "../api/settingsApi";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { useMcp } from "../hooks/useMcp";
import { CyberInput, CyberSelect, CyberToggle, CyberSlider } from "./ui";
import {
  Brain, Cpu, Thermometer, Layers, Palette, Monitor, Type, Code, PlugZap,
  Eye, EyeOff, RefreshCw, CheckCircle2, Gauge,
  Sliders, Key, Globe, Command, Minimize2, Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Provider = "openai" | "claude" | "ollama" | "groq" | "together";
type SettingsTab = "ai" | "integration" | "appearance" | "system";

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

export default function SettingsPanel(props: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onThemeChange?: (theme: ThemeDefinition) => void;
}): JSX.Element {
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

  const { discoveredTools, isLoading, error: mcpError, connect } = useMcp();

  const [serverName, setServerName] = useState("");
  const [serverCmd, setServerCmd] = useState("");
  const [serverArgs, setServerArgs] = useState("");

  const handleConnectServer = useCallback(async () => {
    if (!serverName || !serverCmd) return;
    try {
      const argsArray = serverArgs.split(" ").filter((a) => a.trim() !== "");
      await invoke("mcp_add_and_spawn_server", {
        name: serverName,
        cmd: serverCmd,
        args: argsArray,
      });
      await connect(serverCmd, argsArray);
      setServerName("");
      setServerCmd("");
      setServerArgs("");
    } catch (err) {
      console.error("Failed to connect MCP server:", err);
    }
  }, [serverName, serverCmd, serverArgs, connect]);

  const { schedule } = useDebouncedSave(600);
  const prevValues = useRef({ provider, model, theme, temperature, maxTokens });

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

  return (
    <>
      {props.activeTab === "ai" && (
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

      {props.activeTab === "integration" && (
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

            <div
              className="mb-4 p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-3"
              style={{ backgroundColor: "var(--bg-panel)" }}
            >
              <div className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider font-bold">
                Register New Protocol Node
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Server Identifier (e.g., Filesystem)"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="p-2 text-[13px] rounded-lg bg-[#070708] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] transition-all"
                />
                <input
                  type="text"
                  placeholder="Executable (npx, uvx, node)"
                  value={serverCmd}
                  onChange={(e) => setServerCmd(e.target.value)}
                  className="p-2 text-[13px] rounded-lg bg-[#070708] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] transition-all"
                />
                <input
                  type="text"
                  placeholder="Arguments (e.g., @modelcontextprotocol/server-filesystem)"
                  value={serverArgs}
                  onChange={(e) => setServerArgs(e.target.value)}
                  className="p-2 text-[13px] rounded-lg bg-[#070708] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] transition-all"
                />
              </div>

              <button
                onClick={handleConnectServer}
                className="self-end px-4 py-1.5 rounded-lg border text-[11px] font-mono font-bold uppercase tracking-wider bg-transparent transition-all hover:bg-[rgba(0,245,184,0.05)]"
                style={{ borderColor: "rgba(0, 245, 184, 0.2)", color: "var(--accent-glow)" }}
              >
                Initialize Node
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {isLoading && (
                <div className="text-[13px] font-mono text-[var(--text-muted)] animate-pulse">
                  Scanning stdio transport channels...
                </div>
              )}

              {mcpError && (
                <div className="p-3 rounded-lg border border-red-900/30 bg-red-950/10 text-[13px] text-red-400 font-mono">
                  Error: {mcpError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {discoveredTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2 transition-all duration-150 hover:bg-white/[0.01]"
                    style={{ backgroundColor: "var(--bg-panel)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-[var(--accent-glow)] font-mono">
                        {tool.name}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 text-[var(--text-primary)] border border-white/5">
                        Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {tool.description || "No technical description provided by host server."}
                    </p>
                    {tool.inputSchema?.properties && (
                      <div className="mt-1 pt-2 border-t border-white/[0.02] flex flex-wrap gap-1.5">
                        {Object.keys(tool.inputSchema.properties).map((prop) => (
                          <span
                            key={prop}
                            className="text-[10px] font-mono text-[var(--text-muted)] bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.02]"
                          >
                            arg: {prop}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {discoveredTools.length === 0 && !isLoading && (
                  <div className="text-center py-6 border border-dashed border-[var(--border-subtle)] rounded-xl text-[13px] text-[var(--text-muted)]">
                    No active protocol tools detected. Connect an MCP server to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {props.activeTab === "appearance" && (
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
                    props.onThemeChange
                      ? props.onThemeChange(t)
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

      {props.activeTab === "system" && (
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
        </>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, RefreshCw, CheckCircle2, AlertCircle, PlugZap, Brain, Palette, Settings2 } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import {
  checkProviderHealth,
  listProviderModels,
  listProviderSecretStatuses,
  listSupportedProviders,
  removeProviderSecret,
  storeProviderSecret,
} from "../api/providers";
import { getAvailableThemes, type ThemeDefinition } from "../api/settingsApi";
import { McpControlCenter } from "../components/McpControlCenter";
import type { ProviderDefinition, ProviderHealthStatus, ProviderId } from "../types/provider";
import { restartApplication } from "../utils/basicFunc";

type SettingsTab = "ai" | "integration" | "appearance" | "system";

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "ai", label: "AI Providers" },
  { id: "integration", label: "MCP / Integrations" },
  { id: "appearance", label: "Appearance" },
  { id: "system", label: "System" },
];

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onThemeChange?: (theme: ThemeDefinition) => void;
}

type ModelCacheEntry = {
  models: string[];
  fetchedAt: number;
};

const modelCache = new Map<string, ModelCacheEntry>();

function statusLabel(status: ProviderHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Connected";
    case "checking":
      return "Checking";
    case "unconfigured":
      return "Not configured";
    case "unreachable":
      return "Unreachable";
    case "authentication_error":
      return "Authentication error";
    case "rate_limited":
      return "Rate limited";
    case "misconfigured":
      return "Misconfigured";
    case "unsupported":
      return "Unsupported";
    default:
      return "Unknown";
  }
}

function statusColor(status: ProviderHealthStatus): string {
  switch (status) {
    case "healthy":
      return "var(--status-success)";
    case "checking":
      return "var(--status-warning)";
    case "authentication_error":
    case "misconfigured":
    case "unreachable":
    case "rate_limited":
      return "var(--status-danger)";
    default:
      return "var(--text-muted)";
  }
}

export default function Settings({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  onThemeChange,
}: SettingsProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);
  const theme = useSettingsStore((state) => state.theme);
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const claudeApiKey = useSettingsStore((state) => state.claudeApiKey);
  const groqApiKey = useSettingsStore((state) => state.groqApiKey);
  const togetherApiKey = useSettingsStore((state) => state.togetherApiKey);
  const ollamaBaseUrl = useSettingsStore((state) => state.ollamaBaseUrl);
  const groqBaseUrl = useSettingsStore((state) => state.groqBaseUrl);
  const togetherBaseUrl = useSettingsStore((state) => state.togetherBaseUrl);
  const temperature = useSettingsStore((state) => state.temperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const providerHealth = useSettingsStore((state) => state.providerHealth);
  const setProvider = useSettingsStore((state) => state.setProvider);
  const setModel = useSettingsStore((state) => state.setModel);
  const setOpenAiApiKey = useSettingsStore((state) => state.setOpenAiApiKey);
  const setClaudeApiKey = useSettingsStore((state) => state.setClaudeApiKey);
  const setGroqApiKey = useSettingsStore((state) => state.setGroqApiKey);
  const setTogetherApiKey = useSettingsStore((state) => state.setTogetherApiKey);
  const setOllamaBaseUrl = useSettingsStore((state) => state.setOllamaBaseUrl);
  const setGroqBaseUrl = useSettingsStore((state) => state.setGroqBaseUrl);
  const setTogetherBaseUrl = useSettingsStore((state) => state.setTogetherBaseUrl);
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const setProviderHealth = useSettingsStore((state) => state.setProviderHealth);
  const syncProviderSecretStatuses = useSettingsStore((state) => state.setProviderSecretStatuses);
  const [supportedProviders, setSupportedProviders] = useState<ProviderDefinition[]>([]);
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelLoadState, setModelLoadState] = useState<"idle" | "loading" | "loaded" | "empty" | "error">("idle");
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [manualModelEntry, setManualModelEntry] = useState("");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [providerSecretStatuses, setProviderSecretStatuses] = useState<Record<string, boolean>>({});
  const [savingSecret, setSavingSecret] = useState(false);

  const providerDefinition = useMemo(
    () => supportedProviders.find((item) => item.id === provider),
    [provider, supportedProviders],
  );

  const currentHealth = providerHealth[provider];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = setTimeout(() => panelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void listSupportedProviders().then(setSupportedProviders);
    void listProviderSecretStatuses()
      .then((statuses) => {
        setProviderSecretStatuses(statuses);
        syncProviderSecretStatuses(statuses);
      })
      .catch(() => undefined);
    void getAvailableThemes().then(setAvailableThemes).catch(() => undefined);
  }, [isOpen]);

  useEffect(() => {
    if (!providerDefinition) {
      return;
    }
    void loadModels(false);
    void runHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ollamaBaseUrl, groqBaseUrl, togetherBaseUrl]);

  function getApiKey(selectedProvider: ProviderId): string | undefined {
    switch (selectedProvider) {
      case "openai":
        return openAiApiKey.trim() || undefined;
      case "claude":
        return claudeApiKey.trim() || undefined;
      case "groq":
        return groqApiKey.trim() || undefined;
      case "together":
        return togetherApiKey.trim() || undefined;
      default:
        return undefined;
    }
  }

  function setApiKey(selectedProvider: ProviderId, value: string): void {
    if (selectedProvider === "openai") setOpenAiApiKey(value);
    if (selectedProvider === "claude") setClaudeApiKey(value);
    if (selectedProvider === "groq") setGroqApiKey(value);
    if (selectedProvider === "together") setTogetherApiKey(value);
  }

  function getBaseUrl(selectedProvider: ProviderId): string | undefined {
    switch (selectedProvider) {
      case "ollama":
        return ollamaBaseUrl.trim() || undefined;
      case "groq":
        return groqBaseUrl.trim() || undefined;
      case "together":
        return togetherBaseUrl.trim() || undefined;
      default:
        return undefined;
    }
  }

  function modelCacheKey(selectedProvider: ProviderId): string {
    return [
      selectedProvider,
      getBaseUrl(selectedProvider) ?? "",
      getApiKey(selectedProvider) ? "configured" : "unconfigured",
    ].join("::");
  }

  async function loadModels(forceRefresh: boolean): Promise<void> {
    if (!providerDefinition) {
      return;
    }
    if (!providerDefinition.supportsModelListing) {
      setAvailableModels([]);
      setModelLoadState("idle");
      setModelLoadError(null);
      return;
    }

    const cacheKey = modelCacheKey(provider);
    const cached = modelCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < 60_000) {
      setAvailableModels(cached.models);
      setModelLoadState(cached.models.length > 0 ? "loaded" : "empty");
      setModelLoadError(null);
      return;
    }

    setModelLoadState("loading");
    setModelLoadError(null);
    try {
      const models = await listProviderModels({
        provider,
        apiKey: getApiKey(provider),
        baseUrl: getBaseUrl(provider),
      });
      modelCache.set(cacheKey, { models, fetchedAt: Date.now() });
      setAvailableModels(models);
      setModelLoadState(models.length > 0 ? "loaded" : "empty");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model listing failed";
      setAvailableModels([]);
      setModelLoadState("error");
      setModelLoadError(message);
    }
  }

  async function runHealthCheck(): Promise<void> {
    setCheckingHealth(true);
    try {
      const result = await checkProviderHealth({
        provider,
        apiKey: getApiKey(provider),
        baseUrl: getBaseUrl(provider),
      });
      setProviderHealth(provider, {
        healthy: result.healthy,
        message: result.message,
        latencyMs: result.latencyMs,
        checkedAt: new Date().toISOString(),
        status: result.status,
      });
    } catch (error) {
      setProviderHealth(provider, {
        healthy: false,
        message: error instanceof Error ? error.message : "Health check failed",
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        status: "unknown",
      });
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleSaveSecret(): Promise<void> {
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      return;
    }

    setSavingSecret(true);
    try {
      await storeProviderSecret(provider, apiKey);
      setApiKey(provider, "");
      const statuses = await listProviderSecretStatuses();
      setProviderSecretStatuses(statuses);
      syncProviderSecretStatuses(statuses);
      await runHealthCheck();
      await loadModels(true);
    } finally {
      setSavingSecret(false);
    }
  }

  async function handleRemoveSecret(): Promise<void> {
    setSavingSecret(true);
    try {
      await removeProviderSecret(provider);
      setApiKey(provider, "");
      const statuses = await listProviderSecretStatuses();
      setProviderSecretStatuses(statuses);
      syncProviderSecretStatuses(statuses);
    } finally {
      setSavingSecret(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-lg" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-[78vh] max-h-[760px] min-h-[520px] w-full max-w-6xl overflow-hidden rounded-3xl border outline-none"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-panel)" }}
      >
        <nav className="w-[240px] shrink-0 border-r p-3" style={{ borderColor: "var(--border-panel)" }}>
          <div className="mb-4 flex items-center justify-between px-2 py-2">
            <div>
              <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                HelpeX Settings
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Real provider and MCP configuration
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ color: "var(--text-muted)" }}>
              <X size={18} />
            </button>
          </div>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className="w-full rounded-2xl px-3 py-3 text-left text-sm"
                style={{
                  backgroundColor: activeTab === item.id ? "var(--accent-soft)" : "transparent",
                  color: activeTab === item.id ? "var(--accent-primary)" : "var(--text-secondary)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "ai" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain size={18} style={{ color: "var(--accent-primary)" }} />
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                      AI Providers
                    </h2>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Choose a real provider, discover models dynamically, and verify provider health.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runHealthCheck()}
                  className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                >
                  <RefreshCw size={14} className={checkingHealth ? "animate-spin" : undefined} />
                  Check provider
                </button>
              </div>

              <section className="rounded-3xl border p-5" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel-strong)" }}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Provider</span>
                    <select
                      value={provider}
                      onChange={(event) => setProvider(event.target.value as ProviderId)}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    >
                      {supportedProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                    <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                      Status
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(currentHealth?.status ?? "unknown") }} />
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {statusLabel(currentHealth?.status ?? "unknown")}
                      </span>
                      {currentHealth?.healthy ? (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {currentHealth.latencyMs} ms
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                      {currentHealth?.message ?? "Not checked yet"}
                    </p>
                  </div>
                </div>

                {providerDefinition?.requiresApiKey ? (
                  <label className="mt-4 block space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>API key</span>
                    <input
                      type="password"
                      value={
                        provider === "openai"
                          ? openAiApiKey
                          : provider === "claude"
                            ? claudeApiKey
                            : provider === "groq"
                              ? groqApiKey
                              : togetherApiKey
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (provider === "openai") setOpenAiApiKey(value);
                        if (provider === "claude") setClaudeApiKey(value);
                        if (provider === "groq") setGroqApiKey(value);
                        if (provider === "together") setTogetherApiKey(value);
                      }}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                      placeholder="Enter provider credential"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {providerSecretStatuses[provider]
                          ? "Stored securely in the operating system credential store."
                          : "Not stored securely yet."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveSecret()}
                          disabled={savingSecret || !getApiKey(provider)}
                          className="rounded-xl border px-3 py-2 text-xs"
                          style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                        >
                          {savingSecret ? "Saving..." : "Save securely"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveSecret()}
                          disabled={savingSecret || !providerSecretStatuses[provider]}
                          className="rounded-xl border px-3 py-2 text-xs"
                          style={{ borderColor: "rgba(249, 115, 115, 0.25)", color: "var(--status-danger)" }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </label>
                ) : null}

                {providerDefinition?.supportsCustomBaseUrl ? (
                  <label className="mt-4 block space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Base URL</span>
                    <input
                      value={getBaseUrl(provider) ?? providerDefinition.defaultBaseUrl ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (provider === "ollama") setOllamaBaseUrl(value);
                        if (provider === "groq") setGroqBaseUrl(value);
                        if (provider === "together") setTogetherBaseUrl(value);
                      }}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    />
                  </label>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Models
                    </span>
                    <select
                      value={availableModels.includes(model) ? model : ""}
                      onChange={(event) => setModel(event.target.value)}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    >
                      <option value="">Select discovered model</option>
                      {availableModels.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {modelLoadState === "loading"
                        ? "Loading models..."
                        : modelLoadState === "empty"
                          ? "No models were returned for this provider."
                          : modelLoadState === "error"
                            ? modelLoadError ?? "Model discovery failed."
                            : providerDefinition?.supportsModelListing
                              ? `${availableModels.length} models loaded`
                              : "This provider uses manual model entry."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadModels(true)}
                    disabled={modelLoadState === "loading" || !providerDefinition?.supportsModelListing}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    <RefreshCw size={14} className={modelLoadState === "loading" ? "animate-spin" : undefined} />
                    Refresh
                  </button>
                </div>

                <label className="mt-4 block space-y-2 text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Manual model entry</span>
                  <input
                    value={manualModelEntry || model}
                    onChange={(event) => {
                      setManualModelEntry(event.target.value);
                      setModel(event.target.value);
                    }}
                    className="w-full rounded-2xl border px-3 py-2"
                    style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    placeholder="Enter a model if discovery is unavailable"
                  />
                </label>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Temperature</span>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(event) => setTemperature(Number(event.target.value))}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Max tokens</span>
                    <input
                      type="number"
                      min={64}
                      max={8192}
                      step={64}
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(Number(event.target.value))}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                  <p style={{ color: "var(--text-primary)" }}>
                    Tool calling {providerDefinition?.capabilities.toolCalling ? "available" : "unavailable"} for {providerDefinition?.displayName ?? provider}.
                  </p>
                  <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                    If a specific model later proves not to support structured tool calling, plain chat still works but MCP tools should not be advertised to that model.
                  </p>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "integration" ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <PlugZap size={18} style={{ color: "var(--accent-primary)" }} />
                  <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    MCP / Integrations
                  </h2>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  Add MCP servers, inspect real discovered tools, and control enable or disable state in the backend.
                </p>
              </div>
              <McpControlCenter />
            </div>
          ) : null}

          {activeTab === "appearance" ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Palette size={18} style={{ color: "var(--accent-primary)" }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Appearance
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {availableThemes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => (onThemeChange ? onThemeChange(item) : undefined)}
                    className="rounded-2xl border px-4 py-4 text-left"
                    style={{
                      borderColor: theme === item.id ? "var(--accent-primary)" : "var(--border-panel)",
                      backgroundColor: "var(--surface-panel-strong)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ color: "var(--text-primary)" }}>{item.label}</span>
                      {theme === item.id ? <CheckCircle2 size={16} style={{ color: "var(--status-success)" }} /> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "system" ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Settings2 size={18} style={{ color: "var(--accent-primary)" }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  System
                </h2>
              </div>
              <div className="rounded-3xl border p-5" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel-strong)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Local application state
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  Provider selection, non-secret settings, and configured MCP integrations are stored locally. Secrets are no longer persisted in the settings store.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Reset HelpeX and restart the desktop app?")) {
                        void invoke("reset_database").then(() => restartApplication());
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm"
                    style={{ borderColor: "rgba(249, 115, 115, 0.35)", color: "var(--status-danger)" }}
                  >
                    <AlertCircle size={14} />
                    Reset local data
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, PlugZap, Shield, Sparkles } from "lucide-react";
import {
  checkProviderHealth,
  listProviderModels,
  listProviderSecretStatuses,
  listSupportedProviders,
  storeProviderSecret,
} from "../../api/providers";
import { McpControlCenter } from "../McpControlCenter";
import { useSettingsStore } from "../../store/settingsStore";
import type { ProviderDefinition, ProviderId } from "../../types/provider";

type StepId = "welcome" | "ai" | "integrations" | "permissions" | "finish";

const STEPS: { id: StepId; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "ai", label: "AI Setup" },
  { id: "integrations", label: "Integrations" },
  { id: "permissions", label: "Permissions" },
  { id: "finish", label: "Finish" },
];

interface SetupWizardProps {
  onComplete: () => void;
}

function statusLabel(healthy: boolean | undefined, message: string | undefined): string {
  if (healthy === undefined) {
    return "Not checked";
  }
  return healthy ? message ?? "Connected" : message ?? "Unavailable";
}

export default function SetupWizard({ onComplete }: SetupWizardProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const [supportedProviders, setSupportedProviders] = useState<ProviderDefinition[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string>();
  const [healthOk, setHealthOk] = useState<boolean>();
  const [savingSecret, setSavingSecret] = useState(false);

  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const claudeApiKey = useSettingsStore((state) => state.claudeApiKey);
  const groqApiKey = useSettingsStore((state) => state.groqApiKey);
  const togetherApiKey = useSettingsStore((state) => state.togetherApiKey);
  const ollamaBaseUrl = useSettingsStore((state) => state.ollamaBaseUrl);
  const groqBaseUrl = useSettingsStore((state) => state.groqBaseUrl);
  const togetherBaseUrl = useSettingsStore((state) => state.togetherBaseUrl);
  const providerSecretsConfigured = useSettingsStore((state) => state.providerSecretsConfigured);
  const setProvider = useSettingsStore((state) => state.setProvider);
  const setModel = useSettingsStore((state) => state.setModel);
  const setOpenAiApiKey = useSettingsStore((state) => state.setOpenAiApiKey);
  const setClaudeApiKey = useSettingsStore((state) => state.setClaudeApiKey);
  const setGroqApiKey = useSettingsStore((state) => state.setGroqApiKey);
  const setTogetherApiKey = useSettingsStore((state) => state.setTogetherApiKey);
  const setOllamaBaseUrl = useSettingsStore((state) => state.setOllamaBaseUrl);
  const setGroqBaseUrl = useSettingsStore((state) => state.setGroqBaseUrl);
  const setTogetherBaseUrl = useSettingsStore((state) => state.setTogetherBaseUrl);
  const setProviderSecretStatuses = useSettingsStore((state) => state.setProviderSecretStatuses);

  const currentStep = STEPS[stepIndex]?.id ?? "welcome";
  const providerDefinition = useMemo(
    () => supportedProviders.find((item) => item.id === provider),
    [provider, supportedProviders],
  );

  useEffect(() => {
    void listSupportedProviders().then(setSupportedProviders);
    void listProviderSecretStatuses().then(setProviderSecretStatuses).catch(() => undefined);
  }, [setProviderSecretStatuses]);

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

  async function refreshModels(): Promise<void> {
    if (!providerDefinition?.supportsModelListing) {
      setModels([]);
      return;
    }

    setIsLoadingModels(true);
    try {
      const result = await listProviderModels({
        provider,
        apiKey: getApiKey(provider),
        baseUrl: getBaseUrl(provider),
      });
      setModels(result);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function testProvider(): Promise<void> {
    try {
      const result = await checkProviderHealth({
        provider,
        apiKey: getApiKey(provider),
        baseUrl: getBaseUrl(provider),
      });
      setHealthOk(result.healthy);
      setHealthMessage(result.message);
      if (result.healthy) {
        await refreshModels();
      }
    } catch (error) {
      setHealthOk(false);
      setHealthMessage(error instanceof Error ? error.message : "Provider check failed");
    }
  }

  async function saveSecretIfPresent(): Promise<void> {
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
    } finally {
      setSavingSecret(false);
    }
  }

  function next(): void {
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back(): void {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(93,227,201,0.12),_transparent_38%),linear-gradient(180deg,_#051015,_#07141b_42%,_#08121a)] px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[28px] border px-8 py-7" style={{ backgroundColor: "rgba(7, 18, 24, 0.88)", borderColor: "rgba(118, 152, 168, 0.18)" }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--accent-primary)" }}>
                HelpeX Setup
              </p>
              <h1 className="mt-3 text-[38px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                Your infrastructure. One agent.
              </h1>
              <p className="mt-3 max-w-2xl text-base" style={{ color: "var(--text-secondary)" }}>
                Connect a provider, choose a model, and review the permission boundary before you start using HelpeX.
              </p>
            </div>
            <div className="grid gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>Open Source</span>
              <span>Local-first</span>
              <span>Permission controlled</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border p-4" style={{ backgroundColor: "rgba(8, 17, 23, 0.92)", borderColor: "rgba(118, 152, 168, 0.16)" }}>
            <div className="space-y-2">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: index === stepIndex ? "var(--border-focus)" : "rgba(118, 152, 168, 0.12)",
                    backgroundColor: index === stepIndex ? "rgba(93, 227, 201, 0.08)" : "transparent",
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                    Step {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-[28px] border p-6" style={{ backgroundColor: "rgba(8, 17, 23, 0.92)", borderColor: "rgba(118, 152, 168, 0.16)" }}>
            {currentStep === "welcome" ? (
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "rgba(118, 152, 168, 0.18)", color: "var(--text-secondary)" }}>
                  <Sparkles size={13} />
                  First-time setup
                </div>
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                    Welcome to HelpeX
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
                    HelpeX connects your models and integrations while keeping sensitive actions behind explicit backend permissions.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === "ai" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                    Choose your AI provider
                  </h2>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    This step uses the same provider registry, health checks, and model discovery as the main settings screen.
                  </p>
                </div>
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
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                    <p style={{ color: "var(--text-secondary)" }}>Provider health</p>
                    <p className="mt-2 font-medium" style={{ color: healthOk ? "var(--status-success)" : "var(--text-primary)" }}>
                      {statusLabel(healthOk, healthMessage)}
                    </p>
                  </div>
                </div>

                {providerDefinition?.requiresApiKey ? (
                  <label className="block space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>API key</span>
                    <input
                      type="password"
                      value={getApiKey(provider) ?? ""}
                      onChange={(event) => setApiKey(provider, event.target.value)}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                      placeholder="Enter provider credential"
                    />
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {providerSecretsConfigured[provider]
                        ? "A credential is already stored securely."
                        : "Credentials are stored in the operating system secret store."}
                    </p>
                  </label>
                ) : null}

                {providerDefinition?.supportsCustomBaseUrl ? (
                  <label className="block space-y-2 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Base URL</span>
                    <input
                      value={getBaseUrl(provider) ?? providerDefinition.defaultBaseUrl ?? ""}
                      onChange={(event) => {
                        if (provider === "ollama") setOllamaBaseUrl(event.target.value);
                        if (provider === "groq") setGroqBaseUrl(event.target.value);
                        if (provider === "together") setTogetherBaseUrl(event.target.value);
                      }}
                      className="w-full rounded-2xl border px-3 py-2"
                      style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                    />
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveSecretIfPresent()}
                    disabled={savingSecret || !getApiKey(provider)}
                    className="rounded-2xl border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    {savingSecret ? "Saving..." : "Save securely"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void testProvider()}
                    className="rounded-2xl px-4 py-2 text-sm font-medium"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
                  >
                    Test provider
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    className="rounded-2xl border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    {isLoadingModels ? "Loading..." : "Refresh models"}
                  </button>
                </div>

                <label className="block space-y-2 text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Model</span>
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="w-full rounded-2xl border px-3 py-2"
                    style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                  >
                    <option value={model || ""}>{model || "Select or enter a model"}</option>
                    {models.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {currentStep === "integrations" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                    Connect your first integration
                  </h2>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    MCP gives HelpeX real tools it can use. You can skip this and add integrations later.
                  </p>
                </div>
                <McpControlCenter />
              </div>
            ) : null}

            {currentStep === "permissions" ? (
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "rgba(118, 152, 168, 0.18)", color: "var(--text-secondary)" }}>
                  <Shield size={13} />
                  Permission gateway
                </div>
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                    HelpeX never gets unlimited authority
                  </h2>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    The model may propose actions. The backend authorization layer decides what can run automatically and what needs your approval.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["READ", "Can run automatically."],
                    ["WRITE", "Requires approval."],
                    ["EXECUTE", "Requires approval."],
                    ["SENSITIVE", "Blocked by default."],
                  ].map(([label, description]) => (
                    <div
                      key={label}
                      className="rounded-2xl border px-4 py-3"
                      style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}
                    >
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--accent-primary)" }}>
                        {label}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === "finish" ? (
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "rgba(93, 227, 201, 0.3)", color: "var(--status-success)" }}>
                  <CheckCircle2 size={13} />
                  Ready
                </div>
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                    HelpeX is ready
                  </h2>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    You can finish setup now and continue refining provider settings, permissions, and integrations from the main application.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                      AI
                    </p>
                    <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {provider} · {model || "No model"}
                    </p>
                  </div>
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                      Integrations
                    </p>
                    <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      MCP setup available
                    </p>
                  </div>
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}>
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                      Security
                    </p>
                    <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Permission gateway active
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "rgba(118, 152, 168, 0.12)" }}>
              <button
                type="button"
                onClick={back}
                disabled={stepIndex === 0}
                className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={15} />
                Back
              </button>
              <div className="flex gap-3">
                {currentStep === "integrations" ? (
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    <PlugZap size={15} />
                    Skip for now
                  </button>
                ) : null}
                {currentStep === "finish" ? (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
                  >
                    Open HelpeX
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
                  >
                    Continue
                    <ChevronRight size={15} />
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { checkProviderHealth, listProviderModels } from "../api/providers";

export default function SettingsPanel(): JSX.Element {
  const provider = useSettingsStore((state) => state.provider);
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const claudeApiKey = useSettingsStore((state) => state.claudeApiKey);
  const ollamaBaseUrl = useSettingsStore((state) => state.ollamaBaseUrl);
  const model = useSettingsStore((state) => state.model);
  const fallbackProvider = useSettingsStore((state) => state.fallbackProvider);
  const fallbackModel = useSettingsStore((state) => state.fallbackModel);
  const temperature = useSettingsStore((state) => state.temperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const setProvider = useSettingsStore((state) => state.setProvider);
  const setOpenAiApiKey = useSettingsStore((state) => state.setOpenAiApiKey);
  const setClaudeApiKey = useSettingsStore((state) => state.setClaudeApiKey);
  const setOllamaBaseUrl = useSettingsStore((state) => state.setOllamaBaseUrl);
  const setModel = useSettingsStore((state) => state.setModel);
  const setFallbackProvider = useSettingsStore((state) => state.setFallbackProvider);
  const setFallbackModel = useSettingsStore((state) => state.setFallbackModel);
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const [providerHealth, setProviderHealth] = useState<string>("Not tested");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isDetectingModels, setIsDetectingModels] = useState(false);
  const [fallbackDetectedModels, setFallbackDetectedModels] = useState<string[]>([]);
  const [isDetectingFallbackModels, setIsDetectingFallbackModels] = useState(false);

  const currentApiKey = useMemo(() => {
    if (provider === "openai") {
      return openAiApiKey.trim();
    }

    if (provider === "claude") {
      return claudeApiKey.trim();
    }

    return undefined;
  }, [provider, openAiApiKey, claudeApiKey]);

  const currentBaseUrl = useMemo(() => {
    if (provider === "ollama") {
      return ollamaBaseUrl.trim();
    }

    return undefined;
  }, [provider, ollamaBaseUrl]);

  async function handleCheckHealth(): Promise<void> {
    setIsCheckingHealth(true);
    try {
      const health = await checkProviderHealth({
        provider,
        apiKey: currentApiKey,
        baseUrl: currentBaseUrl
      });

      const status = health.healthy ? "healthy" : "unhealthy";
      setProviderHealth(`${health.provider} is ${status} (${health.latencyMs}ms) - ${health.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown health check error";
      setProviderHealth(message);
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function handleDetectModels(): Promise<void> {
    setIsDetectingModels(true);
    try {
      const models = await listProviderModels({
        provider,
        apiKey: currentApiKey,
        baseUrl: currentBaseUrl
      });

      setDetectedModels(models);
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown model detection error";
      setDetectedModels([]);
      setProviderHealth(message);
    } finally {
      setIsDetectingModels(false);
    }
  }

  async function handleDetectFallbackModels(): Promise<void> {
    if (fallbackProvider === "none") {
      setFallbackDetectedModels([]);
      return;
    }

    setIsDetectingFallbackModels(true);
    try {
      const fallbackApiKey =
        fallbackProvider === "openai"
          ? openAiApiKey.trim()
          : fallbackProvider === "claude"
            ? claudeApiKey.trim()
            : undefined;
      const fallbackBaseUrl = fallbackProvider === "ollama" ? ollamaBaseUrl.trim() : undefined;

      const models = await listProviderModels({
        provider: fallbackProvider,
        apiKey: fallbackApiKey,
        baseUrl: fallbackBaseUrl
      });

      setFallbackDetectedModels(models);
      if (models.length > 0 && !models.includes(fallbackModel)) {
        setFallbackModel(models[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fallback model detection error";
      setFallbackDetectedModels([]);
      setProviderHealth(message);
    } finally {
      setIsDetectingFallbackModels(false);
    }
  }

  return (
    <aside className="settings-panel">
      <h3>Settings</h3>

      <label>
        Provider
        <select value={provider} onChange={(event) => setProvider(event.target.value as "openai" | "claude" | "ollama")}>
          <option value="openai">OpenAI</option>
          <option value="claude">Claude</option>
          <option value="ollama">Ollama</option>
        </select>
      </label>

      <label>
        OpenAI API Key
        <input
          type="password"
          value={openAiApiKey}
          onChange={(event) => setOpenAiApiKey(event.target.value)}
          placeholder="sk-..."
        />
      </label>

      <label>
        Claude API Key
        <input
          type="password"
          value={claudeApiKey}
          onChange={(event) => setClaudeApiKey(event.target.value)}
          placeholder="sk-ant-..."
        />
      </label>

      <label>
        Ollama URL
        <input
          type="text"
          value={ollamaBaseUrl}
          onChange={(event) => setOllamaBaseUrl(event.target.value)}
          placeholder="http://127.0.0.1:11434"
        />
      </label>

      <label>
        Model
        {detectedModels.length > 0 ? (
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {detectedModels.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Type model name"
          />
        )}
      </label>

      <button type="button" onClick={handleCheckHealth} disabled={isCheckingHealth}>
        {isCheckingHealth ? "Checking..." : "Check Provider Health"}
      </button>

      <button type="button" onClick={handleDetectModels} disabled={isDetectingModels}>
        {isDetectingModels ? "Detecting..." : "Auto Detect Models"}
      </button>

      <p>{providerHealth}</p>

      <label>
        Fallback Provider
        <select
          value={fallbackProvider}
          onChange={(event) =>
            setFallbackProvider(event.target.value as "none" | "openai" | "claude" | "ollama")
          }
        >
          <option value="none">None</option>
          <option value="openai">OpenAI</option>
          <option value="claude">Claude</option>
          <option value="ollama">Ollama</option>
        </select>
      </label>

      <label>
        Fallback Model
        {fallbackDetectedModels.length > 0 ? (
          <select value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)}>
            {fallbackDetectedModels.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={fallbackModel}
            onChange={(event) => setFallbackModel(event.target.value)}
            placeholder="Model used when primary fails"
          />
        )}
      </label>

      <button
        type="button"
        onClick={handleDetectFallbackModels}
        disabled={isDetectingFallbackModels || fallbackProvider === "none"}
      >
        {isDetectingFallbackModels ? "Detecting Fallback..." : "Auto Detect Fallback Models"}
      </button>

      <label>
        Temperature ({temperature.toFixed(1)})
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
        />
      </label>

      <label>
        Max Tokens
        <input
          type="number"
          min="64"
          max="8192"
          value={maxTokens}
          onChange={(event) => setMaxTokens(Number(event.target.value))}
        />
      </label>
    </aside>
  );
}

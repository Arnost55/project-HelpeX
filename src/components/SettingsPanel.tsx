import { useSettingsStore } from "../store/settingsStore";

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
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4.1-mini">gpt-4.1-mini</option>
        </select>
      </label>

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
        <input
          type="text"
          value={fallbackModel}
          onChange={(event) => setFallbackModel(event.target.value)}
          placeholder="Model used when primary fails"
        />
      </label>

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

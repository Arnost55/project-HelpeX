import { useSettingsStore } from "../store/settingsStore";

export default function SettingsPanel(): JSX.Element {
  const openAiApiKey = useSettingsStore((state) => state.openAiApiKey);
  const model = useSettingsStore((state) => state.model);
  const setOpenAiApiKey = useSettingsStore((state) => state.setOpenAiApiKey);
  const setModel = useSettingsStore((state) => state.setModel);

  return (
    <aside className="settings-panel">
      <h3>Settings</h3>

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
        Model
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4.1-mini">gpt-4.1-mini</option>
        </select>
      </label>
    </aside>
  );
}

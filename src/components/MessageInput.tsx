import { FormEvent, useEffect, useState } from "react";
import { ChevronDown, Mic, SendHorizontal, Square } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import Dropdown from "./ui/Dropdown";

type Provider = "openai" | "claude" | "ollama" | "groq" | "together";

type MessageInputProps = {
  disabled: boolean;
  isStreaming: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void>;
  variant?: "full" | "compact";
};

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "ollama", label: "Ollama" },
  { value: "groq", label: "Groq" },
  { value: "together", label: "Together" },
];

const MODEL_PRESETS: Record<Provider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
  claude: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
  ollama: ["llama3.2", "qwen2.5", "mistral"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  together: ["meta-llama/Llama-3.1-8B-Instruct-Turbo", "Qwen/Qwen2.5-7B-Instruct-Turbo"],
};

export default function MessageInput({
  disabled,
  isStreaming,
  onCancel,
  onSubmit,
  variant = "full",
}: MessageInputProps): JSX.Element {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);
  const setProvider = useSettingsStore((state) => state.setProvider);
  const setModel = useSettingsStore((state) => state.setModel);
  const [modelDraft, setModelDraft] = useState(model);

  useEffect(() => setModelDraft(model), [model]);

  function applyProvider(nextProvider: Provider, close: () => void) {
    setProvider(nextProvider);
    const presets = MODEL_PRESETS[nextProvider];
    if (!presets.includes(model)) {
      setModel(presets[0]);
      setModelDraft(presets[0]);
    }
    close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled || isSubmitting || isStreaming) return;

    try {
      setIsSubmitting(true);
      await onSubmit(value);
      setText("");
    } finally {
      setIsSubmitting(false);
    }
  }

  const compact = variant === "compact";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border p-3"
      style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Dropdown>
          {({ isOpen, toggle, close }) => (
            <div className="relative">
              <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                {provider} / {model}
                <ChevronDown size={14} />
              </button>
              {isOpen ? (
                <div
                  className="absolute left-0 top-[calc(100%+10px)] z-30 w-[300px] rounded-2xl border p-3"
                  style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
                >
                  <p className="mb-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                    Provider
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {PROVIDER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => applyProvider(option.value, close)}
                        className="rounded-xl px-3 py-2 text-left text-sm"
                        style={{
                          backgroundColor: option.value === provider ? "var(--accent-soft)" : "rgba(255,255,255,0.03)",
                          color: option.value === provider ? "var(--accent-primary)" : "var(--text-secondary)",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                    Model
                  </p>
                  <input
                    value={modelDraft}
                    onChange={(event) => setModelDraft(event.target.value)}
                    className="mb-3 w-full rounded-xl border px-3 py-2 text-sm"
                    style={{
                      backgroundColor: "var(--surface-elevated)",
                      borderColor: "var(--border-panel)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    {MODEL_PRESETS[provider].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setModelDraft(preset)}
                        className="rounded-full px-3 py-1 text-xs"
                        style={{
                          backgroundColor: modelDraft === preset ? "var(--accent-soft)" : "rgba(255,255,255,0.04)",
                          color: modelDraft === preset ? "var(--accent-primary)" : "var(--text-secondary)",
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (modelDraft.trim()) {
                          setModel(modelDraft.trim());
                        }
                        close();
                      }}
                      className="rounded-xl px-3 py-2 text-sm font-medium"
                      style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Dropdown>

        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <Mic size={14} />
          Voice
        </div>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={compact ? "Ask HelpeX anything..." : "Ask HelpeX to inspect, automate, or operate your systems..."}
        rows={compact ? 2 : 3}
        disabled={disabled || isSubmitting}
        className="mb-3 w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none"
        style={{
          minHeight: compact ? "96px" : "112px",
          backgroundColor: "var(--surface-elevated)",
          borderColor: "var(--border-panel)",
          color: "var(--text-primary)",
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          HelpeX can make mistakes. Verify important actions.
        </p>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
            >
              <Square size={14} />
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={disabled || isSubmitting || isStreaming}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
          >
            <SendHorizontal size={15} />
            Send
          </button>
        </div>
      </div>
    </form>
  );
}

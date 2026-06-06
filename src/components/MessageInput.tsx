import { FormEvent, useEffect, useState } from "react";
import { Loader2, SendHorizontal, ChevronDown, LucideCirclePlus } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import Dropdown from "./ui/Dropdown";

type MessageInputProps = {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
};

type Provider = "openai" | "claude" | "ollama" | "groq" | "together";

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "ollama", label: "Ollama" },
  { value: "groq", label: "Groq" },
  { value: "together", label: "Together" }
];

const MODEL_PRESETS: Record<Provider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
  claude: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
  ollama: ["llama3.2", "qwen2.5", "mistral"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  together: ["meta-llama/Llama-3.1-8B-Instruct-Turbo", "Qwen/Qwen2.5-7B-Instruct-Turbo"]
};

function InlineText({ text }: { text: string }): JSX.Element {
  return (
    <div className="msg-input-text"
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
      }}
    >
      <div className="msg-input-text-wrapper"
      style={{
        color: "#121212",
        fontFamily: "Inter, Helvetica",
        fontSize: "16px",
        fontStyle: "normal",
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: "139.9999976158142%",
        whiteSpace: "nowrap",
        width: "fit-content",

      }}>{text}</div>
    </div>
  );
}

export default function MessageInput({ disabled, onSubmit }: MessageInputProps): JSX.Element {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);
  const setProvider = useSettingsStore((state) => state.setProvider);
  const setModel = useSettingsStore((state) => state.setModel);
  const [modelDraft, setModelDraft] = useState(model);

  useEffect(() => setModelDraft(model), [model]);

  function handleProviderSelect(nextProvider: Provider, close: () => void) {
    setProvider(nextProvider);
    const presets = MODEL_PRESETS[nextProvider];

    if (!presets.includes(model)) {
      setModel(presets[0]);
      setModelDraft(presets[0]);
    }

    close();
  }

  function handleApplyModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = modelDraft.trim();
    if (!value) return;
    setModel(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit(value);
      setText("");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isDisabled = disabled || isSubmitting;


  return (
    <div
    className="message-input-container"
    style={{
      margin: "auto auto",
      width: "50%",
      position: "relative",

      }}
    >
      <form className="message-input-root" onSubmit={handleSubmit}
      style={{
          border: "1px solid rgba(255, 255, 255, 0.9)",
          borderRadius: "16px",
          background: "#d9d9d9",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
      }}
      >
        <InlineText text="Ask me anything!" />

        <textarea
          className="message-input-field"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type your message..."

          rows={1}
          disabled={isDisabled}
          inputMode="text"
          style={{
            width: "100%",
            resize: "none",
            minHeight: "54px",
            maxHeight: "180px",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius: "12px",
            background: "#f5f5f5",
            color: "#121212",
            padding: "10px 12px",
            fontSize: "14px",
            lineHeight: "1.4",
            transition: "border-color 0.2s ease",
          }}
        />

        <div className="message-input-actions"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            }}
            >
          

          <Dropdown>
            {({ isOpen, toggle, close }) => (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="message-input-provider"
                  onClick={toggle}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  style={{
                    fontSize: "12px",
                    color: "#121212",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    borderColor: "rgba(0, 0, 0, 0.14)",
                  }}
                >
                  {provider} - {model} <span className="sr-only">Change provider and model</span>
                  <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
                </button>

                {isOpen && (
                  <div
                    role="menu"
                    className="message-input-provider-menu"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "calc(100% + 10px)",
                      width: "280px",
                      background: "#111",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: "10px",
                      padding: "8px",
                      zIndex: 20,
                      boxShadow: "0 12px 30px rgba(0, 0, 0, 0.4)",
                    }}
                  >
                    <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "11px", marginBottom: "6px" }}>Provider</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                      {PROVIDER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleProviderSelect(option.value, close)}
                          style={{
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            fontSize: "12px",
                            textAlign: "left",
                            cursor: "pointer",
                            color: "white",
                            background: option.value === provider ? "#5f03f4" : "rgba(255, 255, 255, 0.09)",
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={(e) => { handleApplyModel(e); close(); }}>
                      <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "11px", marginBottom: "6px" }}>Model</div>
                      <input
                        value={modelDraft}
                        onChange={(event) => setModelDraft(event.target.value)}
                        placeholder="Model id"
                        style={{
                          width: "100%",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          borderRadius: "6px",
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "white",
                          fontSize: "12px",
                          padding: "6px 8px",
                          marginBottom: "8px",
                        }}
                      />
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                        {MODEL_PRESETS[provider].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setModelDraft(preset)}
                            style={{
                              border: "none",
                              borderRadius: "999px",
                              padding: "4px 8px",
                              fontSize: "11px",
                              cursor: "pointer",
                              color: "white",
                              background: modelDraft === preset ? "#5f03f4" : "rgba(255, 255, 255, 0.12)",
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <button
                        type="submit"
                        style={{
                          width: "50%",
                          border: "none",
                          borderRadius: "6px",
                          padding: "7px 10px",
                          fontSize: "12px",
                          cursor: "pointer",
                          color: "white",
                          background: "#5f03f4",
                        }}
                      >
                        Apply
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </Dropdown>
          
          <Dropdown>
            {({ isOpen, toggle, close }) => (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="message-input-add"
                  onClick={toggle}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  style={{
                    fontSize: "12px",
                    color: "#121212",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "inline-flex",
                    alignItems: "left",
                    gap: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <LucideCirclePlus size={18} style={{ transform: isOpen ? "rotate(45deg)" : "rotate(0deg)", color: "rgba(0, 0, 0, 0.6)", cursor: "pointer", alignItems: "center" }} />
                </button>

                {isOpen && (
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "calc(100% + 8px)",
                      width: "200px",
                      background: "#111",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "8px",
                      padding: "8px",
                      zIndex: 20,
                      transition: "opacity 0.2s ease",
                      boxShadow: "0 8px 20px rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => { alert("Add file action"); close(); }}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "white",
                        background: "rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      Add file
                    </button>
                  </div>
                )}

              </div>
            )}
          </Dropdown>
          


          <button
            type="submit"
            className="message-input-submit"
            disabled={isDisabled || !text.trim()}
            aria-label="Send message"
            style={{
              width: "40px",
              height: "40px",
              border: "none",
              borderRadius: "9999px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#121212",
              background: "rgba(255, 255, 255, 0.92)",
              transition: "opacity 0.2s ease",
            }}
          >
            {isSubmitting ? <Loader2 className="message-input-spinner" size={18} /> : <SendHorizontal size={18} />}
          </button>
        </div>
      </form>

      <style>{`

        .message-input-field:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.35);
        }

        .message-input-field::placeholder {
          color: rgb(0, 0, 0);
        }


        .message-input-submit:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .message-input-spinner {
          animation: message-input-spin 0.8s linear infinite;
        }

        @keyframes message-input-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }


      `}</style>
    </div>
  );
}



import { FormEvent, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

type MessageInputProps = {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
};

function InlineText({ text }: { text: string }): JSX.Element {
  return (
    <div className="msg-input-text">
      <div className="msg-input-text-wrapper">{text}</div>
    </div>
  );
}

export default function MessageInput({ disabled, onSubmit }: MessageInputProps): JSX.Element {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const provider = useSettingsStore((state) => state.provider);
  const model = useSettingsStore((state) => state.model);

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
    <>
      <form className="message-input-root" onSubmit={handleSubmit}>
        <InlineText text="Ask me anything!" />

        <textarea
          className="message-input-field"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type your message..."
          rows={2}
          disabled={isDisabled}
        />

        <div className="message-input-actions">
          <span className="message-input-provider">{provider} · {model}</span>

          <button
            type="submit"
            className="message-input-submit"
            disabled={isDisabled || !text.trim()}
            aria-label="Send message"
          >
            {isSubmitting ? <Loader2 className="message-input-spinner" size={18} /> : <SendHorizontal size={18} />}
          </button>
        </div>
      </form>

      <style>{`
        .message-input-root {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          background: rgba(18, 18, 18, 0.9);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .message-input-field {
          width: 100%;
          resize: vertical;
          min-height: 54px;
          max-height: 180px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          color: #f5f5f5;
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.4;
        }

        .message-input-field:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.35);
        }

        .message-input-field::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }

        .message-input-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .message-input-provider {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .message-input-submit {
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #121212;
          background: rgba(255, 255, 255, 0.92);
          transition: opacity 0.2s ease;
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

        .msg-input-text {
          align-items: flex-start;
          display: inline-flex;
        }

        .msg-input-text-wrapper {
          color: #1e1e1e;
          font-family: "Inter", Helvetica;
          font-size: 16px;
          font-style: normal;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 139.9999976158142%;
          white-space: nowrap;
          width: fit-content;
          color: rgba(255, 255, 255, 0.72);
        }
      `}</style>
    </>
  );
}



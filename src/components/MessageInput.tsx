import { FormEvent, useState } from "react";
import { SendHorizonal, Loader2 } from "lucide-react";

export default function MessageInput(props: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}): JSX.Element {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || props.disabled || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await props.onSubmit(value);
      setText("");
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="message-input">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask JARVIS anything..."
            rows={2}
            disabled={props.disabled || isSubmitting}
            className="w-full rounded-xl px-4 py-3 pr-12 text-xs resize-none outline-none motion-safe:transition-[border-color,box-shadow] duration-150 ease-out disabled:opacity-40"
            style={{
              backgroundColor: "var(--bg-field)",
              border: "1px solid var(--border-field)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px rgba(0, 229, 255, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-field)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>
        <button
          type="submit"
          disabled={props.disabled || isSubmitting || text.trim().length === 0}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold motion-safe:transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--accent-glow)",
            color: "#fff",
          }}
          onMouseEnter={(e) => {
            if (!props.disabled && text.trim().length > 0)
              e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
          }}
        >
          {props.disabled || isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <SendHorizonal size={16} />
          )}
        </button>
      </div>
    </form>
  );
}

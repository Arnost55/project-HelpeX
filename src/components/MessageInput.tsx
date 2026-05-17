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
    <form onSubmit={handleSubmit} className="border-t border-[#30363D] px-5 py-4 bg-[#0D1117]/50">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask JARVIS anything..."
            rows={2}
            disabled={props.disabled || isSubmitting}
            className="w-full bg-[#21262D] border border-[#30363D] rounded-xl px-4 py-3 pr-12 text-sm text-[#F0F6FC] placeholder-[#8B949E] resize-none outline-none transition-all duration-200 focus:border-cyan-500 focus:shadow-[0_0_12px_rgba(0,245,255,0.15)] disabled:opacity-50 font-sans"
          />
        </div>
        <button
          type="submit"
          disabled={props.disabled || isSubmitting || text.trim().length === 0}
          className="cyber-btn cyber-btn-primary px-4 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
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

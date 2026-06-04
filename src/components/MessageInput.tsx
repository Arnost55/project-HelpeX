import { FormEvent, useState } from "react";
import { SendHorizonal, Loader2 } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

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
    <form onSubmit={handleSubmit}>
      <div className="flex items-end gap-3 max-w-2xl mx-auto">
        <button
          type="button"
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '100px',
            backgroundColor: '#D9D9D9',
            border: 'none',
            cursor: 'pointer',
            color: '#1E1E1E',
          }}
          title="Add attachment"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 relative flex items-end gap-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask me anything!"
            rows={1}
            disabled={props.disabled || isSubmitting}
            className="w-full rounded-2xl px-6 py-3 text-sm resize-none outline-none motion-safe:transition-[border-color,box-shadow] duration-150 ease-out disabled:opacity-40"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #D9D9D9',
              color: '#1E1E1E',
              fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif',
              fontWeight: 400,
              fontSize: '16px',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#D9D9D9';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#D9D9D9';
            }}
          />
          <label
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-medium flex-shrink-0"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#1E1E1E',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              fontFamily: 'Roboto, -apple-system, Roboto, Helvetica, sans-serif',
            }}
            title="Model selector"
            htmlFor="model-select"
          >
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{useSettingsStore((s) => s.model)}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </label>
          <select
            id="model-select"
            value={useSettingsStore((s) => s.model)}
            onChange={(e) => useSettingsStore.getState().setModel(e.target.value)}
            disabled={props.disabled || isSubmitting}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="gpt-4o-mini">GPT-4o-mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-3.5-turbo">GPT-3.5-turbo</option>
            <option value="claude-2">Claude 2</option>
            <option value="claude-instant-100k">Claude Instant 100k</option>
            <option value="groq-1">Groq 1</option>
            <option value="together-1">Together 1</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={props.disabled || isSubmitting || text.trim().length === 0}
          className="flex items-center justify-center gap-2 flex-shrink-0 motion-safe:transition-all duration-150 ease-out"
          style={{
            width: '45px',
            height: '44px',
            borderRadius: '8px',
            backgroundColor: '#D9D9D9',
            border: '1px solid #B3B3B3',
            color: '#000000',
            cursor: props.disabled || isSubmitting || text.trim().length === 0 ? 'not-allowed' : 'pointer',
            opacity: props.disabled || isSubmitting || text.trim().length === 0 ? 0.6 : 1,
          }}
          title="Send message"
        >
          {props.disabled || isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0)">
                <path d="M14.6667 1.33331L7.33337 8.66665M7.33337 8.66665L1.33337 5.99998L14.6667 1.33331L10 14.6666L7.33337 8.66665Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
              <defs>
                <clipPath id="clip0">
                  <rect width="16" height="16" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}

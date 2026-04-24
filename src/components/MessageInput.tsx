import { FormEvent, useState } from "react";

export default function MessageInput(props: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}): JSX.Element {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || props.disabled || isSubmitting) {
      return;
    }

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
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask JARVIS anything..."
        rows={3}
        disabled={props.disabled || isSubmitting}
      />
      <button type="submit" disabled={props.disabled || isSubmitting || text.trim().length === 0}>
        {props.disabled || isSubmitting ? "Streaming..." : "Send"}
      </button>
    </form>
  );
}

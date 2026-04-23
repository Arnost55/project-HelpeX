import { FormEvent, useState } from "react";

export default function MessageInput(props: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}): JSX.Element {
  const [text, setText] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || props.disabled) {
      return;
    }

    setText("");
    await props.onSubmit(value);
  }

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask JARVIS anything..."
        rows={3}
        disabled={props.disabled}
      />
      <button type="submit" disabled={props.disabled || text.trim().length === 0}>
        {props.disabled ? "Streaming..." : "Send"}
      </button>
    </form>
  );
}

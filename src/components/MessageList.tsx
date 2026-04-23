import type { Message } from "../types/chat";

export default function MessageList(props: { messages: Message[] }): JSX.Element {
  if (props.messages.length === 0) {
    return (
      <div className="empty-state">
        <h2>Ready when you are.</h2>
        <p>Ask a question to start your first conversation.</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {props.messages.map((message) => (
        <article key={message.id} className={`message ${message.role}`}>
          <header>{message.role === "user" ? "You" : "JARVIS"}</header>
          <p>{message.content}</p>
        </article>
      ))}
    </div>
  );
}

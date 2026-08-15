import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { Bot, User } from "lucide-react";
import type { Message } from "../types/chat";

function CodeBlock({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  return (
    <div className="my-3 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border-panel)" }}>
      {language ? (
        <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
            {language}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-[10px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Copy
          </button>
        </div>
      ) : null}
      <pre className="m-0 overflow-x-auto p-4" style={{ backgroundColor: "var(--surface-panel)" }}>
        <code className={className || ""} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border-panel)" }}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return <code className={className} {...props}>{children}</code>;
    }
    return (
      <code
        className="rounded-lg px-1.5 py-0.5 text-xs"
        style={{ backgroundColor: "var(--surface-elevated)", color: "var(--accent-primary)" }}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    const codeElement = children as ReactElement | undefined;
    const language = codeElement?.props?.className || "";
    return <CodeBlock className={language}>{codeElement?.props?.children}</CodeBlock>;
  },
  table({ children }) {
    return <Table>{children}</Table>;
  },
};

interface MessageListProps {
  isStreaming: boolean;
  messages: Message[];
  variant?: "full" | "compact";
}

export default function MessageList({
  isStreaming,
  messages,
  variant = "full",
}: MessageListProps): JSX.Element {
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator = isStreaming && (!lastMessage || lastMessage.role !== "assistant");

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="max-w-md text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
          >
            <Bot size={28} style={{ color: "var(--accent-primary)" }} />
          </div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            HelpeX is ready.
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Start a conversation to inspect systems, run tools, or queue approvals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-y-auto ${variant === "compact" ? "pr-1" : "pr-2"}`}>
      <div className="space-y-4">
        {messages.map((message) => {
          const user = message.role === "user";
          return (
            <article key={message.id} className={`flex gap-3 ${user ? "justify-end" : "justify-start"}`}>
              {!user ? (
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
                  style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}
                >
                  <Bot size={16} style={{ color: "var(--accent-primary)" }} />
                </div>
              ) : null}
              <div
                className={`${variant === "compact" ? "max-w-[88%]" : "max-w-[78%]"} rounded-3xl border px-4 py-3`}
                style={{
                  backgroundColor: user ? "rgba(93, 227, 201, 0.08)" : "var(--surface-panel)",
                  borderColor: user ? "var(--border-focus)" : "var(--border-panel)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  {user ? <User size={14} style={{ color: "var(--text-secondary)" }} /> : null}
                  <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
                    {user ? "Operator" : "HelpeX"}
                  </span>
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={markdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            </article>
          );
        })}

        {showTypingIndicator ? (
          <article className="flex gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
              style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-elevated)" }}
            >
              <Bot size={16} style={{ color: "var(--accent-primary)" }} />
            </div>
            <div className="rounded-3xl border px-4 py-3" style={{ backgroundColor: "var(--surface-panel)", borderColor: "var(--border-panel)" }}>
              <div className="flex gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: "var(--accent-primary)" }} />
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: "var(--accent-primary)", animationDelay: "120ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: "var(--accent-primary)", animationDelay: "240ms" }} />
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}

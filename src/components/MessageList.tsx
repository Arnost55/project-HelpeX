import type { Message } from "../types/chat";
import type { HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { User, Bot } from "lucide-react";

function CodeBlock({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  return (
    <div className="my-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-panel)' }}>
      {language && (
        <div className="px-4 py-1.5 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-field)', borderBottom: '1px solid var(--border-panel)' }}>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{language}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-[10px] font-mono transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-glow)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            copy
          </button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto m-0" style={{ backgroundColor: 'var(--bg-field)' }}>
        <code className={`${className || ""} text-sm font-mono leading-relaxed`} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-panel)' }}>
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
      <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: 'var(--bg-field)', color: 'var(--accent-glow)' }} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    const codeElement = children as React.ReactElement | undefined;
    const lang = codeElement?.props?.className?.replace("language-", "") || "";
    return <CodeBlock className={`language-${lang}`}>{codeElement?.props?.children}</CodeBlock>;
  },
  table({ children }) {
    return <Table>{children}</Table>;
  }
};

export default function MessageList(props: { messages: Message[]; isStreaming: boolean }): JSX.Element {
  const lastMessage = props.messages[props.messages.length - 1];
  const showTypingIndicator = props.isStreaming && (!lastMessage || lastMessage.role !== "assistant");

  if (props.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid rgba(0, 245, 184, 0.15)' }}>
            <Bot size={32} style={{ color: 'var(--accent-glow)' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Ready when you are.</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ask a question to start your first conversation.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      {props.messages.map((message) => (
        <article
          key={message.id}
          className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
        >
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid var(--message-user-border)' }}
          >
            {message.role === "user" ? (
              <User size={14} style={{ color: 'var(--accent-glow)' }} />
            ) : (
              <Bot size={14} style={{ color: 'var(--accent-glow)' }} />
            )}
          </div>

          {/* Bubble */}
          <div
            className="max-w-[75%] rounded-2xl px-4 py-3"
            style={{
              backgroundColor: message.role === 'user' ? 'var(--message-user)' : 'var(--bg-panel)',
              border: message.role === 'user' ? '1px solid var(--message-user-border)' : '1px solid var(--border-panel)',
              borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {message.role === "user" ? "You" : "JARVIS"}
            </p>
            <div className="prose prose-invert prose-sm max-w-none">
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
      ))}

      {showTypingIndicator && (
        <article className="flex gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid var(--message-user-border)' }}>
            <Bot size={14} style={{ color: 'var(--accent-glow)' }} />
          </div>
          <div className="rounded-2xl rounded-tl-md px-4 py-3" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>JARVIS</p>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-glow)', animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-glow)', animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-glow)', animationDelay: "300ms" }} />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

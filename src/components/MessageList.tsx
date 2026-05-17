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
    <div className="my-3 rounded-lg overflow-hidden border border-[#30363D]">
      {language && (
        <div className="bg-[#21262D] px-4 py-1.5 border-b border-[#30363D] flex items-center justify-between">
          <span className="text-[10px] font-mono text-[#8B949E] uppercase tracking-wider">{language}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-[10px] text-[#8B949E] hover:text-cyan-400 transition-colors font-mono"
          >
            copy
          </button>
        </div>
      )}
      <pre className="bg-[#161B22] p-4 overflow-x-auto m-0">
        <code className={`${className || ""} text-sm font-mono leading-relaxed`} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-[#30363D]">
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
      <code className="bg-[#21262D] text-cyan-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
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
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-5 shadow-[0_0_20px_rgba(0,245,255,0.1)]">
            <Bot size={32} className="text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-[#F0F6FC] mb-2">Ready when you are.</h2>
            <p className="text-sm text-[#8B949E]">
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
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              message.role === "user"
                ? "bg-cyan-500/10 border border-cyan-500/20"
                : "bg-cyan-500/10 border border-cyan-500/20"
            }`}
          >
            {message.role === "user" ? (
              <User size={14} className="text-cyan-400" />
            ) : (
              <Bot size={14} className="text-cyan-400" />
            )}
          </div>

          {/* Bubble */}
          <div
            className={`max-w-[75%] ${
              message.role === "user"
                ? "bg-cyan-500/10 border border-cyan-500/20 rounded-2xl rounded-tr-md px-4 py-3"
                : "bg-[#161B22] border border-[#30363D] rounded-2xl rounded-tl-md px-4 py-3"
            }`}
          >
            <p className="text-[10px] text-[#8B949E] font-semibold uppercase tracking-wider mb-1.5">
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
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot size={14} className="text-cyan-400" />
          </div>
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl rounded-tl-md px-4 py-3">
            <p className="text-[10px] text-[#8B949E] font-semibold uppercase tracking-wider mb-1.5">JARVIS</p>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

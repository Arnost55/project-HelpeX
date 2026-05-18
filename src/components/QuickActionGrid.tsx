import { useSettingsStore } from "../store/settingsStore";
import { Bot, Code, PenLine, Globe, Lightbulb, Cpu, MessageSquare, Sparkles, Wifi, WifiOff, Gauge, Wrench, Loader2 } from "lucide-react";
import type { ActionType } from "../utils/promptTemplates";

interface QuickAction {
  id: ActionType;
  label: string;
  prompt: string;
  icon: typeof Bot;
  category: string;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { id: "explain", label: "Explain Code", prompt: "Explain this code in detail:", icon: Code, category: "Development" },
  { id: "write", label: "Write Content", prompt: "Write a detailed article about:", icon: PenLine, category: "Content" },
  { id: "translate", label: "Translate", prompt: "Translate the following text to:", icon: Globe, category: "Utility" },
  { id: "brainstorm", label: "Brainstorm", prompt: "Brainstorm ideas for:", icon: Lightbulb, category: "Creative" },
  { id: "debug", label: "Debug", prompt: "Help me debug this issue:", icon: Wrench, category: "Development" },
  { id: "summarize", label: "Summarize", prompt: "Summarize the following:", icon: MessageSquare, category: "Utility" },
];

export default function QuickActionGrid(props: {
  onSendPrompt: (actionType: ActionType, prompt: string) => void;
  loadingAction: ActionType | null;
}): JSX.Element {
  const provider = useSettingsStore((s) => s.provider);
  const model = useSettingsStore((s) => s.model);
  const providerHealth = useSettingsStore((s) => s.providerHealth);
  const providerStats = useSettingsStore((s) => s.providerStats);

  const health = providerHealth[provider];
  const stats = providerStats[provider];

  const systemStatus = {
    provider,
    model,
    connected: health?.healthy ?? false,
    latency: health?.latencyMs ?? 0,
    successRate: stats && (stats.successCount + stats.failureCount) > 0
      ? Math.round((stats.successCount / (stats.successCount + stats.failureCount)) * 100)
      : null,
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12 overflow-y-auto">
      {/* Greeting */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>Good morning, Commander</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>How can JARVIS assist you today?</p>
      </div>

      {/* System Status */}
      <div className="flex items-center gap-4 mb-10">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{
          backgroundColor: systemStatus.connected ? 'rgba(0, 245, 184, 0.06)' : 'var(--bg-field)',
          color: systemStatus.connected ? 'var(--accent-glow)' : 'var(--text-muted)',
          border: systemStatus.connected ? '1px solid rgba(0, 245, 184, 0.15)' : '1px solid var(--border-subtle)',
        }}>
          {systemStatus.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {systemStatus.connected ? `${systemStatus.latency}ms` : "Offline"}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-field)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
          <Cpu size={12} />
          {systemStatus.provider}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-field)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
          <Gauge size={12} />
          {systemStatus.successRate !== null ? `${systemStatus.successRate}% success` : "No data"}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-field)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
          <Wifi size={12} />
          Assistant Ready
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[500px]">
        {DEFAULT_ACTIONS.map((action) => {
          const Icon = action.icon;
          const isLoading = props.loadingAction === action.id;
          const isAnyLoading = props.loadingAction !== null;
          return (
            <button
              key={action.id}
              onClick={() => props.onSendPrompt(action.id, `${action.prompt} `)}
              disabled={isAnyLoading}
              className="group flex flex-col items-center gap-2 px-4 py-5 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: isLoading ? 'var(--accent-soft)' : 'var(--bg-panel)',
                border: isLoading
                  ? '1px solid var(--border-focus)'
                  : isAnyLoading
                    ? '1px solid var(--border-subtle)'
                    : '1px solid var(--border-panel)',
                opacity: isAnyLoading && !isLoading ? 0.3 : isLoading ? 0.5 : 1,
                cursor: isAnyLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (isAnyLoading) return;
                e.currentTarget.style.borderColor = 'var(--border-focus)';
                e.currentTarget.style.backgroundColor = 'var(--accent-soft)';
              }}
              onMouseLeave={(e) => {
                if (isAnyLoading) return;
                e.currentTarget.style.borderColor = 'var(--border-panel)';
                e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
              }}
            >
              <div className="w-10 h-10 rounded-lg border flex items-center justify-center transition-all duration-200" style={{
                backgroundColor: isLoading ? 'var(--accent-soft)' : 'var(--accent-soft)',
                borderColor: 'var(--message-user-border)',
              }}>
                {isLoading ? (
                  <Loader2 size={18} style={{ color: 'var(--accent-glow)' }} className="animate-spin" />
                ) : (
                  <Icon size={18} style={{ color: 'var(--accent-glow)' }} />
                )}
              </div>
              <span className="text-xs font-medium transition-colors" style={{
                color: isLoading ? 'var(--accent-glow)' : isAnyLoading ? 'var(--text-muted)' : 'var(--text-secondary)',
              }}>
                {isLoading ? "Processing..." : action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tips */}
      <div className="mt-10 text-center">
        <p className="text-[10px] flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Sparkles size={10} />
          Type a message to start the conversation
        </p>
      </div>
    </div>
  );
}

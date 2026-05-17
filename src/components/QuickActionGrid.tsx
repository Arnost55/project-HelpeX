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
        <h1 className="text-2xl font-bold text-[#F0F6FC] tracking-tight mb-2">Good morning, Commander</h1>
        <p className="text-sm text-[#8B949E]">How can JARVIS assist you today?</p>
      </div>

      {/* System Status */}
      <div className="flex items-center gap-4 mb-10">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${
          systemStatus.connected ? "bg-green-500/10 text-green-400" : "bg-[#21262D] text-[#8B949E]"
        }`}>
          {systemStatus.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {systemStatus.connected ? `${systemStatus.latency}ms` : "Offline"}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#21262D] text-xs text-[#8B949E]">
          <Cpu size={12} />
          {systemStatus.provider}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#21262D] text-xs text-[#8B949E]">
          <Gauge size={12} />
          {systemStatus.successRate !== null ? `${systemStatus.successRate}% success` : "No data"}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#21262D] text-[#8B949E]">
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
              className={`quick-action-btn group flex flex-col items-center gap-2 px-4 py-5 rounded-xl bg-[#161B22] border transition-all duration-200 ${
                isLoading
                  ? "border-cyan-500/40 opacity-50 cursor-not-allowed loading-pulse"
                  : isAnyLoading
                    ? "border-[#30363D] opacity-30 cursor-not-allowed"
                    : "border-[#30363D] hover:border-cyan-500/30 hover:bg-[#1C2333] hover:shadow-[0_0_20px_rgba(0,245,255,0.08)] active:scale-[0.97] active:border-cyan-500/50"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all duration-200 ${
                isLoading
                  ? "bg-cyan-500/20 border-cyan-500/30"
                  : isAnyLoading
                    ? "bg-cyan-500/5 border-cyan-500/10"
                    : "bg-cyan-500/10 border-cyan-500/20 group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_12px_rgba(0,245,255,0.15)]"
              }`}>
                {isLoading ? (
                  <Loader2 size={18} className="text-cyan-400 animate-spin" />
                ) : (
                  <Icon size={18} className="text-cyan-400" />
                )}
              </div>
              <span className={`text-xs font-medium transition-colors ${
                isLoading ? "text-cyan-400" : isAnyLoading ? "text-[#8B949E]" : "text-[#C9D1D9] group-hover:text-[#F0F6FC]"
              }`}>
                {isLoading ? "Processing..." : action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tips */}
      <div className="mt-10 text-center">
        <p className="text-[10px] text-[#30363D] flex items-center justify-center gap-1">
          <Sparkles size={10} />
          Type a message to start the conversation
        </p>
      </div>
    </div>
  );
}

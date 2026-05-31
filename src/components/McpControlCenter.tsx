import React, { useState } from "react";
import { useMcp } from "../hooks/useMcp";

export const McpControlCenter: React.FC = () => {
    const { activeServers, isLoading, error, registerNewNode, removeNode } = useMcp();
    const [nodeName, setNodeName] = useState("");
    const [nodeCmd, setNodeCmd] = useState("");
    const [nodeArgs, setNodeArgs] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nodeName || !nodeCmd) return;
        const success = await registerNewNode(nodeName, nodeCmd, nodeArgs);
        if (success) {
            setNodeName("");
            setNodeCmd("");
            setNodeArgs("");
        }
    };

    const serverEntries = Object.entries(activeServers);

    return (
        <div className="flex flex-col gap-6 w-full h-full overflow-y-auto pr-2 selection:bg-[rgba(0,245,184,0.2)]">
            <div>
                <h3 className="text-[18px] font-bold tracking-tight text-[#f4f4f5]">Protocol Integrations</h3>
                <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#6b7280] mt-1">
                    Manage asynchronous model context protocol nodes over local stdio streams
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                className="p-5 rounded-xl border border-[rgba(255,255,255,0.03)] flex flex-col gap-4 bg-[#0f0f12]"
            >
                <div className="text-[11px] font-mono font-bold text-[#6b7280] uppercase tracking-wider">
                    Initialize External Host Node
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-[#71717a]">Node Identifier</label>
                        <input
                            type="text"
                            placeholder="e.g., Filesystem-Engine"
                            value={nodeName}
                            onChange={(e) => setNodeName(e.target.value)}
                            className="h-9 px-3 text-[13px] rounded-lg bg-[#070708] border border-[rgba(255,255,255,0.04)] text-[#f4f4f5] outline-none focus:border-[rgba(0,245,184,0.3)] transition-colors"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-[#71717a]">Executable Command</label>
                        <input
                            type="text"
                            placeholder="e.g., npx, uvx, node"
                            value={nodeCmd}
                            onChange={(e) => setNodeCmd(e.target.value)}
                            className="h-9 px-3 text-[13px] rounded-lg bg-[#070708] border border-[rgba(255,255,255,0.04)] text-[#f4f4f5] outline-none focus:border-[rgba(0,245,184,0.3)] transition-colors"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-[#71717a]">Runtime Arguments</label>
                        <input
                            type="text"
                            placeholder="e.g., -y @modelcontextprotocol/server-filesystem"
                            value={nodeArgs}
                            onChange={(e) => setNodeArgs(e.target.value)}
                            className="h-9 px-3 text-[13px] rounded-lg bg-[#070708] border border-[rgba(255,255,255,0.04)] text-[#f4f4f5] outline-none focus:border-[rgba(0,245,184,0.3)] transition-colors"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !nodeName || !nodeCmd}
                    className={`self-end h-9 px-5 rounded-lg border text-[11px] font-mono font-bold uppercase tracking-wider transition-all duration-150 ${
                        isLoading
                        ? "opacity-40 cursor-not-allowed animate-pulse border-gray-800 text-gray-500"
                        : "border-[rgba(0,245,184,0.2)] text-[#00f5b8] hover:bg-[rgba(0,245,184,0.04)] active:scale-[0.98]"
                    }`}
                >
                    {isLoading ? "Running Handshake..." : "Link Server Node"}
                </button>
            </form>

            {error && (
                <div className="p-3.5 rounded-xl border border-red-900/30 bg-red-950/10 text-[11px] font-mono text-red-400 leading-normal">
                    <span className="font-bold uppercase tracking-wide mr-1 text-red-500">Node Link Fault:</span> {error}
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="text-[11px] font-mono font-bold text-[#6b7280] uppercase tracking-wider">
                    Active Protocol System Capabilities
                </div>

                {serverEntries.map(([serverName, tools]) => (
                    <div
                        key={serverName}
                        className="p-4 rounded-xl border border-[rgba(255,255,255,0.03)] bg-[#0f0f12] flex flex-col gap-3"
                    >
                        <div className="flex items-center justify-between border-b border-white/[0.02] pb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#00f5b8] animate-pulse shadow-[0_0_8px_#00f5b8]" />
                                <span className="text-[14px] font-bold text-[#f4f4f5] font-mono">{serverName}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-mono uppercase text-[#6b7280]">
                                    {tools.length} handles active
                                </span>
                                <button
                                    onClick={() => removeNode(serverName)}
                                    className="text-[10px] font-mono uppercase tracking-wider text-[#71717a] hover:text-red-400 border border-transparent hover:border-red-900/30 hover:bg-red-950/10 px-2 py-0.5 rounded transition-all duration-150"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 mt-1">
                            {tools.map((tool) => (
                                <div
                                    key={tool.name}
                                    className="p-3 rounded-lg bg-[#070708] border border-[rgba(255,255,255,0.02)] flex flex-col gap-1.5"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-bold text-[#00f5b8] font-mono">{tool.name}</span>
                                        <span className="text-[9px] font-mono text-[#6b7280] uppercase tracking-widest bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.02]">
                                            tool
                                        </span>
                                    </div>
                                    {tool.description && (
                                        <p className="text-[11px] text-[#71717a] leading-relaxed">{tool.description}</p>
                                    )}
                                    {tool.input_schema?.properties && Object.keys(tool.input_schema.properties).length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {Object.keys(tool.input_schema.properties).map((prop) => (
                                                <span key={prop} className="text-[10px] font-mono text-[#6b7280] bg-black/30 px-1.5 py-0.5 rounded border border-white/[0.01]">
                                                    {prop}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {serverEntries.length === 0 && !isLoading && (
                    <div className="text-center py-8 border border-dashed border-[rgba(255,255,255,0.03)] rounded-xl text-[12px] font-mono text-[#6b7280]">
                        No active context protocol nodes connected.
                    </div>
                )}
            </div>
        </div>
    );
};

import { useState } from "react";
import { Plus, PlugZap, Power, Wrench } from "lucide-react";
import { useMcp } from "../hooks/useMcp";

export function McpControlCenter(): JSX.Element {
  const { activeServers, isLoading, error, registerNewNode, removeNode } = useMcp();
  const [nodeName, setNodeName] = useState("");
  const [nodeCmd, setNodeCmd] = useState("");
  const [nodeArgs, setNodeArgs] = useState("");

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!nodeName || !nodeCmd) return;

    const success = await registerNewNode(nodeName, nodeCmd, nodeArgs);
    if (success) {
      setNodeName("");
      setNodeCmd("");
      setNodeArgs("");
    }
  }

  const serverEntries = Object.entries(activeServers);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Protocol Integrations
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Manage asynchronous model context protocol servers over local stdio bridges.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border p-5"
        style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Plus size={16} style={{ color: "var(--accent-primary)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Register MCP Server
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Server name</span>
            <input
              type="text"
              value={nodeName}
              onChange={(event) => setNodeName(event.target.value)}
              placeholder="e.g. home-assistant"
              className="w-full rounded-2xl border px-3 py-2 outline-none"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Executable</span>
            <input
              type="text"
              value={nodeCmd}
              onChange={(event) => setNodeCmd(event.target.value)}
              placeholder="e.g. npx"
              className="w-full rounded-2xl border px-3 py-2 outline-none"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Arguments</span>
            <input
              type="text"
              value={nodeArgs}
              onChange={(event) => setNodeArgs(event.target.value)}
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem"
              className="w-full rounded-2xl border px-3 py-2 outline-none"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={isLoading || !nodeName || !nodeCmd}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
          >
            <PlugZap size={15} />
            {isLoading ? "Connecting..." : "Connect server"}
          </button>
        </div>
      </form>

      {error ? (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(249, 115, 115, 0.28)", backgroundColor: "rgba(127, 29, 29, 0.12)", color: "var(--status-danger)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {serverEntries.map(([serverName, tools]) => (
          <section
            key={serverName}
            className="rounded-3xl border p-4"
            style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--status-success)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {serverName}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {tools.length} active tools
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeNode(serverName)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
              >
                <Power size={14} />
                Disconnect
              </button>
            </div>

            <div className="grid gap-3">
              {tools.map((tool) => (
                <article
                  key={tool.name}
                  className="rounded-2xl border px-4 py-3"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Wrench size={14} style={{ color: "var(--text-secondary)" }} />
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {tool.name}
                      </p>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]" style={{ backgroundColor: "var(--surface-panel)", color: "var(--text-muted)" }}>
                      Tool
                    </span>
                  </div>
                  {tool.description ? (
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {tool.description}
                    </p>
                  ) : null}
                  {tool.input_schema?.properties && Object.keys(tool.input_schema.properties).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.keys(tool.input_schema.properties).map((property) => (
                        <span
                          key={property}
                          className="rounded-full px-2 py-1 text-[11px]"
                          style={{ backgroundColor: "var(--surface-panel)", color: "var(--text-secondary)" }}
                        >
                          {property}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}

        {serverEntries.length === 0 && !isLoading ? (
          <div
            className="rounded-3xl border border-dashed px-6 py-12 text-center text-sm"
            style={{ borderColor: "var(--border-panel)", color: "var(--text-muted)" }}
          >
            No active MCP servers connected.
          </div>
        ) : null}
      </div>
    </div>
  );
}

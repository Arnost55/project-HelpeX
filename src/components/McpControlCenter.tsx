import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Play,
  Plus,
  Power,
  RotateCcw,
  Save,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMcp } from "../hooks/useMcp";
import type { McpServerConfigInput, McpServerEnvironmentEntry, McpServerView } from "../types/mcp";

interface EditableServerForm {
  id: string | null;
  originalName: string | null;
  name: string;
  transport: string;
  cmd: string;
  args: string;
  enabled: boolean;
  env: McpServerEnvironmentEntry[];
}

function emptyForm(): EditableServerForm {
  return {
    id: null,
    originalName: null,
    name: "",
    transport: "stdio",
    cmd: "",
    args: "",
    enabled: true,
    env: [],
  };
}

function argsFromString(value: string): string[] {
  return value
    .split(/\r?\n|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTone(status: McpServerView["status"]): { label: string; color: string } {
  switch (status) {
    case "CONNECTED":
      return { label: "Connected", color: "var(--status-success)" };
    case "INITIALIZING":
      return { label: "Initializing", color: "var(--status-warning)" };
    case "STARTING":
      return { label: "Starting", color: "var(--status-warning)" };
    case "RESTARTING":
      return { label: "Restarting", color: "var(--status-warning)" };
    case "STOPPING":
      return { label: "Stopping", color: "var(--text-muted)" };
    case "STOPPED":
      return { label: "Stopped", color: "var(--text-muted)" };
    case "ERROR":
      return { label: "Error", color: "var(--status-danger)" };
    case "NEEDS_CREDENTIALS":
      return { label: "Needs credentials", color: "var(--status-warning)" };
    case "DISABLED":
      return { label: "Disabled", color: "var(--text-muted)" };
    default:
      return { label: "Disconnected", color: "var(--text-muted)" };
  }
}

export function McpControlCenter(): JSX.Element {
  const {
    servers,
    isLoading,
    error,
    saveServer,
    removeServer,
    disconnectServer,
    toggleServerEnabled,
    toggleToolEnabled,
    restartServer,
  } = useMcp();
  const [form, setForm] = useState<EditableServerForm>(emptyForm);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const summary = useMemo(() => {
    const connected = servers.filter((server) => server.status === "CONNECTED").length;
    const totalTools = servers.reduce((sum, server) => sum + server.toolCount, 0);
    const disabledTools = servers.reduce((sum, server) => sum + server.disabledToolCount, 0);
    return { connected, totalTools, disabledTools };
  }, [servers]);

  function loadServerIntoForm(server: McpServerView): void {
    setForm({
      id: server.id,
      originalName: server.name,
      name: server.name,
      transport: server.transport,
      cmd: server.cmd,
      args: server.args.join("\n"),
      enabled: server.enabled,
      env: server.env.map((entry) => ({ ...entry, value: entry.value ?? "" })),
    });
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusyKey("save");
    try {
      const payload: McpServerConfigInput = {
        id: form.id,
        name: form.name.trim(),
        transport: form.transport,
        cmd: form.cmd.trim(),
        args: argsFromString(form.args),
        enabled: form.enabled,
        env: form.env
          .filter((entry) => entry.name.trim())
          .map((entry) => ({
            name: entry.name.trim(),
            value: entry.secret ? entry.value?.trim() || undefined : entry.value?.trim() || undefined,
            secret: entry.secret,
            secretRef: entry.secretRef,
            configured: entry.configured,
          })),
      };

      if (!payload.name || !payload.cmd) {
        return;
      }

      if (form.originalName && form.originalName !== payload.name) {
        await removeServer(form.originalName);
      }
      await saveServer(payload);
      setForm(emptyForm());
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel)" }}>
          <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
            Connected
          </p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {summary.connected}
          </p>
        </div>
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel)" }}>
          <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
            Available tools
          </p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {summary.totalTools}
          </p>
        </div>
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-panel)", backgroundColor: "var(--surface-panel)" }}>
          <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
            Disabled tools
          </p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {summary.disabledTools}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border p-5"
        style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {form.originalName ? "Edit integration" : "Add integration"}
            </h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Configure a real MCP stdio server, then HelpeX will spawn it, initialize it, and discover tools.
            </p>
          </div>
          {form.originalName ? (
            <button
              type="button"
              onClick={() => setForm(emptyForm())}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-2xl border px-3 py-2"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
              placeholder="home-assistant"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Transport</span>
            <select
              value={form.transport}
              onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value }))}
              className="w-full rounded-2xl border px-3 py-2"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
            >
              <option value="stdio">stdio</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Command</span>
            <input
              value={form.cmd}
              onChange={(event) => setForm((current) => ({ ...current, cmd: event.target.value }))}
              className="w-full rounded-2xl border px-3 py-2"
              style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
              placeholder="npx"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Enabled on startup</span>
            <div className="flex h-[42px] items-center rounded-2xl border px-3" style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}>
              <input
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
            </div>
          </label>
        </div>

        <label className="mt-3 block space-y-2 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Arguments</span>
          <textarea
            value={form.args}
            onChange={(event) => setForm((current) => ({ ...current, args: event.target.value }))}
            className="min-h-[96px] w-full rounded-2xl border px-3 py-2"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
            placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
          />
        </label>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Environment variables
            </p>
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  env: [...current.env, { name: "", value: "", secret: true, configured: false }],
                }))
              }
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
            >
              <Plus size={14} />
              Add env
            </button>
          </div>

          {form.env.map((entry, index) => (
            <div key={`${entry.name}-${index}`} className="grid gap-3 md:grid-cols-[1fr_1fr_120px_44px]">
              <input
                value={entry.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    env: current.env.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  }))
                }
                className="rounded-2xl border px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                placeholder="HOME_ASSISTANT_TOKEN"
              />
              <input
                value={entry.value ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    env: current.env.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item,
                    ),
                  }))
                }
                className="rounded-2xl border px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}
                placeholder={entry.secret ? "Secret value" : "Value"}
              />
              <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm" style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-panel)" }}>
                <input
                  checked={entry.secret}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      env: current.env.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, secret: event.target.checked } : item,
                      ),
                    }))
                  }
                  type="checkbox"
                />
                Secret
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    env: current.env.filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
                className="rounded-2xl border"
                style={{ borderColor: "var(--border-panel)", color: "var(--status-danger)" }}
              >
                <Trash2 size={14} className="mx-auto" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={isLoading || busyKey === "save"}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-primary)" }}
          >
            <Save size={15} />
            {busyKey === "save" ? "Saving..." : form.originalName ? "Save changes" : "Add server"}
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

      <div className="space-y-4">
        {servers.map((server) => {
          const tone = statusTone(server.status);
          return (
            <section
              key={server.name}
              className="rounded-3xl border p-4"
              style={{ backgroundColor: "var(--surface-panel-strong)", borderColor: "var(--border-panel)" }}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.color }} />
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {server.name}
                    </p>
                    <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]" style={{ backgroundColor: "var(--surface-panel)", color: tone.color }}>
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {server.cmd} {server.args.join(" ")}
                  </p>
                  {server.error ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--status-danger)" }}>
                      {server.error}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadServerIntoForm(server)}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartServer(server.name)}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    <RotateCcw size={14} />
                    Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => void disconnectServer(server.name)}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: "var(--text-secondary)" }}
                  >
                    <Power size={14} />
                    Disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleServerEnabled(server.name, !server.enabled)}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border-panel)", color: server.enabled ? "var(--status-warning)" : "var(--status-success)" }}
                  >
                    {server.enabled ? <XCircle size={14} /> : <Play size={14} />}
                    {server.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeServer(server.name)}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: "rgba(249, 115, 115, 0.25)", color: "var(--status-danger)" }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
                  <p style={{ color: "var(--text-muted)" }}>Transport</p>
                  <p className="mt-1 font-medium" style={{ color: "var(--text-primary)" }}>{server.transport}</p>
                </div>
                <div className="rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
                  <p style={{ color: "var(--text-muted)" }}>Available tools</p>
                  <p className="mt-1 font-medium" style={{ color: "var(--text-primary)" }}>{server.toolCount}</p>
                </div>
                <div className="rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
                  <p style={{ color: "var(--text-muted)" }}>Disabled tools</p>
                  <p className="mt-1 font-medium" style={{ color: "var(--text-primary)" }}>{server.disabledToolCount}</p>
                </div>
              </div>

              {server.tools.length > 0 ? (
                <div className="space-y-3">
                  {server.tools.map((tool) => (
                    <article
                      key={`${server.name}-${tool.name}`}
                      className="rounded-2xl border px-4 py-3"
                      style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Wrench size={14} style={{ color: "var(--text-secondary)" }} />
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              {tool.name}
                            </p>
                            <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]" style={{ backgroundColor: "var(--surface-panel)", color: "var(--text-muted)" }}>
                              {tool.permission.level}
                            </span>
                            {tool.enabled ? (
                              <CheckCircle2 size={14} style={{ color: "var(--status-success)" }} />
                            ) : (
                              <AlertCircle size={14} style={{ color: "var(--status-warning)" }} />
                            )}
                          </div>
                          {tool.description ? (
                            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                              {tool.description}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            Alias: {tool.providerSafeAlias}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleToolEnabled(server.name, tool.name, !tool.enabled)}
                          className="rounded-xl border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border-panel)", color: tool.enabled ? "var(--status-warning)" : "var(--status-success)" }}
                        >
                          {tool.enabled ? "Disable tool" : "Enable tool"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-2xl border border-dashed px-4 py-6 text-sm"
                  style={{ borderColor: "var(--border-panel)", color: "var(--text-muted)" }}
                >
                  {server.status === "CONNECTED"
                    ? "This integration is connected but did not expose any tools."
                    : "No tools are available until this integration connects successfully."}
                </div>
              )}
            </section>
          );
        })}

        {servers.length === 0 ? (
          <div
            className="rounded-3xl border border-dashed px-6 py-12 text-center text-sm"
            style={{ borderColor: "var(--border-panel)", color: "var(--text-muted)" }}
          >
            No MCP integrations configured yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

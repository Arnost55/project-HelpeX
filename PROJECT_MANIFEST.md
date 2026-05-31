# JARVIS AI — Project Manifest

## Core Architecture (5 Lines)

```
[React Frontend (TSX)] --invoke--> [Tauri Rust Backend (src-tauri/)]
  |                                      |
  |  zustand stores (chat, settings,     |  Tauri commands call jarvis-core (SQLite db)
  |  incognito) for UI state             |
  |                                      |
  |  Toasts via Tauri events             |  Stream responses emit events: chat-stream-chunk,
  |  (toast-event, etc.)                 |  chat-stream-done, chat-stream-error
```

**Data flow:** User types → `handleSend()` calls `invoke("stream_chat")` → Rust spawns async stream → SSE chunks emitted as Tauri events → frontend listeners append tokens to zustand store.

**MCP bridge:** Legacy tool-calling bridge removed; standard MCP foundation implemented with stdio + JSON-RPC handshake. MCP servers persist to disk (`mcp_config.dat`) and auto-restore on app startup. Disconnect support via `mcp_disconnect_server` (kills process + removes from persisted config).

---

## IPC Channel Map

All Tauri commands registered in `src-tauri/src/lib.rs:52-74` and implemented in `src-tauri/src/commands.rs`.

| Command | Direction | Purpose |
|---|---|---|
| `save_conversation` | Frontend→Backend | Persist conversation metadata (blocked in incognito) |
| `save_message` | Frontend→Backend | Persist a single message (blocked in incognito) |
| `list_conversations` | Frontend→Backend | Load all conversation headers |
| `list_messages` | Frontend→Backend | Load messages for a conversation |
| `delete_conversation` | Frontend→Backend | Remove conversation + messages from SQLite |
| `delete_chat` | Frontend→Backend | Full wipe of a specific chat ID |
| `hard_delete_session` | Frontend→Backend | Same as delete but returns `DeleteResult` with error info |
| `wipe_incognito_session` | Frontend→Backend | Clear WebView storage + notify |
| `wipe_all_data` | Frontend→Backend | SQLite wipe + config.dat delete + WebView clear |
| `stream_chat` | Frontend→Backend | Start SSE chat stream (supports fallback) |
| `cancel_chat_stream` | Frontend→Backend | Cancel active stream via oneshot channel |
| `list_provider_models` | Frontend→Backend | Fetch available models from provider API |
| `check_provider_health` | Frontend→Backend | Ping provider, return latency + health |
| `save_app_settings` | Frontend→Backend | XOR+Base64 encrypt settings to `jarvis-config.dat` |
| `load_app_settings` | Frontend→Backend | Decrypt and load config file (V2 + legacy fallback) |
| `run_jarvis_task` | Frontend→Backend | Non-streaming quick action (explain, write, debug, etc.) |
| `mcp_spawn_and_initialize` | Frontend→Backend | Spawn MCP server, initialize JSON-RPC, list tools, persist to `mcp_config.dat` |
| `mcp_get_active_tools` | Frontend→Backend | List active MCP servers and their tools |
| `mcp_disconnect_server` | Frontend→Backend | Kill MCP server process + remove from persisted config |
| `mcp_hydrate_saved_servers` | Frontend→Backend | Re-spawn all saved MCP servers from `mcp_config.dat` |

**Event streams (Backend→Frontend):**
| Event | Payload | Purpose |
|---|---|---|
| `chat-stream-chunk` | `{ streamId, token }` | Append token to assistant message |
| `chat-stream-done` | `{ streamId }` | Stream completed |
| `chat-stream-error` | `{ streamId, message }` | Stream error |
| `chat-stream-provider` | `{ streamId, provider, model, fallbackUsed }` | Provider switch info |
| `toast-event` | `{ id, title, message, kind, durationMs }` | Desktop toast notification |
| `toggle-command-palette` | `()` | Toggle command palette (Ctrl+K) |

---

## State Source of Truth

### `isIncognito` — `src/store/incognitoStore.ts`
- **Storage:** zustand persist → localStorage key `jarvis-incognito-v1`
- **Persistence:** Survives page reload, cleared via `persist.clearStorage()`
- **`sessionKey` trigger:** `App.tsx:133` — `setSessionKey((k) => k + 1)` passed to `ChatPanel` as `key={sessionKey}`. Incrementing this key **unmounts and remounts** the entire ChatPanel component, wiping all local React state.
- **Usage:** Blocks `save_conversation`/`save_message` when `incognito=true`. Filters incognito conversations (`private_*` prefix) from zustand persist via `partialize`.

### Chat State — `src/store/chatStore.ts`
- **Storage:** zustand persist → localStorage key `jarvis-chat-v1`
- **partialize:** Filters out `private_*` prefixed conversations before persisting
- **Incognito cleanup:** `removeIncognitoConversations()` filters them from in-memory state on session end

### Settings — `src/store/settingsStore.ts`
- **Storage:** zustand persist → localStorage key `jarvis-settings-v1`
- **Disk backup:** `save_app_settings`/`load_app_settings` (XOR+Base64 encrypted) via `saveSettingsToDisk()` / `loadSettingsFromDisk()`
- **Auto-sync:** Debounced 2s write to disk on any settings change (App.tsx:102-119)

---

## Directory Guide

### Logic (`src/store/`)
| File | Role |
|---|---|
| `chatStore.ts` | Conversations, messages, streaming state, CRUD |
| `incognitoStore.ts` | Incognito toggle + persistence |
| `settingsStore.ts` | Provider config, API keys, theme, stats |

### Logic (`src/api/`)
| File | Role |
|---|---|
| `tauriDb.ts` | All conversation/message persistence invocations + DB mappers |
| `providers.ts` | Provider health + model listing invocations |
| `settingsApi.ts` | Settings disk I/O + runJarvisTask invocation |

### UI (`src/components/`)
| File | Role |
|---|---|
| `App.tsx` | Root shell: 3-panel layout (Sidebar, Chat, Settings), sessionKey remount, disk sync |
| `Sidebar.tsx` | Conversation list, delete button, incognito delete path |
| `ChatPanel.tsx` | Stream orchestration, send logic, incognito toggle, PC control commands |
| `MessageList.tsx` | Message rendering with react-markdown, code blocks, typing indicator |
| `MessageInput.tsx` | Textarea + submit |
| `QuickActionGrid.tsx` | 6 quick action buttons (explain, write, etc.) |
| `SettingsPanel.tsx` | Full settings UI: AI, Integration, Appearance, System tabs — includes `McpControlCenter` |
| `SettingsModal.tsx` | Split-pane modal overlay wrapping SettingsPanel |
| `McpControlCenter.tsx` | MCP server registration form + active server tool listing |
| `CommandPalette.tsx` | Ctrl+K palette for navigation |
| `ToastContainer.tsx` | Toast notification display |
| `ui/CyberInput.tsx` | Cyber-themed text input primitive |
| `ui/CyberSelect.tsx` | Cyber-themed select dropdown primitive |
| `ui/CyberSlider.tsx` | Cyber-themed slider primitive |
| `ui/CyberToggle.tsx` | Cyber-themed toggle switch primitive |

### Logic (`src/hooks/`)
| File | Role |
|---|---|
| `useMcp.ts` | MCP server lifecycle: register, disconnect, hydrate auto-restore, refresh tools |
| `useDebouncedSave.ts` | Debounced settings sync to disk via Tauri invoke |

### Logic (`src/utils/`)
| File | Role |
|---|---|
| `id.ts` | `createId(prefix)` — UUID-based ID generation |
| `tokens.ts` | Token estimation (approx: len/4) |
| `providerValidation.ts` | Validate API keys, URLs, models before send |
| `promptTemplates.ts` | System prompts for 6 quick action types |

### Persistence (Rust)
| File | Role |
|---|---|
| `jarvis-core/src/db.rs` | SQLite: save/list/delete conversations + messages, wipe_all |
| `src-tauri/src/commands.rs` (line 1505-1589) | Config encryption (XOR+Base64 V2, legacy hex fallback) |

### Backend Rust
| File | Role |
|---|---|
| `src-tauri/src/commands.rs` | All Tauri commands (1847 lines) |
| `src-tauri/src/lib.rs` | Plugin registration, invoke handler registration, setup hook |
| `src-tauri/src/tray.rs` | System tray with Show/Quit menu |
| `src-tauri/src/hotkeys.rs` | Ctrl+Space (toggle window), Ctrl+K (command palette) |
| `src-tauri/src/notifications.rs` | Toast event emitter (Info/Success/Warning/Error) |
| `src-tauri/build.rs` | Tauri build script |

---

## Key Architectural Decisions

1. **No Electron/WebView2:** Uses Tauri v2 (Rust backend, system WebView). No separate IPC bridge file — all IPC is via `@tauri-apps/api/core` `invoke()`.
2. **Incognito enforcement happens on BOTH sides:** Frontend blocks persistence calls + filter in partialize; Rust side checks `incognito` flag in `save_conversation`/`save_message`.
3. **Stream cancellation via oneshot channel:** `STREAM_CANCEL_REGISTRY` maps `stream_id` → `oneshot::Sender<()>`. Cancel sends on the channel; the stream task exits via `tokio::select!`.
4. **MCP tool calling loop:** Foundation implemented; tool loop integration pending.
5. **Config encryption:** XOR key (`j4rv1s_c0nfig_s4lt_x0r_2024!`) + Base64 encoding (V2). Legacy hex format still supported for backward compatibility.
6. **No ESLint/Prettier:** No lint config found. Use `npm run tauri build` or `python build-modular.py --release` to compile.

---

## Unused Dependencies (Removed)

- `rehype-raw` — installed in package.json but never imported. Removed.

## Source File Count

After cleanup: **45 source files** (29 TypeScript/TSX, 12 Rust, 2 CSS, 1 HTML, 1 JSON config)

### Total project (excluding node_modules/, target/): ~ 55 files

# JARVIS AI — Desktop Intelligence Assistant

A native desktop AI assistant powered by **Tauri v2** (Rust backend) and **React 18** (TypeScript frontend). Chat with multiple LLM providers, manage MCP servers, and keep your data local and private.

![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Rust](https://img.shields.io/badge/Rust-2021-000000?logo=rust)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Multi-Provider LLM Chat
- **5 supported providers:** OpenAI (GPT-4o, GPT-4, GPT-3.5), Claude (Opus, Sonnet, Haiku), Ollama (local), Groq, Together AI
- **Streaming responses** with token-by-token rendering via Tauri events
- **Provider fallback** — automatically retries a secondary provider if the primary fails
- **Model listing** — fetches available models from each provider's API
- **Health checks** — ping providers to verify connectivity and latency
- **Quick actions** — Explain Code, Write Content, Translate, Brainstorm, Debug, Summarize (non-streaming)

### Incognito Mode
- Toggle incognito to prevent any conversation/message persistence
- Enforced on **both** frontend (Zustand partialize filter) and backend (Rust command check)
- Clean session teardown via React key-based remounting

### MCP (Model Context Protocol) Server Management
- Spawn external MCP server processes via `stdio` using `tokio::process`
- Full JSON-RPC 2.0 handshake (`initialize` + `tools/list`)
- Discover and register tool schemas dynamically
- Persist server configurations across restarts (auto-restore on startup)
- Disconnect and terminate servers from the UI

### Privacy & Data Control
- **SQLite persistence** for conversations and messages (via `jarvis-core` crate)
- **Encrypted settings** — XOR + Base64 (V2) config file with legacy fallback
- **Wipe all data** — clears SQLite database, config file, and WebView storage
- **Hard delete** conversations with cascade deletion

### System Integration
- **System tray** with Show JARVIS / Quit menu
- **Global hotkey** (`Ctrl+Space`) to show/hide the window
- **Window hides on close** (minimizes to tray) instead of quitting
- Toast notifications via Tauri events

### Theme Engine
- CSS custom property-based theming with Surgical Mint (`#00f5b8`) accent
- Built-in themes: Default Dark, Blue Neon
- Custom theme support — drop `.json` theme files into `{appData}/themes/`
- Obsidian glassmorphism design system with matte charcoal palette

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Tauri v2 Desktop Shell                         │
│                                                                  │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐  │
│  │   React Frontend (TSX)       │  │   Rust Backend           │  │
│  │                              │  │                          │  │
│  │  App.tsx (root shell)        │  │  src-tauri/src/          │  │
│  │  ├── Sidebar.tsx             │  │  ├── lib.rs (init/host)  │  │
│  │  ├── ChatPanel.tsx           │  │  ├── main.rs (entry)    │  │
│  │  │   ├── MessageList.tsx     │  │  ├── commands.rs (~1.5K) │  │
│  │  │   ├── MessageInput.tsx    │  │  ├── mcp.rs              │  │
│  │  │   └── QuickActionGrid.tsx │  │  ├── tray.rs             │  │
│  │  ├── SettingsModal.tsx       │  │  ├── hotkeys.rs          │  │
│  │  └── SettingsPanel.tsx       │  │  └── notifications.rs    │  │
│  │                              │  │                          │  │
│  │  Stores (Zustand + persist)  │  │  jarvis-core/            │  │
│  │  ├── chatStore.ts            │  │  ├── db.rs (SQLite)      │  │
│  │  ├── settingsStore.ts        │  │  ├── models.rs           │  │
│  │  └── incognitoStore.ts       │  │  ├── error.rs            │  │
│  │                              │  │  └── llm/ (provider)     │  │
│  │  API layer                   │  │                          │  │
│  │  ├── api/tauriDb.ts          │  │  IPC via @tauri-apps/api │  │
│  │  ├── api/providers.ts        │  │  (invoke/events)         │  │
│  │  ├── api/settingsApi.ts      │  │                          │  │
│  │  └── api/pcControl.ts        │  │                          │  │
│  └──────────────────────────────┘  └──────────────────────────┘  │
│         ▲                                │                       │
│         │          Tauri IPC             │                       │
│         └────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### IPC Command Map

All commands registered in `src-tauri/src/lib.rs`.

| Command | Direction | Purpose |
|---|---|---|
| `save_conversation` | Frontend→Backend | Persist conversation metadata |
| `save_message` | Frontend→Backend | Persist a single message |
| `list_conversations` | Frontend→Backend | Load all conversation headers |
| `list_messages` | Frontend→Backend | Load messages for a conversation |
| `delete_conversation` | Frontend→Backend | Remove conversation + messages |
| `delete_chat` | Frontend→Backend | Full wipe of a specific chat ID |
| `hard_delete_session` | Frontend→Backend | Delete with error info returned |
| `wipe_incognito_session` | Frontend→Backend | Clear WebView storage |
| `wipe_all_data` | Frontend→Backend | Full data wipe (DB + config + storage) |
| `stream_chat` | Frontend→Backend | Start SSE chat stream with fallback |
| `cancel_chat_stream` | Frontend→Backend | Cancel active stream |
| `list_provider_models` | Frontend→Backend | Fetch available models from provider |
| `check_provider_health` | Frontend→Backend | Ping provider, return latency + health |
| `save_app_settings` | Frontend→Backend | Encrypt settings to `jarvis-config.dat` |
| `load_app_settings` | Frontend→Backend | Decrypt and load config (V2 + legacy fallback) |
| `run_jarvis_task` | Frontend→Backend | Non-streaming quick action |
| `list_available_themes` | Frontend→Backend | List built-in + custom themes |
| `mcp_spawn_and_initialize` | Frontend→Backend | Spawn MCP server, handshake, list tools |
| `mcp_get_active_tools` | Frontend→Backend | List active MCP servers and their tools |
| `mcp_disconnect_server` | Frontend→Backend | Kill and unregister an MCP server |
| `mcp_hydrate_saved_servers` | Frontend→Backend | Restore all persisted MCP servers |

### Event Streams (Backend→Frontend)

| Event | Payload | Purpose |
|---|---|---|
| `chat-stream-chunk` | `{ streamId, token }` | Append token to assistant message |
| `chat-stream-done` | `{ streamId }` | Stream completed |
| `chat-stream-error` | `{ streamId, message }` | Stream error |
| `chat-stream-provider` | `{ streamId, provider, model, fallbackUsed }` | Provider switch info |
| `toast-event` | `{ id, title, message, kind, durationMs }` | Desktop toast notification |

---

## Project Structure

```
jarvis-ai/
├── src/                          # React frontend
│   ├── api/                      # Tauri IPC wrapper functions
│   │   ├── tauriDb.ts            # Conversation/message persistence
│   │   ├── providers.ts          # Provider health + model listing
│   │   ├── settingsApi.ts        # Settings I/O + task runner
│   │   └── pcControl.ts          # Terminal/file operations (scaffolded)
│   ├── components/
│   │   ├── ChatPanel.tsx         # Stream orchestration, send logic
│   │   ├── MessageList.tsx       # Message rendering with react-markdown
│   │   ├── MessageInput.tsx      # Textarea + submit
│   │   ├── QuickActionGrid.tsx   # 6 quick action buttons
│   │   ├── Sidebar.tsx           # Conversation list + navigation
│   │   ├── SettingsPanel.tsx     # Full settings UI (4 tabs)
│   │   ├── SettingsModal.tsx     # Split-pane settings modal
│   │   ├── CommandPalette.tsx    # Ctrl+K palette
│   │   ├── McpControlCenter.tsx  # MCP server registration UI
│   │   └── ui/                   # Cyber-themed UI primitives
│   │       ├── CyberInput.tsx
│   │       ├── CyberSelect.tsx
│   │       ├── CyberSlider.tsx
│   │       └── CyberToggle.tsx
│   ├── hooks/
│   │   ├── useMcp.ts            # MCP server lifecycle hook
│   │   └── useDebouncedSave.ts  # Debounced settings sync
│   ├── store/
│   │   ├── chatStore.ts         # Conversations, messages, streaming state
│   │   ├── settingsStore.ts     # Provider config, API keys, theme, stats
│   │   └── incognitoStore.ts    # Incognito toggle
│   ├── types/
│   │   ├── chat.ts              # Conversation, Message interfaces
│   │   └── pcControl.ts         # Terminal/file operation types
│   ├── utils/
│   │   ├── id.ts                # UUID-based ID generation
│   │   ├── tokens.ts            # Token estimation (len/4)
│   │   ├── providerValidation.ts # API key and URL validation
│   │   └── promptTemplates.ts   # System prompts for quick actions
│   ├── App.tsx                  # Root shell (3-panel layout)
│   ├── main.tsx                 # React entry point
│   └── styles.css               # CSS custom properties + Tailwind
│
├── src-tauri/                   # Rust backend (Tauri application)
│   ├── src/
│   │   ├── main.rs              # Binary entry point
│   │   ├── lib.rs               # Plugin setup, command registration, MCP auto-restore
│   │   ├── commands.rs          # All Tauri commands (~1518 lines)
│   │   ├── mcp.rs               # MCP server lifecycle (spawn, handshake, persist)
│   │   ├── db.rs                # SQLite init + CRUD (delegates to jarvis-core)
│   │   ├── models.rs            # Shared data structures
│   │   ├── error.rs             # AppError types
│   │   ├── tray.rs              # System tray with Show/Quit menu
│   │   ├── hotkeys.rs           # Ctrl+Space global hotkey
│   │   └── notifications.rs     # Toast event emitter
│   ├── Cargo.toml
│   └── tauri.conf.json          # App config (window, bundle, security)
│
├── jarvis-core/                 # Core library (cdylib + rlib)
│   ├── src/
│   │   ├── lib.rs               # Module declarations
│   │   ├── db.rs                # SQLite conversation/message persistence
│   │   ├── models.rs            # Core data models
│   │   ├── error.rs             # Error types
│   │   └── llm/                 # Provider abstractions
│   │       ├── mod.rs
│   │       └── provider.rs
│   └── Cargo.toml
│
├── build-modular.py             # Custom build script (flat .exe + .dll output)
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
├── postcss.config.js
├── package.json
├── Cargo.toml                   # Workspace root
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ LTS
- **Rust** 1.70+ (`rustup`)
- **Visual Studio Build Tools** 2019+ (Windows) or **Xcode Command Line Tools** (macOS)

### Development Setup

```bash
# 1. Install frontend dependencies
npm install

# 2. Run in development mode (starts Vite HMR + Tauri dev server)
npm run tauri dev
```

This will:
1. Start Vite dev server at `http://127.0.0.1:1420`
2. Compile and launch the Tauri desktop window
3. Enable hot module replacement for frontend changes

### Building for Production

#### Option A: Modular build (flat output — .exe + .dll files together)

```bash
python build-modular.py --release
```

Output goes to `dist-modular/`:
```
dist-modular/
├── jarvis_ai.exe          # Tauri application binary
├── jarvis_core.dll        # jarvis-core shared library
├── jarvis_ai_lib.dll      # src-tauri shared library
├── index.html              # Frontend assets
└── assets/                 # Vite build output
```

#### Option B: Traditional Tauri installer (WiX/NSIS)

```bash
npm run tauri build
```

### Configuration

Set your preferred LLM provider and API keys in the **Settings** modal (gear icon in the sidebar). Supported providers:

| Provider | API Key Source | Base URL (default) |
|---|---|---|
| OpenAI | Dashboard → API keys | `https://api.openai.com/v1/chat/completions` |
| Claude | Console → API keys | `https://api.anthropic.com/v1/messages` |
| Ollama | N/A (local) | `http://127.0.0.1:11434` |
| Groq | Console → API keys | `https://api.groq.com/openai/v1/chat/completions` |
| Together AI | API Keys page | `https://api.together.xyz/v1/chat/completions` |

Settings are encrypted with XOR+Base64 and stored in `jarvis-config.dat` in the app data directory. They also sync to `localStorage` via Zustand persist.

---

## Key Design Decisions

1. **Tauri over Electron** — Smaller bundle (~6MB vs ~300MB), native Rust performance, better security model via IPC
2. **Workspace with cdylib** — `jarvis-core` compiles as both `cdylib` (`.dll`) and `rlib` for flexible linking and dynamic loading
3. **Incognito enforced on both sides** — Frontend blocks persistence calls AND filters in Zustand partialize; Rust checks `incognito` flag
4. **Stream cancellation via oneshot channel** — `STREAM_CANCEL_REGISTRY` maps `stream_id` → `oneshot::Sender<()>` for clean cancellation
5. **MCP via stdio + JSON-RPC** — External processes spawned with `tokio::process`, handshake via stdin/stdout
6. **No lint config** — The project currently has no ESLint/Prettier configuration

---

## License

MIT

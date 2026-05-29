# JARVIS Project Manifest (2026)

## 🏗️ Architecture
- **Framework:** Electron + WebView2
- **Persistence:** Local `config.dat` (JSON/SQLite)
- **Tooling:** MCP (Model Context Protocol) via standard integration

## 🔐 Privacy & Session Logic
- **Incognito Flag:** `isIncognito` (Boolean). When TRUE, `SaveHistory` is blocked.
- **Session Isolation:** We use `partition: 'memory:incognito'` for private tabs.
- **UI Reset:** Triggered by changing the `key` prop on the Chat component to force a hard remount.

## 📡 IPC Registry (Source of Truth)
| Channel | Purpose | Backend Action |
| :--- | :--- | :--- |
| `delete-chat` | Full wipe of a specific ID | Unlinks file + Wipes Partition |
| `toggle-privacy`| Switch storage modes | Swaps WebView2 session partition |
| `save-config` | Update JARVIS settings | Writes to `config.dat` |

## 🛠️ Calibration Protocol
- MCP servers are registered via the standard integration (legacy custom config removed).
- Tools are "trained" via the `list-tools` command and cached in the local registry.

---

## 🧭 Current Journey Milestone Log

### 🚀 Current Milestone: Phase 2 — Core Asynchronous Infrastructure (Active)

We have successfully moved away from the initial saturated, browser-default visual paradigms into a high-performance desktop execution space. The project has advanced from purely visual mockups into true multi-process capability.

#### 🛠️ Completed Architecture Upgrades:
* **The "Stealth Tech" Aesthetic Transition:** Deployed a highly professional, desaturated matte charcoal blueprint (`#070708` canvas / `#0f0f12` panels). Shifted secondary colors into a strict, single "pop" layout utilizing **Surgical Mint (`#00f5b8`)** specifically for active status elements and focused element frames.
* **Tauri Local State Lock:** Replaced volatile layout values with stable local persistence, ensuring configuration parameters successfully map and commit straight down to disk via the Tauri backend.
* **The MCP Gateway Establishment:** Architected a robust, asynchronous `stdio` host environment using `tokio::process::Child` and thread-safe channels. The Rust backend can now dynamically spawn external protocol nodes, execute the standard JSON-RPC 2.0 handshake initialization, and extract tool schema parameters natively.

---

## 📊 Active System Component Matrix

| Module Layer | System Context / File Target | Status Badge | Current Engineering Metric |
|---|---|---|---|
| **Theme / Design** | src/index.css | [ COMPLETED ] | Matte Obsidian base with Surgical Mint macro-accents. |
| **State Persistence** | src-tauri/config.dat | [ OPERATIONAL ] | 600ms debounced automated synchronization loop. |
| **MCP Process Host** | src-tauri/src/mcp.rs | [ INTEGRATED ] | Automated JSON-RPC initialize and tools/list handshake pipeline. |
| **IPC Command Routing** | src-tauri/src/main.rs | [ OPERATIONAL ] | Exposes dynamic execution commands (mcp_spawn_and_initialize). |
| **Frontend Mapping** | src/components/SettingsModal.tsx | [ OPERATIONAL ] | Multi-column, high-density protocol registration & status dashboard. |

---

## 🔮 Immediate Next Objectives (The Horizon)

1. **The LLM Tool Loop Integration:** Bridge the activeServers tool schemas natively into the Ollama / Local AI inference stream generation loop so the engine can actively *choose* and invoke tools during chat.
2. **Standard I/O Duplex Piping:** Refine the background reading threads to catch runtime standard error streams (stderr) and format them into clean UI notifications.
3. **Environment Variable Injection:** Add a hidden local parameter map within the server registration window to pass security credentials (like a BRAVE_API_KEY) safely down to spawned processes.

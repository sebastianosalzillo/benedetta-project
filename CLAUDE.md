# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Benedetta Project** is an Electron + React desktop application that serves as an AI avatar companion. It integrates:
- A conversational AI backend via **Qwen Code CLI** (the default "brain") or local **Ollama** models
- A 3D avatar rendered in a separate Electron window
- **Kokoro TTS** (Python-based, local server on port 5037) for speech synthesis
- **PinchTab** (browser automation tool, local server on port 9867) for web tasks
- **pywinauto-MCP** (port 10789) for desktop/Windows GUI automation

## Commands

```bash
# Development: start Vite dev server + Electron in parallel
npm run dev

# Start only Electron (using pre-built dist/)
npm start

# Build frontend (output: dist/)
npm run build

# Build distributable installer (output: dist-electron/)
npm run dist

# Run Jest unit tests
npm run test:unit

# Run smoke test (test_acp.js)
npm run test:smoke

# Run a single Jest test file
npx jest __tests__/workspace-manager.test.js

# Benchmark Kokoro TTS latency
npm run bench:kokoro
```

Vite dev server runs on port **5174** (strictPort).

## Architecture

### Process Model
The app uses three Electron `BrowserWindow` instances, each loading the same Vite-built React app but routing by `?screen=` query param:
- `screen=chat` — `AvatarChat.jsx`: main chat UI
- `screen=avatar` — `NyxAvatar.jsx`: 3D avatar (TalkingHead/three.js)
- `screen=canvas` — `CanvasWorkspace.jsx`: rich-content canvas

Windows are managed by `electron/window-manager.js`. Window layout constants (sizes, ratios, gaps) all live in `electron/constants.js`.

### IPC Contract
`electron/preload.js` defines the full `window.electronAPI` bridge used by all React screens. This is the **stable contract** — never call Electron APIs directly from the renderer.

`electron/main.js` is the IPC hub: it wires `ipcMain.handle()` calls to the appropriate modules, then pushes events back via `ipcMain.emit` → `webContents.send`.

### Brain / ACP Runtime
`electron/acp-runtime.js` exports `QwenAcpRuntime` — manages the long-lived Qwen CLI subprocess over the ACP protocol (JSON lines on stdout). `BRAIN_REGISTRY` in `constants.js` defines available brains (`qwen`, `ollama`).

The ACP protocol uses **JSON-only** response format. The agent returns structured JSON with `segments` arrays containing typed actions (`speech`, `tool`, `avatar`). Legacy `<|ACT ...|>` / `<|CANVAS ...|>` / `<|BROWSER ...|>` / `<|COMPUTER ...|>` / `<|WORKSPACE ...|>` tokens are **not supported** — all tool calls must be expressed as JSON segments.

### Workspace
`electron/workspace-manager.js` manages a persistent `workspace/` directory under Electron's `userData`. Required files: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`. Mutable files (`USER.md`, `SOUL.md`, etc.) are written during conversations; all have character-length caps enforced at write time.

### Chat Stream State
`src/chat-stream-state.js` (ES module, also mirrored as `.cjs`) is a **pure reducer** — no side effects, no imports. It handles streaming events (`phase-start`, `phase-delta`, `phase-end`, `done`, `error`) and produces the next `messages[]` array for the React chat UI. The `.cjs` version is imported by Jest tests.

### Services (Electron main process)
| Module | Responsibility |
|---|---|
| `tts-service.js` | Spawns/monitors Kokoro Python TTS server, LRU response cache |
| `browser-agent.js` | PinchTab browser automation, session management, autopilot loop |
| `computer-control.js` | pywinauto-MCP + PowerShell for desktop GUI control |
| `shell-tool.js` | Sandboxed shell execution with `isDangerous()` guard |
| `workspace-manager.js` | Memory/session CRUD, prompt assembly, workspace bootstrap |
| `skills.js` | Loads JS skill modules from `skills/` dir, matches/executes on messages |
| `state-manager.js` | `ChatRequestManager` (request lock), `StatusManager`, etc. |
| `circuit-breaker.js` | Generic circuit-breaker for flaky external services |

### Environment / Configuration
All magic numbers and overridable settings are in `electron/constants.js`. Most can be overridden via environment variables (e.g. `AVATAR_ACP_TIMEOUT_MS`, `KOKORO_PORT`, `NYX_WORKSPACE_FILE_MAX_CHARS`). Set `KOKORO_PYTHON` to the path of your Python executable to enable TTS.

### Skills System
Drop a `.js` file (or a directory with `index.js`) into `skills/`. Each skill exports `{ id, name, description, trigger, handler }`. `electron/skills.js` auto-loads them at startup. The `trigger` field is matched against incoming chat messages.

## Testing
Tests live in `__tests__/` and use Jest. Each test file imports directly from `electron/` modules (CommonJS). The chat stream state tests import from `src/chat-stream-state.cjs`.

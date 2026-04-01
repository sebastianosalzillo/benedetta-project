# CLAUDE.md

## Active Refactor State

- The source of truth for ongoing task status is `CODEX.md`.
- Current architecture target: `model-planned agent with server execution`.
- The brain must decide whether to call tools, wait for results, call more tools, speak progress, or answer.
- The server must only execute tools, enforce hard capability gates, return structured tool results, and stream state/output.
- Do not reintroduce server-side semantic routing or browser-specific autopilot dispatch in active paths.
- Keep the runtime centered on `startDirectAcpRequest(...)` and `agentLoop(...)`.
- The legacy browser-only execution path has been removed from active runtime code.
- Action-tool results now flow back into the next ACP turn so the brain can decide the next step after browser/computer/canvas/workspace actions.
- One unused legacy helper still remains in `electron/main.js`: `isLikelyBrowserAutopilotTask(...)`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Avatar ACP Desktop is an Electron + React desktop app with a transparent avatar window and a separate chat/control window. The avatar is powered by the NyxAvatar bridge (wrapping TalkingHead in a webview), the brain is ACP via Qwen Code CLI (`qwen --channel ACP`), and TTS is handled by a local Kokoro HTTP service.

The brain ACP acts as an autonomous agent that decides when to use tools (browser, computer, canvas, workspace) or respond directly — no separate agent processes.

## Commands

```bash
npm run dev        # Start Vite dev server (port 5174) + Electron app concurrently
npm run build      # Build React app with Vite → dist/
npm run start      # Launch Electron app (uses built files in prod, Vite URL in dev)
```

- The Electron main process entry is `electron/main.js`
- The React app entry is `src/main.jsx`, rendered into `index.html`
- Avatar assets (TalkingHead HTML, avatars, animations) are in `public/talkinghead/` and served at `/talkinghead/`

## Architecture

### Three-Window Model

The app runs three separate Electron windows, controlled by URL `?screen=` parameter:

| Window | URL param | Purpose |
|--------|-----------|---------|
| Avatar | `?screen=avatar` | Transparent, frameless webview hosting TalkingHead |
| Chat | `?screen=chat` (default) | React UI: chat history, HUD, settings |
| Canvas | `?screen=canvas` | Optional side panel for ACP-requested content (text, clipboard, files, image, video) |

### Key Source Files

- `electron/main.js` — Main process orchestrator (legacy monolith, being refactored)
- `electron/constants.js` — All magic numbers and config constants extracted (refactored)
- `electron/state-manager.js` — Race condition fixes: ChatRequestManager with lock, PlaybackWaiterManager, StatusManager (refactored)
- `electron/acp-runtime.js` — Qwen ACP runtime with memory leak prevention via proper pending Map cleanup (refactored)
- `electron/tts-service.js` — Kokoro TTS with response caching and auto-restart (refactored)
- `electron/browser-agent.js` — PinchTab browser automation with proper service lifecycle (refactored)
- `electron/computer-control.js` — PowerShell/computer use with Base64-encoded commands (injection fix) + fetch-based Ollama probe (refactored)
- `electron/workspace-manager.js` — Workspace management with write-side file size enforcement (refactored)
- `electron/window-manager.js` — Electron window management extracted (refactored)
- `electron/preload.js` — Context bridge exposing `window.electronAPI` to renderer
- `electron/renderer-loop.js` — Utilities for safe main↔renderer communication
- `src/App.jsx` — Root React component, dispatches to avatar/chat/canvas screens
- `src/components/NyxAvatar.jsx` — Avatar webview wrapper; maps `cmd` commands (`speak`, `mood`, `motion`, `gesture`, `status`, `stop`) to TalkingHead JavaScript calls via `webview.executeJavaScript`
- `src/components/AvatarChat.jsx` — Chat UI, streaming display, status badges, workspace bootstrap
- `public/talkinghead/` — TalkingHead runtime (3D avatar engine, lip-sync, moods, gestures)

### Refactoring Status

8 modules have been extracted from the monolithic `main.js` (9413 lines) to fix critical issues:

| Module | Issues Fixed |
|--------|-------------|
| `constants.js` | Magic numbers (#11) → named constants |
| `state-manager.js` | Race conditions (#2) → lock-based ChatRequestManager |
| `acp-runtime.js` | Memory leaks (#3) → proper pending Map cleanup with timeouts |
| `tts-service.js` | TTS blocking (#7) → response caching |
| `browser-agent.js` | Service lifecycle (#4) → proper startupPromise handling |
| `computer-control.js` | PowerShell injection (#5) → Base64 encoding; Ollama curl (#9) → fetch |
| `workspace-manager.js` | File size limits (#8) → write-side enforcement via `writeTextFile` |
| `window-manager.js` | Single responsibility (#1) → extracted window management |

**Migration approach**: Incremental. Modules export same function signatures as original code. Replace inline calls with module imports gradually. See module comments for adoption guidance.

### Agent Architecture

The brain ACP is an autonomous agent. It decides per-request:
- **Conversazione/risposta breve** → risponde direttamente senza token
- **Serve web?** → usa token `BROWSER` (PinchTab)
- **Serve desktop?** → usa token `COMPUTER` (PowerShell native)
- **Serve mostrare contenuti?** → usa token `CANVAS`
- **Serve memoria?** → usa token `WORKSPACE`

Non ci sono agent separati: il brain chiama i tool direttamente quando serve.

### IPC Channels (preload → main)

**Invoke (renderer → main):**
- `chat:send`, `chat:stop` — Send/stop ACP chat messages
- `avatar:command` — Send command to avatar (`{cmd, text, mood, expression, motion, gesture, motionType, audioBase64, ...}`)
- `avatar:playback` — Notify main of playback state changes (`ended`, `stopped`, `error`)
- `window:set-always-on-top`, `app:get-state`, `brain:set-selected`, `brain:set-ollama-config`, `brain:test`
- `workspace:open-folder`, `workspace:complete-bootstrap`
- `chat:get-history`, `canvas:open`, `canvas:update`, `canvas:close`, `canvas:set-layout`
- `browser:navigate`, `browser:refresh`, `browser:action`
- `clipboard:read-text`, `clipboard:write-text`

**Receive (main → renderer):**
- `avatar-command` — Avatar commands from main (speak, mood, motion, gesture, status, stop)
- `avatar-status` — Runtime status updates (thinking, speaking, tts-loading, error)
- `chat-stream` — Chat streaming events (`message`, `complete`, `stopped`, `error`, `system`)
- `canvas-state` — Canvas state sync

### Avatar Command Protocol

Main process sends avatar commands via `avatar-command` IPC. `NyxAvatar.jsx` handles:

- `speak` — Decodes `audioBase64`, calls `head.speakAudio()` with viseme array; clears status after `expectedDurationMs + 180ms`
- `mood` / `expression` — Maps to `head.setMood()` (supported: neutral, happy, angry, sad, fear, disgust, love, sleep)
- `motion` / `gesture` — Resolves `motionType` (pose/animation/gesture) against `site.poses`, `site.gestures`, `site.animations`, calls `head.playPose()` / `head.playAnimation()` / `head.playGesture()`
- `status` — Shows floating status bubble for 3.5s
- `stop` — Calls `head.stopSpeaking()`, clears status and playback timers

### ACP Brain Integration

ACP is invoked via `qwen --channel ACP` (Qwen Code CLI). The main process pipes prompts and receives streaming text. The brain is an autonomous agent that emits inline tokens to trigger actions:

- `ACT` — Avatar emotion/gesture/pose
- `DELAY` — Expressive pause
- `BROWSER` — Web navigation via PinchTab
- `COMPUTER` — Desktop control via PowerShell
- `CANVAS` — Side panel content
- `WORKSPACE` — Persistent memory updates

`ACT null` explicitly means gesture-free. The ACP prompt is tuned to emit structured tokens when action is needed, or respond directly for simple conversation.

### TTS Pipeline

- Default TTS: Kokoro HTTP service (`electron/kokoro_tts_server.py`, Python, port 5037)
- Default voice: `if_sara` (Italian female)
- Main process handles HTTP synthesis → base64 encodes audio → sends `speak` command with `audioBase64` to renderer

### Tool Execution

The brain emits tokens that are parsed and executed by `finalizeParsedAssistantReply`:

| Tool | Token | Purpose |
|------|-------|---------|
| Browser | `<|BROWSER:...|>` | PinchTab web automation |
| Computer | `<|COMPUTER:...|>` | PowerShell desktop control |
| Canvas | `<|CANVAS:...|>` | Side panel content |
| Workspace | `<|WORKSPACE:...|>` | Persistent memory |
| Avatar | `<|ACT:...|>` | Emotion/gesture/pose |

### Persistence

- Window bounds stored under Electron `app.getPath('userData')`
- Chat history persisted in main process, retrievable via `chat:get-history`
- Workspace markdown files under `workspace/` directory
- Daily memory notes under `workspace/memory/`

## Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AVATAR_TTS_PROVIDER` | `kokoro` | TTS provider selection |
| `KOKORO_HOST` | `127.0.0.1` | Kokoro TTS server host |
| `KOKORO_PORT` | `5037` | Kokoro TTS server port |
| `KOKORO_DEFAULT_SPEAKER` | `if_sara` | Kokoro voice |
| `PINCHTAB_HOST` | `127.0.0.1` | PinchTab browser agent host |
| `PINCHTAB_PORT` | `9867` | PinchTab browser agent port |
| `NYX_ENABLE_LIVE_CANVAS` | `false` | Enable live canvas feature |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server |
| `NYX_OLLAMA_MODEL` | `qwen3.5:0.8b` | Ollama model |

## Important Implementation Notes

- Avatar webview (`NyxAvatar.jsx`) must have `allowpopups="false"`, `nodeintegration="false"`, and `background: transparent; pointer-events: none` CSS to support click-through transparency
- TalkingHead requires `document.body.style.background = 'transparent'` injected after load
- The avatar's `siteconfig.js` at `/talkinghead/siteconfig.js` defines poses, gestures, and animations available to the runtime
- ACP output parsing in `electron/main.js` handles relaxed/non-JSON syntax; token parsing distinguishes ACT, BROWSER, COMPUTER, CANVAS, WORKSPACE, DELAY types
- Browser tool (PinchTab) runs as a subprocess; includes automatic stale-ref recovery via snapshot refresh
- Computer tool uses native PowerShell (no pywinauto dependency required as a separate agent)
- The brain decides autonomously per-request whether to use tools or respond directly

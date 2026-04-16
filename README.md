# Benedetta Project

Local-first Electron desktop companion with a 3D avatar, chat, workspace memory, browser automation, optional desktop control, and local/HTTP AI brain providers.

## Current Version

Version `1.1.0` removes the old subprocess brain integration. The app now uses the direct agent runtime with:

- OpenCode Zen HTTP API
- Ollama HTTP API

On the first launch after upgrading to `1.1.0`, Benedetta resets generated local state under Electron `userData` so the app starts clean. This clears generated chat/session/workspace state and then records the current app version so later launches do not keep resetting.

## Features

| Feature | Description |
| --- | --- |
| AI brain | OpenCode Zen or Ollama-backed agent responses |
| Chat | Streaming-style chat UI with JSON action parsing |
| 3D avatar | Emotions, gestures, poses, animation, and lip sync |
| Workspace | Markdown workspace files, bootstrap flow, memory notes, sessions |
| Canvas | Side panel for text, files, images, video, audio, and browser content |
| Browser automation | PinchTab-backed browser actions |
| Desktop control | Optional pywinauto-MCP integration on Windows |
| TTS | Optional Kokoro local Python TTS service |

## Architecture

```text
React chat UI
  -> Electron preload IPC
  -> Electron main process
  -> direct agent runtime
       -> OpenCode Zen HTTP API
       -> Ollama HTTP API
  -> action tools
       -> avatar
       -> workspace
       -> canvas
       -> browser
       -> computer
       -> memory
       -> shell/file/search tools
```

The legacy subprocess brain runtime and smoke test have been removed.

## Requirements

- Node.js 20+
- npm 10+
- One brain provider:
  - OpenCode Zen credentials in `.env.local` or environment variables
  - Ollama running locally with a model such as `llama3.2:1b`

Optional:

- Kokoro TTS server for speech output
- PinchTab for browser automation
- pywinauto-MCP for Windows desktop automation

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

This starts:

- Vite on `http://localhost:5174`
- Electron pointing at the Vite dev server

Production-style local run:

```bash
npm run build
npm start
```

## Configuration

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENCODE_API_KEY` | empty | OpenCode Zen API key |
| `OPENCODE_BASE_URL` | `https://opencode.ai/zen/v1` | OpenCode-compatible API base URL |
| `OPENCODE_MODEL` | `minimax-m2.5-free` | OpenCode model |
| `NYX_OLLAMA_MODEL` | `llama3.2:1b` | Default Ollama model |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API URL |
| `AVATAR_AGENT_TIMEOUT_MS` | `120000` | Agent response timeout |
| `KOKORO_PORT` | `5037` | Kokoro TTS port |
| `PINCHTAB_PORT` | `9867` | PinchTab port |
| `PINCHTAB_TOKEN` | empty | PinchTab auth token |

The app also reads `.env.local` at startup when present.

## Workspace

The generated workspace lives under Electron `userData`:

```text
workspace/
  IDENTITY.md
  SOUL.md
  AGENTS.md
  TOOLS.md
  USER.md
  MEMORY.md
  PERSONALITY.md
  memory/
  sessions/
```

Bootstrap rules:

- `/bootstrap` resets Markdown files in the workspace root and starts a clean bootstrap.
- Bootstrap tool use is restricted to the `workspace` tool at runtime.
- On version upgrade to `1.1.0`, generated local state is reset once automatically.

## Scripts

```bash
npm run dev
npm run build
npm test
npm run test:unit
npm run test:e2e
npm run dist
```

`npm test` runs the Jest unit suite. It no longer invokes the removed subprocess brain smoke test.

## Verification Status

Current checked baseline:

- `npm run build`
- `npm test -- --runInBand`

## Notes For Maintainers

- Keep generated local runtime files out of git.
- Do not reintroduce the removed subprocess brain protocol code.
- Prefer OpenCode/Ollama direct runtime paths for new brain providers.
- If a future release must force a clean local start, bump `package.json` version and the version-reset gate will run once on first launch.

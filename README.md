# Benedetta Project

> A local-first AI desktop companion with a 3D avatar, conversational intelligence, and desktop automation — all running privately on your machine.

![Electron](https://img.shields.io/badge/Electron-40-blue?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Three.js](https://img.shields.io/badge/Three.js-r180-black?logo=three.js)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is Benedetta?

**Benedetta Project** is an Electron + React desktop application that combines a **real-time 3D avatar** with a **local AI agent**. It runs entirely on your machine — no cloud API keys required for core functionality.

### Features

| Feature | Description |
|---|---|
| 🧠 **Local AI brain** | Powered by [Qwen Code CLI](https://github.com/QwenLM/qwen-code) or any [Ollama](https://ollama.ai) model |
| 💬 **Chat interface** | Streaming chat with reasoning tag support and session memory |
| 🎭 **3D Avatar** | Real-time 3D character with emotions, gestures, poses, and lip-sync |
| 🖼️ **Canvas workspace** | Rich content panel for markdown, images, video, and structured output |
| 🌐 **Browser automation** | Web browsing and task execution via PinchTab |
| 🖥️ **Desktop control** | Windows GUI automation via pywinauto-MCP |
| 🔊 **Local TTS** | Speech synthesis via Kokoro (local Python server, optional) |

---

## Architecture

The app uses **three Electron windows** communicating over a typed IPC bridge:

```
┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   Chat Window   │   │  Avatar Window   │   │  Canvas Window   │
│ AvatarChat.jsx  │   │  NyxAvatar.jsx   │   │CanvasWorkspace   │
└────────┬────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                    │                       │
         └──────────┬─────────┘                       │
                    │           IPC (preload.js)       │
         ┌──────────▼──────────────────────────────────▼──────┐
         │              Electron Main Process (main.js)       │
         │  ┌──────────┐  ┌───────────┐  ┌────────────────┐  │
         │  │ ACP/Brain│  │ TTS Kokoro│  │ Browser Agent  │  │
         │  │ (Qwen/   │  │ Python srv│  │ (PinchTab)     │  │
         │  │  Ollama) │  └───────────┘  └────────────────┘  │
         │  └──────────┘                                      │
         └────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- One of:
  - [Qwen Code CLI](https://github.com/QwenLM/qwen-code) installed globally: `npm install -g @qwen-code/qwen-code`
  - [Ollama](https://ollama.ai) running locally with a model pulled (e.g. `ollama pull qwen3.5:0.8b`)

### Optional services

| Service | Purpose | Default port |
|---|---|---|
| [Kokoro TTS](https://github.com/remsky/Kokoro-FastAPI) | Local text-to-speech | `5037` |
| [PinchTab](https://github.com/pinchtab/pinchtab) | Browser automation | `9867` |
| [pywinauto-MCP](https://github.com/sandraschi/pywinauto-mcp) | Desktop GUI control | `10789` |

All external services are **optional** — the core chat + avatar experience works without them.

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/benedetta-project.git
cd benedetta-project
npm install
```

---

## Running

```bash
# Development mode (Vite dev server + Electron)
npm run dev

# Production mode (requires npm run build first)
npm run build
npm start
```

Vite dev server runs on port **5174**.

---

## Configuration

Copy `.env.example` to `.env` and edit as needed. No values are required to get started with Ollama.

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Default | Description |
|---|---|---|
| `NYX_OLLAMA_MODEL` | `qwen3.5:0.8b` | Default Ollama model |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API URL |
| `KOKORO_PORT` | `5037` | Kokoro TTS port |
| `PINCHTAB_PORT` | `9867` | PinchTab browser agent port |
| `PINCHTAB_TOKEN` | *(empty)* | PinchTab auth token |
| `AVATAR_ACP_TIMEOUT_MS` | `120000` | Agent response timeout |

See `.env.example` for the full list.

---

## Avatar System

The 3D avatar supports:

**Emotions:** `happy`, `sad`, `angry`, `think`, `surprised`, `curious`, `neutral`, `fear`, `love`, `sleep`, `disgust`

**Gestures:** `handup`, `ok`, `index`, `thumbup`, `thumbdown`, `side`, `shrug`, `namaste`

**Poses:** `straight`, `side`, `hip`, `turn`, `back`, `wide`, `oneknee`, `kneel`, `bend`, `sitting`, `dance`

**Animations:** `walking`

The avatar state is controlled through the AI agent's JSON action segments — no direct API calls needed.

---

## Skills System

Drop a `.js` file into the `skills/` directory to extend the agent with custom behaviors:

```js
// skills/my-skill.js
module.exports = {
  id: 'my-skill',
  name: 'My Custom Skill',
  description: 'Does something cool',
  trigger: /my trigger phrase/i,
  handler: async ({ message, send }) => {
    await send({ speech: 'Skill activated!' });
  },
};
```

---

## Testing

```bash
# Unit tests (Jest)
npm run test:unit

# Smoke test
npm run test:smoke

# E2E tests
npm run test:e2e
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](LICENSE) for details.

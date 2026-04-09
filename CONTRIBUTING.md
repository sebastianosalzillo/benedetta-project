# Contributing to Benedetta Project

Thank you for your interest in contributing! This document covers how to get started.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/benedetta-project.git
   cd benedetta-project
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Copy the env template:**
   ```bash
   cp .env.example .env
   ```
5. **Start development:**
   ```bash
   npm run dev
   ```

## Project Structure

```
benedetta-project/
├── electron/          # Main process — Electron backend
│   ├── main.js        # IPC hub, app lifecycle
│   ├── constants.js   # All configuration constants / env overrides
│   ├── acp-runtime.js # Agent brain (Qwen/Ollama) subprocess manager
│   ├── window-manager.js  # Multi-window layout management
│   ├── workspace-manager.js # Persistent memory and session storage
│   └── ...            # Tool modules: file, search, shell, browser, etc.
├── src/               # Renderer process — React UI
│   ├── components/    # AvatarChat, NyxAvatar, CanvasWorkspace, Settings
│   ├── App.jsx        # Screen router (?screen=chat|avatar|canvas)
│   ├── chat-stream-state.js  # Pure streaming state reducer
│   └── index.css      # Design system CSS
├── public/
│   └── talkinghead/   # 3D avatar renderer (Three.js / TalkingHead library)
├── skills/            # Drop-in skill modules for the agent
├── __tests__/         # Jest unit tests
└── e2e/               # End-to-end smoke tests
```

## Making Changes

### Code Style

- **JavaScript** only (no TypeScript in this repo)
- CommonJS (`require/module.exports`) in `electron/`
- ESM (`import/export`) in `src/`
- Run linting: `npx ruff check .` (Python) — JavaScript linting is informal
- Keep functions small and focused
- All magic numbers belong in `electron/constants.js`

### IPC Contract

- The `window.electronAPI` bridge in `electron/preload.js` is the **stable contract** between main and renderer
- Never add direct `ipcRenderer` calls in components — always go through `preload.js`
- New IPC handlers go in `electron/ipc-handlers/`

### Avatar

- Avatar state is controlled exclusively through AI agent JSON segments (`speech`, `tool`, `avatar`)
- Direct avatar control: use the `avatar:command` IPC channel
- New emotions/gestures must be added to the constants in `electron/constants.js`

### Skills

- Add new agent skills by creating a `.js` file in `skills/`
- Export: `{ id, name, description, trigger, handler }`
- `trigger` is a regex matched against the user message

## Testing

```bash
# Unit tests
npm run test:unit

# Smoke test (requires Ollama running)
npm run test:smoke

# E2E tests
npm run test:e2e
```

Please ensure all existing tests pass before submitting a PR.

## Submitting a Pull Request

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes with clear, atomic commits
3. Push and open a PR against `main`
4. Describe **what** you changed and **why**

## Reporting Issues

Open a GitHub Issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS version, Node.js version, and which AI brain you're using

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

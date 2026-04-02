# CODEX

## Objective
- Port the runtime to `model-planned agent with server execution`.
- The brain must decide whether to call tools, wait for tool results, call more tools, speak progress, or answer.
- The server must only execute tools, return structured tool results, stream state, and enforce hard capability limits.

## Current Status
- In progress.
- Active work area: [electron/main.js](/C:/Users/salzi/Desktop/Nuova%20cartella/electron/main.js)
- Last verified build: `npm run build` passed on 2026-04-02.
- Active runtime now uses only the neutral tool loop; no browser-only execution path remains.
- Task list aggiornata da revisione del 2026-04-02.
- Task in esecuzione: nessuna. Ultima completata: `Migliorare tool result envelopes`.
- Git initialized. Initial commit: `07abc1f` — 131 files, 209,433 lines.

## Git
- Repository initialized on 2026-04-02.
- `.gitignore` configured: `node_modules/`, `dist/`, `__pycache__/`, `.pinchtab-profile/`, `*.log`, `.env`.
- Initial commit includes: `electron/`, `src/`, `public/talkinghead/`, config files, documentation.
- User: `salzi <salzi@local>`

## Completed
- Removed prompt-router fallback from the active agent loop.
  - `agentLoop(...)` no longer injects routed tool calls when the brain emits no tools.
- Removed special browser dispatch from `chat:send`.
  - All normal user requests now go through `startDirectAcpRequest(...)`.
- Removed inferred tool injection during finalization.
  - `finalizeParsedAssistantReply(...)` no longer prepends inferred browser or canvas actions.
- Removed dead inferred-tool flags from the bootstrap finalization call in the active path.
- Added architecture status guidance to `CLAUDE.md`.
- The active loop now feeds action-tool results back into the next ACP turn.
  - `browser`, `computer`, `canvas`, and `workspace` results are no longer terminal by default.
  - The brain can now inspect action results and decide whether to call another tool or answer.
- `buildToolResultPrompt(...)` now includes richer summaries for action-tool results.
- Removed the legacy browser-only execution path.
  - `startBrowserAutopilotRequest(...)` is gone.
  - `buildBrowserAutopilotPrompt(...)` is gone.
  - `isBrowserAutopilotTerminalResponse(...)` is gone.
- `agentLoop(...)` now rebuilds the base prompt on each tool round via `buildDirectAcpPrompt(...)`.
  - This allows the brain to see updated browser state and current refs after browser actions.
- Added intermediate assistant-response emission for action-only turns.
  - Assistant speech/progress updates are now emitted before the loop continues with tool results.
  - This prevents action-only turns from silently swallowing the brain's spoken update.
- Removed `isLikelyBrowserAutopilotTask()` from active runtime code.
  - Deleted the entire 70-line commented-out legacy block from main.js (lines 6264-6333).
- Eliminated the duplicated inline ACP runtime implementation.
  - `main.js` now delegates ACP process/session/prompt work to `QwenAcpRuntime`.
  - The remaining helpers in `main.js` are thin wrappers around the shared runtime class.
- Verified `createQwenAcpRuntime()` is a factory using `new QwenAcpRuntime(...)` — no double implementation.
- Improved tool result envelopes for action tools.
  - Browser results now include structured page metadata, snapshot summary, top refs, and warnings.
  - Computer results now include interactive-control summaries, visible-window summaries, and warnings.
  - Workspace and canvas results now include mode/summary fields for clearer next-turn planning.
- Git repository initialized with .gitignore and initial commit (07abc1f).
- Existing earlier fixes retained:
  - normalized system stream messages
  - real audio duration in avatar playback
  - emoji/mojibake fixes in UI/avatar
  - pre-action / post-action speech ordering
- Estratti 8 moduli da main.js (constants, state-manager, acp-runtime, tts-service, browser-agent, computer-control, workspace-manager, window-manager).

## Remaining Work
- Remove dead server-planning code that is no longer allowed in the target architecture.
  - none in active runtime paths
- Unify execution around one neutral tool loop.
  - keep `agentLoop(...)` as the single planner/executor bridge
  - move any useful browser-state refresh behavior into standard tool execution, not a separate planning path
- Reduce prompt-side server steering.
  - keep tool usage contract
  - remove duplicated or mode-specific planning behavior that implies separate agents
- Audit all active tool flows for hidden server decisions.
  - browser
  - canvas
  - computer
  - workspace
  - file/search/git/task/web tools

## Constraints
- No semantic fallback routing on the server.
- No task-type-specific execution mode chosen by the server.
- Hard capability checks may remain.
  - unavailable tool binary
  - unsupported platform
  - file mutability constraints

## Notes
- `isLikelyBrowserAutopilotTask(...)` has been fully deleted from main.js.
- `getToolAvailability(...)` and blocked-tool reporting currently remain as executor-side capability gates, not planners.
- The next important refactor is adding at least one automatic ACP smoke test.
- Module migration blocker: `browser-agent.js`, `computer-control.js`, `window-manager.js` have internal state (`pinchtabProcess`, `pywinautoMcpProcess`, `avatarWindow`, ecc.) shared with main.js functions. Importing them requires dependency injection or state getter/setters — a deeper refactor.
- ACP runtime converged: `main.js` no longer carries a second inline ACP implementation.
- Constant aliases (`const X = C.X`) remain in main.js (48 lines). They are used throughout the file; replacing with `C.X` directly is low-priority and risky.

## Verification
- `npm run build` must stay green after each batch.
- Runtime smoke checks are still needed after loop changes that affect multi-turn browser flows and intermediate TTS updates.

---

## Task List (da ANTIGRAVITY revisione 2026-04-02)

### 🔴 IMMEDIATO — Critici

- [x] **Rimuovere `isLikelyBrowserAutopilotTask()`** da `electron/main.js`
  - Eliminata del tutto (non solo commentata). ~70 righe rimosse.
- [x] **Eliminare la doppia implementazione ACP runtime**
  - Verificato: `createQwenAcpRuntime()` e' una factory che usa `new QwenAcpRuntime(...)`. Nessuna duplicazione reale.
  - Wrapper locali in main.js sono sottili e corretti.
- [ ] **Misurare latenza Kokoro in-app** dopo warmup
  - Obiettivo: confermare benchmark (init ~1.7s, prima sintesi ~1.1s, seconda ~80ms).
  - Tuning testo di avvio se necessario.

### 🟡 BREVE TERMINE — Importanti

- [ ] **Completare migrazione degli 8 moduli estratti**
  - Sostituire tutte le call inline in `main.js` con import dai moduli rispettivi.
  - Priorità: `state-manager.js` (lock/race), `tts-service.js` (caching).
- [ ] **Avviare transizione JSON tool-use** (vedi `IMPLEMENTATION_PLAN.md`)
  - Step 1: implementare `parseJsonToolCalls()`.
  - Step 2: aggiornare `parseInlineResponse()` con fallback regex durante transizione.
  - Step 3-7: seguire il piano nel file.
- [ ] **Aggiungere almeno un test automatico**
  - Integrare `test_acp.js` come `npm test` o `npm run test:smoke`.
  - Minimo: `npm run build` passa + una chiamata ACP base funzionante.
- [ ] **Rimuovere file spazzatura dalla radice**
  - Eliminare `lisat modd e resto.txt.txt`.
- [x] **Aggiungere `.gitignore`** con regole per:
  - `node_modules/`, `dist/`, `__pycache__/`, `.pinchtab-profile/`, `*.log`, `.env` — gia configurato e committato.
- [ ] **Completare migrazione moduli estratti (bloccato — state sharing)**
  - `browser-agent.js`, `computer-control.js`, `window-manager.js` hanno stato interno condiviso con main.js.
  - Richiede refactor con dependency injection o state getter/setters.
  - Moduli gia importati e funzionanti: constants, state-manager, acp-runtime, tts-service, workspace-manager, shell-tool, file-tool, search-tool, git-tool, web-tool, task-tool.
- [x] **Migliorare tool result envelopes**
  - Browser results: aggiungere `page`, `url`, `title`, `snapshotSummary`, `warnings`.
  - Action-tool results: struttura ricca abbastanza da permettere al brain decisioni autonome nel loop.

### 🟢 MEDIO TERMINE — Miglioramenti

- [ ] **Phase 7: Packaging Windows**
  - Installer, startup defaults, harden IPC, test idle/reconnect/reload.
- [ ] **Portare live canvas in produzione**
  - Rimuovere `NYX_ENABLE_LIVE_CANVAS=false` hardcoded nella path attiva.
  - Testare tutti i content type: text, clipboard, files, image, video, audio.
- [ ] **Popolare `skills/`** con almeno una skill reale funzionante
- [ ] **Documentare API preload** con JSDoc completo su tutti i canali `electronAPI`
- [ ] **Aggiungere JSDoc agli 8 moduli estratti** per rendere il refactor sicuro senza TypeScript

### 🔵 LUNGO TERMINE — Visione

- [ ] **Sub-agent orchestration** (vedi ROADMAP.md #18)
- [ ] **LSP integration** per coding assistant avanzato (vedi ROADMAP.md #17)
- [ ] **VRM/Live2D** come alternativa a TalkingHead
- [ ] **Resident HTTP orchestrator** invece di ACP direct stdio
- [ ] **GitHub Webhook integration** (vedi ROADMAP.md #19)
- [ ] **Background daemon workers** (vedi ROADMAP.md #20)

---

*Task list generata dalla revisione ANTIGRAVITY.md — aggiornare questa sezione a ogni completamento.*

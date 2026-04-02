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
- Task in esecuzione: `Sblocco migrazione moduli — Opzione C: Incapsulamento Completo` (agent: opencode/mimo-v2-pro-free).
- Coordinazione: piu agenti possono lavorare sugli stessi file; riallineare `CODEX.md` prima di ogni batch e non sovrascrivere cambi altrui.
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
- Added an automatic ACP smoke test.
  - `npm run test:smoke` now launches the local Qwen ACP entrypoint, performs initialize/session/new/session/prompt, and asserts assistant output.
  - `npm test` now maps to the same smoke test for a minimal automated verification path.
- Completed the JSON tool-use transition.
  - Canonical tool/action turns now use a single JSON envelope with ordered `segments`.
  - `parseInlineResponse(...)` now accepts JSON envelopes even when they contain speech-only segments or mixed speech/tool segments.
  - Legacy token/regex parsing remains only as backward-compatibility fallback.
- Measured Kokoro latency in-app with a repeatable benchmark.
  - `npm run bench:kokoro` now reports cold startup, warm ensure, and two synthesis timings.
  - Latest measurement: startup ~10.16s, warm `ensure()` ~2ms, first synth ~99ms, second synth ~93ms.
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
- The next important refactor is continuing module migration where not blocked or removing root-level garbage files.
- Module migration blocker: `browser-agent.js`, `computer-control.js`, `window-manager.js` have internal state (`pinchtabProcess`, `pywinautoMcpProcess`, `avatarWindow`, ecc.) shared with main.js functions. Importing them requires dependency injection or state getter/setters — a deeper refactor.
- ACP runtime converged: `main.js` no longer carries a second inline ACP implementation.
- Constant aliases (`const X = C.X`) remain in main.js (48 lines). They are used throughout the file; replacing with `C.X` directly is low-priority and risky.

---

## Sessione Proposta: Sblocco Migrazione Moduli con Stato Condiviso

**Data proposta:** 2026-04-02
**Problema:** 3 moduli estratti (`browser-agent.js`, `computer-control.js`, `window-manager.js`) non possono essere importati in `main.js` perché gestiscono stato interno condiviso che attualmente vive nel file principale.

### Perché questo è un blocco critico

1. **Codice duplicato:** Le stesse funzioni esistono sia inline in `main.js` sia nei moduli estratti
   - `window-manager.js`: `createAvatarWindow`, `createChatWindow`, `createCanvasWindow`
   - `browser-agent.js`: `ensurePinchtabService`, `pinchtabRequest`, `runPinchtabAction`
   - `computer-control.js`: `ensurePywinautoMcpService`, `callPywinautoTool`, `runPowerShellJson`

2. **Rischio di divergenza:** Se il codice duplicato non viene eliminato, future modifiche potrebbero essere applicate solo a una delle due versioni, introducendo bug sottili.

3. **Impossibilità di testing:** I moduli non sono testabili in isolamento perché dipendono da variabili globali di `main.js`.

4. **Manutenibilità:** `main.js` rimane un monolite di ~9200 righe nonostante lo sforzo di estrazione.

### Stato condiviso problematico

| Modulo | Variabili di stato | Uso in main.js |
|--------|-------------------|----------------|
| `window-manager.js` | Nessuna (le finestre sono in main.js) | `avatarWindow`, `chatWindow`, `canvasWindow` (righe 205-207) |
| `browser-agent.js` | `pinchtabProcess`, `pinchtabStartupPromise` | Usate da `ensurePinchtabService`, `stopPinchtabService` |
| `computer-control.js` | `pywinautoMcpProcess` | Usate da `ensurePywinautoMcpService`, `stopPywinautoMcpService` |

---

### Soluzioni Possibili

#### Opzione A: Dependency Injection (Consigliata)

**Approccio:** I moduli ricevono lo stato come parametro o tramite un oggetto di contesto.

```js
// main.js
const browserAgent = require('./browser-agent');
const computerControl = require('./computer-control');
const windowManager = require('./window-manager');

const sharedState = {
  pinchtabProcess: null,
  pinchtabStartupPromise: null,
  pywinautoMcpProcess: null,
  avatarWindow: null,
  chatWindow: null,
  canvasWindow: null,
};

// Inizializzazione
const browserService = browserAgent.createService(sharedState);
const computerService = computerControl.createService(sharedState);
const windowService = windowManager.createService(sharedState, app);

// Utilizzo
await browserService.ensurePinchtabService();
windowService.createAvatarWindow();
```

**Vantaggi:**
- Separazione netta delle responsabilità
- Stato esplicito e tracciabile
- Testing semplificato (mock dello stato)
- Nessun accoppiamento nascosto

**Svantaggi:**
- Richiede refactoring di tutte le funzioni nei moduli
- Cambia le firme delle funzioni (breaking change per l'uso corrente)
- `main.js` deve gestire l'inizializzazione dei servizi

**Sforzo stimato:** 4-6 ore
**Rischio:** Medio

---

#### Opzione B: State Getter/Setters (Minimo impatto)

**Approccio:** I moduli importano funzioni getter/setter da `main.js` per accedere allo stato.

```js
// main.js
let pinchtabProcess = null;
let avatarWindow = null;

function getPinchtabProcess() { return pinchtabProcess; }
function setPinchtabProcess(proc) { pinchtabProcess = proc; }
function getAvatarWindow() { return avatarWindow; }
function setAvatarWindow(win) { avatarWindow = win; }

module.exports = {
  getPinchtabProcess,
  setPinchtabProcess,
  getAvatarWindow,
  setAvatarWindow,
  // ... altri export
};

// browser-agent.js
const main = require('./main');

async function ensurePinchtabService() {
  let proc = main.getPinchtabProcess();
  if (!proc) {
    proc = spawn(...);
    main.setPinchtabProcess(proc);
  }
}
```

**Vantaggi:**
- Minime modifiche alle funzioni esistenti
- Mantiene le firme correnti
- Implementazione rapida

**Svantaggi:**
- Accoppiamento circolare (`browser-agent` → `main` → `browser-agent`)
- Stato ancora nascosto, non esplicito
- Testing ancora difficile (cicli di dipendenza)
- Pattern anti-modulare (i moduli "sanno" di main.js)

**Sforzo stimato:** 1-2 ore
**Rischio:** Alto (cicli di dipendenza, difficile da testare)

---

#### Opzione C: Incapsulamento Completo (Più pulito)

**Approccio:** Lo stato vive interamente nei moduli. `main.js` non gestisce più lo stato direttamente.

```js
// browser-agent.js
let pinchtabProcess = null;
let pinchtabStartupPromise = null;

async function ensurePinchtabService() {
  if (!pinchtabProcess) {
    pinchtabProcess = spawn(...);
  }
  return pinchtabProcess;
}

async function stopPinchtabService() {
  if (pinchtabProcess) {
    pinchtabProcess.kill();
    pinchtabProcess = null;
  }
}

module.exports = {
  ensurePinchtabService,
  stopPinchtabService,
  // ... altre funzioni
};

// main.js
const browserAgent = require('./browser-agent');

// Utilizzo - main.js non sa del processo
await browserAgent.ensurePinchtabService();
```

**Vantaggi:**
- Separazione netta: ogni modulo è responsabile del proprio stato
- `main.js` diventa un orchestratore sottile
- Testing possibile (ogni modulo è autonomo)
- Niente cicli di dipendenza

**Svantaggi:**
- Richiede di spostare le variabili di stato da `main.js` ai moduli
- Alcune funzioni in `main.js` potrebbero dover essere spostate
- Coordination necessaria per le finestre (chi crea chi?)

**Sforzo stimato:** 3-5 ore
**Rischio:** Medio-Basso

---

#### Opzione D: Hybrid State Container (Compromesso)

**Approccio:** Creare un modulo dedicato `state-container.js` che centralizza tutto lo stato condiviso.

```js
// state-container.js
class AppState {
  constructor() {
    this.pinchtabProcess = null;
    this.pywinautoMcpProcess = null;
    this.avatarWindow = null;
    this.chatWindow = null;
    this.canvasWindow = null;
  }
}

const sharedState = new AppState();
module.exports = { sharedState };

// main.js
const { sharedState } = require('./state-container');
const browserAgent = require('./browser-agent');

browserAgent.init(sharedState);
windowManager.init(sharedState, app);

// browser-agent.js
let sharedState = null;

function init(state) {
  sharedState = state;
}

async function ensurePinchtabService() {
  if (!sharedState.pinchtabProcess) {
    sharedState.pinchtabProcess = spawn(...);
  }
}

module.exports = { init, ensurePinchtabService, ... };
```

**Vantaggi:**
- Stato centralizzato ma esplicito
- Niente cicli di dipendenza
- Testing facilitato (mock del container)
- Estensibile per futuro stato condiviso

**Svantaggi:**
- Nuovo modulo da introdurre
- Leggera complessità aggiuntiva
- I moduli devono essere inizializzati esplicitamente

**Sforzo stimato:** 2-4 ore
**Rischio:** Basso

---

### Raccomandazione

**Opzione preferita: C (Incapsulamento Completo)**

Motivazione:
1. Allineato con l'architettura target "model-planned agent with server execution"
2. Ogni modulo è responsabile del proprio dominio (browser, computer, window)
3. `main.js` diventa un orchestratore sottile, non un gestore di stato
4. Testing possibile senza refactoring massivo
5. Niente cicli di dipendenza

**Fallback: D (Hybrid State Container)** se l'opzione C richiede troppo refactoring delle funzioni esistenti.

**Da evitare:** B (State Getter/Setters) — introduce accoppiamento circolare e rende il codice più difficile da mantenere.

---

### Prossimi Passi (se approvati)

1. [ ] Verificare che altri agenti concordino con l'analisi
2. [ ] Scegliere l'opzione preferita (A/B/C/D)
3. [ ] Creare branch dedicato per il refactor
4. [ ] Implementare l'opzione scelta in batch piccoli
5. [ ] Testare dopo ogni batch con `npm run build` + `npm run test:smoke`
6. [ ] Aggiornare CODEX.md con lo stato di avanzamento

---

*Sezione proposta per revisione multi-agente. Non modificare senza conferma.*

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
- [x] **Misurare latenza Kokoro in-app** dopo warmup
  - Benchmark aggiunto: `npm run bench:kokoro`.
  - Misura reale: startup ~10.16s, warm `ensure()` ~2ms, prima sintesi ~99ms, seconda sintesi ~93ms.

### 🟡 BREVE TERMINE — Importanti

- [ ] **Completare migrazione degli 8 moduli estratti**
  - Sostituire tutte le call inline in `main.js` con import dai moduli rispettivi.
  - Priorità: `state-manager.js` (lock/race), `tts-service.js` (caching).
- [x] **Avviare transizione JSON tool-use**
  - I turni con tool/azioni usano ora come formato canonico un envelope JSON con `segments` ordinati.
  - `parseInlineResponse()` accetta il formato canonico e mantiene il fallback legacy solo per compatibilita`.
- [x] **Aggiungere almeno un test automatico**
  - Integrare `test_acp.js` come `npm test` o `npm run test:smoke`.
  - Minimo: `npm run build` passa + una chiamata ACP base funzionante.
- [ ] **Rimuovere file spazzatura dalla radice**
  - Eliminare `lisat modd e resto.txt.txt`.
- [x] **Aggiungere `.gitignore`** con regole per:
  - `node_modules/`, `dist/`, `__pycache__/`, `.pinchtab-profile/`, `*.log`, `.env` — gia configurato e committato.
- [~] **Sblocco migrazione moduli — Opzione C: Incapsulamento Completo** (agent: opencode/mimo-v2-pro-free)
  - Stato vivra' nei moduli. main.js rimuove copie duplicate e usa getter/export dai moduli.
  - Ordine: computer-control → browser-agent → window-manager.
  - Testare con `npm run build` + `npm run test:smoke` dopo ogni modulo.
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

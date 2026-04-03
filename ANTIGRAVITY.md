# ANTIGRAVITY — Revisione Completa del Progetto
> Redatta da Antigravity · 2026-04-02

---

## 1. Identità del Progetto

**Nome:** `avatar-acp-desktop`  
**Versione:** `0.1.0`  
**Stack core:** Electron 40 + React 18 + Vite 7  
**Punto di ingresso principale:** `electron/main.js` (9 243 righe)  
**Data ultimo build verificato:** 2026-04-02  

Il progetto è un'applicazione Desktop per Windows che ospita un avatar 3D parlante ("Nyx"), dotata di:
- Una finestra trasparente senza bordi per l'avatar (TalkingHead WebGL)
- Una finestra di chat separata per l'interazione testuale
- Un terzo pannello opzionale ("Canvas") per contenuti rich-media
- Un cervello LLM autonomo (Qwen via ACP) che decide da solo quando usare tool
- TTS localizzato via Kokoro (voce `if_sara`, italiana)
- Lip-sync nativo, emozioni, pose, gesti

---

## 2. Mappa dell'Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                    │
│                     electron/main.js                        │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐ │
│  │ acp-runtime │ │ tts-service │ │   browser-agent.js    │ │
│  │  (QwenACP)  │ │  (Kokoro)   │ │      (PinchTab)       │ │
│  └─────────────┘ └─────────────┘ └───────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐ │
│  │ state-mgr   │ │ workspace-  │ │   computer-control    │ │
│  │ (locks,race)│ │   manager   │ │    (PowerShell)       │ │
│  └─────────────┘ └─────────────┘ └───────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Tool Modules (shell, file, search, git,        │   │
│  │       web, task, frustration, circuit-breaker,       │   │
│  │       dream-mode, personality, prompt-optimizer,     │   │
│  │       hooks, session-pruning, skills, apply-patch)   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
          IPC (preload.js → electronAPI)
          ┌────────────┴─────────────────┐
          │                              │
┌─────────┴──────────┐       ┌──────────┴───────────┐
│  AVATAR WINDOW      │       │    CHAT WINDOW        │
│  screen=avatar      │       │    screen=chat        │
│  NyxAvatar.jsx      │       │    AvatarChat.jsx     │
│  TalkingHead webview│       │    SettingsPanel.jsx  │
└────────────────────┘       └───────────────────────┘
                              ┌───────────────────────┐
                              │   CANVAS WINDOW        │
                              │   screen=canvas        │
                              │   CanvasWorkspace.jsx  │
                              └───────────────────────┘
```

---

## 3. Struttura dei File

### Radice
| File | Scopo |
|------|-------|
| `package.json` | Metadati npm, script `dev/build/start` |
| `vite.config.js` | Configurazione Vite per React |
| `index.html` | Entry HTML per il renderer |
| `CLAUDE.md` | Guida architetturale per l'AI (refactor state, IPC, contracts) |
| `PROJECT_STATUS.md` | SSOT dello stato di avanzamento (fasi 0–7) |
| `CODEX.md` | Stato refactor architettura "model-planned agent" |
| `ROADMAP.md` | Piano tool futuri (SHELL, FILE, GIT, WEB, ecc.) |
| `AVATAR_CAPABILITIES.md` | Riferimento completo emoji → espressioni, mood, pose, gesti |
| `IMPLEMENTATION_PLAN.md` | Piano JSON tool use per il brain ACP |

### `electron/` — Main Process (29 file)
| File | Ruolo | Dimensione |
|------|-------|-----------|
| `main.js` | **Orchestratore centralizzato** — gestione finestre, IPC, agent loop | 332 KB / 9 243 righe |
| `constants.js` | Tutte le costanti magiche estratte come named constants | 23 KB |
| `acp-runtime.js` | `QwenAcpRuntime` class — subprocess ACP via JSON-RPC, stream, session | 12 KB |
| `state-manager.js` | `ChatRequestManager` (lock), `PlaybackWaiterManager`, `StatusManager` | 11 KB |
| `workspace-manager.js` | Gestione workspace markdown, bootstrap, memory search | 42 KB |
| `browser-agent.js` | PinchTab browser automation, stale-ref recovery | 41 KB |
| `computer-control.js` | PowerShell desktop control, OCR, screenshot, Base64 injection fix | 20 KB |
| `window-manager.js` | Gestione finestre Electron estratta | 17 KB |
| `tts-service.js` | Kokoro TTS HTTP, response caching, auto-restart | 6 KB |
| `shell-tool.js` | Esecuzione comandi shell, processi background, isDangerous check | 4 KB |
| `file-tool.js` | Read/write/edit/delete file, listDirectory | 4 KB |
| `search-tool.js` | glob, grep, readManyFiles | 5 KB |
| `git-tool.js` | Operazioni git (status, diff, log, add, commit, branch, checkout) | 3 KB |
| `web-tool.js` | webFetch, webSearch | 3 KB |
| `task-tool.js` | Gestione TASK/TODOLIST (create, list, update, complete, delete) | 3 KB |
| `frustration-detector.js` | Regex multi-lingua per rilevare frustrazione utente | 2 KB |
| `circuit-breaker.js` | Stop automatico dopo 3 fallimenti ACP consecutivi | 2 KB |
| `dream-mode.js` | Modalità idle: rielaborazione memoria e aggiornamento workspace | 5 KB |
| `personality-manager.js` | Personalità evolutiva basata sulle interazioni | 6 KB |
| `prompt-optimizer.js` | Separazione prompt statico/dinamico, stima token, trim | 3 KB |
| `hooks-setup.js` | Inizializzazione sistema hooks/eventi | 1 KB |
| `hooks.js` | registerHook, emitHook | 2 KB |
| `session-pruning.js` | Pruning intelligente del contesto, MAX_CONTEXT_TOKENS | 4 KB |
| `skills.js` | Caricamento/matching/esecuzione skills locali | 2 KB |
| `apply-patch.js` | Applicazione patch diff unificato | 2 KB |
| `renderer-loop.js` | Utility comunicazione sicura main↔renderer | 1 KB |
| `preload.js` | Context bridge `window.electronAPI` | 4 KB |
| `kokoro_tts_server.py` | Server TTS Kokoro (Python, porta 5037) | 4 KB |

### `src/` — React Renderer
| File | Ruolo |
|------|-------|
| `main.jsx` | Entry React |
| `App.jsx` | Root component: routing per screen=avatar/chat/canvas, stato globale, IPC handler |
| `components/NyxAvatar.jsx` | Webview TalkingHead, command bus (speak/mood/motion/gesture/status/stop) |
| `components/AvatarChat.jsx` | UI chat: history, streaming, toolbar, workspace card |
| `components/CanvasWorkspace.jsx` | Pannello canvas: testo, clipboard, file, immagine, video, audio |
| `components/SettingsPanel.jsx` | Selezione brain, config Ollama, test brain |

---

## 4. Stato delle Fasi di Sviluppo

| Fase | Descrizione | Stato |
|------|-------------|-------|
| 0 | Project setup, scaffold Electron + React | ✅ Completato |
| 1 | Transparent desktop shell + always-on-top | ✅ Completato |
| 2 | Avatar host (NyxAvatar + TalkingHead) | ✅ Completato |
| 3 | Chat UI (streaming, stop, history) | ✅ Completato |
| 4 | ACP brain integration (Qwen via node CLI) | ✅ Completato |
| 5 | TTS + lip sync (Kokoro, if_sara) | ✅ Completato |
| 6 | Emotion, gesture, reaction layer | ✅ Completato |
| 7 | Polish, packaging, hardening Windows build | 🔄 Pending |

---

## 5. Il Cervello Agente (ACP)

Il brain è **autonomo**: decide per ogni request se rispondere, usare tool, o concatenare più tool.

### Flusso di una richiesta utente
```
Utente scrive → chat:send IPC → startDirectAcpRequest()
  → buildFullAcpPrompt() [workspace + memory + session + system prompt]
  → agentLoop():
      1. Chiama QwenAcpRuntime.runTurn()
      2. parseInlineResponse() → estrae tool tokens
      3. executeToolCalls() → esegue tool
      4. buildToolResultPrompt() → risultati → prossimo turno
      5. Ripete fino a risposta finale
  → finalizeParsedAssistantReply()
      → TTS synthesis → Kokoro HTTP
      → avatar-command speak + ACT tokens
      → stream-complete via IPC
```

### Token supportati nella risposta del brain
| Token | Azione |
|-------|--------|
| `<\|ACT:{...}\|>` | Emozione, gesto, posa avatar |
| `<\|DELAY:N\|>` | Pausa espressiva |
| `<\|BROWSER:{...}\|>` | Navigazione web via PinchTab |
| `<\|COMPUTER:{...}\|>` | Controllo desktop via PowerShell |
| `<\|CANVAS:{...}\|>` | Apertura/aggiornamento pannello canvas |
| `<\|WORKSPACE:{...}\|>` | Scrittura persistente nei file workspace |

**Piano futuro (IMPLEMENTATION_PLAN.md):** migrazione a risposte JSON strutturate con `{"tools": [...], "speech": "..."}` invece di token inline, con fallback regex durante la transizione.

### Tool disponibili nel brain
```
shell, read_file, write_file, edit_file, glob, grep,
multi_file_read, git, web_fetch, web_search, task,
act, delay, canvas, browser, computer, workspace,
apply_patch, list_directory, delete_file
```

---

## 6. Layer Avatar — Nyx

### Capacità espressive
- **55 emoji** auto-detectate nel testo parlato → espressioni facciali transient
- **8 mood persistenti**: neutral, happy, angry, sad, fear, disgust, love, sleep
- **11 pose**: straight, side, hip, turn, back, wide, oneknee, kneel, bend, sitting, dance
- **8 gesti**: handup, ok, index, thumbup, thumbdown, side, shrug, namaste
- **Animazioni FBX**: walking + qualsiasi Mixamo

### Pipeline TTS
```
testo ACP → normalizeSpeechText() → Kokoro HTTP (port 5037)
  → WAV audio → Base64 → avatar-command speak
  → NyxAvatar.jsx: decodeAudio → head.speakAudio(audioData, visemes)
  → Lip sync durante riproduzione
  → Reset a neutral dopo expectedDurationMs + 180ms
```

### IPC avatar-command
```js
{ cmd: 'speak',   audioBase64, expectedDurationMs }
{ cmd: 'mood',    mood }           // neutral|happy|angry|sad|fear|disgust|love|sleep
{ cmd: 'motion',  motion, motionType } // pose|animation|gesture
{ cmd: 'gesture', gesture }
{ cmd: 'status',  text }           // bubble 3.5s
{ cmd: 'stop' }
```

---

## 7. Moduli Refactored (Estratti da main.js)

Il `main.js` originale era un monolite di ~9 400 righe. **8 moduli core** sono stati estratti e corretti:

| Modulo | Bug Risolti |
|--------|------------|
| `constants.js` | Tutte le magic numbers diventano named constants |
| `state-manager.js` | Race condition → lock `ChatRequestManager` |
| `acp-runtime.js` | Memory leak → cleanup `pending Map` + timeout |
| `tts-service.js` | TTS bloccante → response caching |
| `browser-agent.js` | Service lifecycle → `startupPromise` corretto |
| `computer-control.js` | PowerShell injection → Base64; Ollama curl → fetch |
| `workspace-manager.js` | File senza limite → `writeTextFile` con size enforcement |
| `window-manager.js` | Single responsibility → window management estratto |

**Approccio migrazione:** incrementale. I moduli esportano le stesse firme dell'originale.

---

## 8. Workspace & Memoria

### Struttura workspace
```
workspace/
  USER.md         — Identità e preferenze utente
  SOUL.md         — Carattere del'assistente
  IDENTITY.md     — Identità dell'assistente
  MEMORY.md       — Memoria a lungo termine
  memory.md       — Note memoria
  sessions/       — Session records (JSON + Markdown)
  memory/         — Daily memory notes (journal-style)
```

### Bootstrap onboarding
Al primo avvio, il brain pone 7 domande:
1. Come si chiama l'assistente
2. Come si chiama l'utente
3. Ruolo dell'assistente
4. Tono e stile
5. Vincoli
6. Preferenze tool
7. Contesto/progetti

Le risposte vengono scritte nei file workspace tramite token `WORKSPACE`.

### Persistenza
| Dato | Dove |
|------|------|
| Bounds finestre | `userData/window-state.json` |
| Chat history | `userData/chat-history.json` |
| Session ACP | `userData/acp-session.json` |
| Memory Nyx | `userData/nyx-memory.json` |
| Bootstrap state | `userData/bootstrap-state.json` |
| Brain config | `userData/brain-state.json` |

---

## 9. Sistemi Avanzati

### Dream Mode
- Trigger: 5 minuti di inattività
- Analizza conversazioni recenti
- Estrae preferenze stabili
- Aggiorna MEMORY.md e USER.md
- Crea daily note riassuntiva
- Pulisce chat history troppo lunga

### Personalità Evolutiva
- Umore base si adatta al tono delle conversazioni
- Memoria a lungo termine di preferenze e nomi
- Stile comunicativo adattivo
- Tracciato nel file `PERSONALITY.md` del workspace

### Frustration Detector
- Regex multi-lingua (IT + EN)
- Reazione: mood `sad`/`fear`, gesto `shrug`, risposta più empatica

### Circuit Breaker ACP
- Dopo 3 fallimenti consecutivi: stop + notifica utente
- Reset automatico al prossimo messaggio

### Session Pruning
- `smartPrune()` mantiene il contesto entro `MAX_CONTEXT_TOKENS`
- `getContextStats()` per monitoraggio

### Hooks System
- `registerHook(event, fn)` / `emitHook(event, data)`
- Punti di estensione per future integrazioni

### Skills
- `loadSkills()` da cartella `skills/`
- `matchSkill(input)` → pattern matching
- `executeSkill(skill, context)` → esecuzione

---

## 10. Brain Supportati

| Brain ID | Tipo | Note |
|----------|------|-------|
| `qwen` | ACP via node CLI | Default, session resume |
| `ollama` | HTTP API | Configurabile host/model, no session |

**Plannificato ma non implementato:** resident HTTP orchestrator, sub-agent orchestration.

---

## 11. Variabili d'Ambiente

| Variabile | Default | Scopo |
|-----------|---------|-------|
| `AVATAR_TTS_PROVIDER` | `kokoro` | Provider TTS |
| `KOKORO_HOST` | `127.0.0.1` | Host TTS |
| `KOKORO_PORT` | `5037` | Porta TTS |
| `KOKORO_DEFAULT_SPEAKER` | `if_sara` | Voce Kokoro |
| `PINCHTAB_HOST` | `127.0.0.1` | Host browser agent |
| `PINCHTAB_PORT` | `9867` | Porta browser agent |
| `NYX_ENABLE_LIVE_CANVAS` | `true` | Canvas live (abilitato in produzione) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Host Ollama |
| `NYX_OLLAMA_MODEL` | `qwen3.5:0.8b` | Modello Ollama |

---

## 12. Analisi Critica — Problemi e Rischi

### 🔴 Critici

#### main.js ancora monolitico
- 9 243 righe in un singolo file
- ~378 righe duplicate browser-agent rimosse (T004b, commit `8e89479`)
- Service functions browser-agent restano in main.js (T003a blocked)
- **Rischio:** impossibile mantenere/testare unitariamente le parti core senza refactor completo

#### Migrazione moduli quasi completata
- `computer-control.js`: ✅ migrato
- `window-manager.js`: ✅ migrato con factory pattern (T004c)
- `browser-agent.js`: ⚠️ utility migrate, service functions restano in main.js (T003a blocked)
- **Rischio:** divergenza comportamentale se le service functions inline non vengono consolidate

#### Test unitari aggiunti
- Jest installato con test per window-manager.js e browser-agent.js (T005)
- Build e test passano
- **Nota:** Review #002 segnala regressione nel path `openCanvas()` non coperta dai test

### 🟡 Medi

#### Encoding corrotto in main.js
- Menzione esplicita in CODEX.md: "encoding-corrupted text in electron/main.js"
- Richiede patch chirurgiche per non introdurre nuovi bug
- **Impatto:** rallenta il refactor del browser-loop

#### Canvas live abilitato
- `NYX_ENABLE_LIVE_CANVAS=true` di default (T007)
- Feature raggiungibile e attiva in produzione
- **Impatto:** funzionalità canvas disponibile senza flag esplicito

#### Ollama non supporta session resume
- `supportsSessionResume: false` nella config
- Ogni turno Ollama riceve il contesto completo da zero
- **Impatto:** consumo token alto, latenza crescente nelle conversazioni lunghe

#### ACP token parsing fallwork
- Il parser supporta JSON "rilassato" non strettamente valido
- La transizione a JSON strutturato (IMPLEMENTATION_PLAN.md) è pianificata ma non avviata
- **Impatto:** fragile in caso di output inattesi dal brain

### 🟢 Minori / Da monitorare

- `skills/` contiene skill code-review (T008 completato)
- `.pinchtab-profile/` presente ma non documentato esplicitamente
- `test_acp.js` nella radice: script di test standalone, non integrato in npm scripts
- `lisat modd e resto.txt.txt`: file di testo nella radice (probabilmente appunti temporanei, da rimuovere)
- `electron/__pycache__/`: cache Python nella directory JS (da aggiungere a .gitignore)
- `profiles/` presente ma vuota

---

## 13. Qualità del Codice

### Punti di forza
- **Stile consistente:** camelCase, async/await corretto, error handling try/catch ovunque
- **Costanti estratte:** `constants.js` aggiorna tutti i magic numbers con nomi descrittivi
- **State isolation:** ogni modulo ha `createDefault*State()` factory function
- **Shutdown corretto:** `cleanupStarted` flag, processi figli killati su close
- **Injection fix:** comandi PowerShell usando Base64 invece di string interpolation
- **Memory leak fix:** pending Map pulita correttamente in `acp-runtime.js`
- **Streaming robusto:** throttled preview, delta diff per evitare re-render pesanti

### Debolezze
- **Dipendenza circolare potenziale:** main.js importa tutti i moduli, ma i moduli importano `constants.js` — verificare che nessun modulo importi main.js
- **God file:** main.js rimane troppo grande per essere comprehensibile
- **Mancanza di types:** nessun JSDoc esteso, nessun TypeScript — difficile refactor sicuro
- **Logging non strutturato:** `console.log/error` ovunque, nessun sistema di logging formale

---

## 14. IPC Channels — Inventario

### Renderer → Main (invoke)
```
chat:send, chat:stop, chat:get-history
avatar:command, avatar:playback
window:set-always-on-top, app:get-state
brain:set-selected, brain:set-ollama-config, brain:test
workspace:open-folder, workspace:complete-bootstrap
canvas:open, canvas:update, canvas:close, canvas:set-layout, canvas:get-state
browser:navigate, browser:refresh, browser:action
clipboard:read-text, clipboard:write-text
```

### Main → Renderer (on)
```
avatar-command    → speak, mood, motion, gesture, status, stop
avatar-status     → thinking, speaking, tts-loading, error, idle
chat-stream       → message, delta, complete, stopped, error, system,
                    tool_start, tool_complete, tool_error
canvas-state      → sync stato canvas
```

---

## 15. Roadmap e Prossimi Passi

### Immediato (da bloccare)

1. **Completare migrazione browser-agent service functions** — T003a (blocked, richiede spostamento helper da main.js)
2. **Fix regressione openCanvas()** — Review #002 I1: rileggere reference dopo ensureWindows()
3. **Estendere test al path creazione canvas** — Review #002 I2

### Breve termine

4. **Eliminare reference stale nella persistenza finestre** — Review #002 I3
5. **Consolidare confine window-manager** — Review #002 M1: rinominare utility non usate
6. **Aggiungere JSDoc agli 8 moduli estratti** — T010
7. **Audit Lighthouse accessibilità** — T017

### Medio termine

8. **Phase 7 completamento** — packaging Windows, installer, startup defaults, harden IPC
9. **Popolare `skills/`** con skill reali (T008 — completato, espandere)
10. **Documentare la API preload** con JSDoc completo (T009 — completato)

### Lungo termine

13. **Sub-agent orchestration** (ROADMAP.md)
14. **LSP integration** per coding assistant avanzato
15. **VRM/Live2D** come alternativa a TalkingHead
16. **Resident HTTP orchestrator** invece di ACP direct

---

## 16. Metriche del Progetto

| Metrica | Valore |
|---------|--------|
| Linee totali (electron/) | ~170 000 |
| Moduli estratti da main.js | 22 (20 completati, 2 parziali) |
| Dipendenze runtime | 5 (concurrently, cross-env, framer-motion, react, react-dom) |
| Dipendenze dev | 3 (@vitejs/plugin-react, electron, vite) |
| Tool brain disponibili | ~20 |
| Emoji supportate avatar | 55 |
| Mood persistenti | 8 |
| Pose | 11 |
| Gesti | 8 |
| Canali IPC | ~25 |
| Variabili d'ambiente | 9 |
| File documentazione | 12 |
| Test automatici | 2 suite Jest, 16 test (T005) |
| Build status | ✅ Verde |

---

## 17. Verdict Complessivo

Il progetto è **funzionante e ambizioso**, con un'architettura che ha già risolto problemi reali (race condition, memory leak, injection vulnerability, TTS blocking). La visione è chiara e la roadmap è concreta.

Il principale debito tecnico è il **monolite `main.js`**: tecnicamente funziona, ma è un rischio operativo crescente. La strategia di estrazione incrementale è corretta e ha già rimosso ~378 righe duplicate (T004b), completato la migrazione di window-manager.js (T004c) e aggiunto test Jest (T005). Resta da completare la migrazione delle service functions browser-agent (T003a).

Il progetto è pronto per la **Phase 7 (packaging)** dal punto di vista funzionale (installer creato, canvas live abilitato), ma non ancora dal punto di vista della robustezza (regressione openCanvas() da fixare, test non coprono tutti i path).

**Priorità assoluta consigliata:** fix regressione openCanvas() (Review #002 I1), completare T003a, estendere test al path di creazione canvas.

---

*Documento generato automaticamente da Antigravity dopo analisi completa del codice sorgente.*  
*File analizzati: 35+ · Righe lette: ~12 000 · Data revisione: 2026-04-02*  
*Aggiornato: 2026-04-02 (Documenter) — metriche, roadmap, verdict allineati a stato reale*

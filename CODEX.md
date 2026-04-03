# CODEX — Avatar ACP Desktop

**Ruolo:** Documento di coordinamento multi-agente e stato architetturale.

**Come usare questo file:**
1. Leggere **sempre** prima di iniziare lavoro sul progetto
2. Controllare i file collegati: `PROPOSTE.md`, `TASK.md`, `RICERCA.md`
3. Aggiornare la sezione `Current Status` dopo ogni batch di lavoro
4. Non sovrascrivere cambiamenti di altri agenti — riallineare prima di ogni batch

---

## File di Progetto

| File | Scopo | Quando usare |
|------|-------|--------------|
| `CODEX.md` | Coordinamento multi-agente, stato architetturale, ruoli | **Lettura obbligatoria** prima di ogni sessione di lavoro |
| `PROPOSTE.md` | Proposte architetturali e refactor in revisione | Scrivere quando serve approvazione multi-agente su decisioni |
| `TASK.md` | Task implementative tracciate e assegnate | Leggere per vedere cosa fare, aggiornare dopo ogni commit |
| `RICERCA.md` | Ricerche su tecnologie, performance, best practice | Avviare ricerche quando serve esplorazione prima di implementare |
| `REVIEW.md` | Code review formali per task/PR completati | Revisore compila review prima del merge |
| `DECISIONI.md` | Decisioni architetturali (ADR) tracciate e motivate | Architect documenta decisioni importanti |
| `ANTIGRAVITY.md` | Analisi approfondita architettura e codice | Consultare per comprensione completa del sistema |
| `design-system.md` | Design system UI | UI Specialist: colori, tipografia, componenti |
| `STARTUP_AGENTS.md` | Prompt e integrazione per team AI multi-agente | Onboarding nuovi agenti, configurazione ruoli |
| `STARTUP_ROLES.md` | Ruoli business + tecnici essenziali per startup | Pianificazione team, fasi di scaling |
| `MULTI_AGENT_WORKFLOW.md` | Workflow completi per 16 ruoli | Riferimento operativo per tutti gli agenti |
| `AVATAR_CAPABILITIES.md` | Reference completo: emoji, mood, pose, gesti, comandi | Consultare per capacità avatar Nyx |

---

## Ruoli Multi-Agente

### Ricercatore

**Responsabilità:**
- Esplorare tecnologie, pattern, librerie per risolvere problemi specifici
- Condurre ricerche online (documentazione ufficiale, GitHub, Stack Overflow, paper accademici, blog tecnici)
- Produrre benchmark e confronti oggettivi
- Testare localmente le tecnologie promettenti quando fattibile
- Documentare risultati in `RICERCA.md`
- Segnalare raccomandazioni per proposte o task

**Workflow:**
```
1. Riceve domanda di ricerca (da TASK.md o richiesta diretta)
2. Cerca online: documentazione, GitHub issues, npm, blog, paper
3. Valuta: maturità, manutenzione, compatibilità, performance
4. Testa localmente se possibile (install, benchmark, proof-of-concept)
5. Documenta in RICERCA.md con formato standard, include link e snippet
6. Produce raccomandazioni: implementare / ignorare / approfondire
7. Se serve approvazione → crea proposta in PROPOSTE.md
8. Se azione diretta → crea task in TASK.md
```

**Strumenti di ricerca:**
- Web search per documentazione e confronti
- GitHub per issue, PR, activity delle librerie
- npm trends per popolarità e manutenzione
- Benchmark locali quando applicabile

**Output atteso:**
- Sezione completata in `RICERCA.md`
- Link a fonti primarie (documentazione, repo, issue)
- Benchmark numerici quando possibile
- Raccomandazioni chiare e motivate con pro/contro

---

### Revisore

**Responsabilità:**
- Valutare proposte architetturali in `PROPOSTE.md`
- Eseguire code review di cambiamenti, PR, o task completate
- Verificare correttezza, sicurezza, qualità del codice
- Controllare coerenza con architettura target
- Approvare o richiedere modifiche prima dell'implementazione o del merge

**Workflow di Review Architetturale:**
```
1. Legge proposta in PROPOSTE.md
2. Analizza: correttezza tecnica, impatto, rischi, alternative
3. Verifica coerenza con architettura "model-planned agent"
4. Scrive review nella sezione "Revisione Multi-Agente" della proposta
5. Vota: Approvato / Approvato con modifiche / Respinto
6. Se approvato → assegna costruttore in TASK.md
```

**Workflow di Code Review:**
```
1. Identifica cambiamenti da review (git diff, PR, o task completata)
2. Analizza il codice con checklist di review
3. Segnala problemi per severità (Critical / Important / Minor)
4. Esprime verdict: Ready to Merge / Changes Required / Not Ready
5. Documenta la review in REVIEW.md o nel PR
6. Verifica fix dopo modifiche del costruttore
```

**Criteri di Review Architetturale:**
- [ ] Coerenza con architettura target
- [ ] Assenza di accoppiamenti circolari
- [ ] Testabilità della soluzione
- [ ] Manutenibilità a lungo termine
- [ ] Performance e sicurezza

**Criteri di Code Review:**
- [ ] Correttezza funzionale (il codice fa quello che dovrebbe?)
- [ ] Sicurezza (niente input non validato, secrets esposte, injection?)
- [ ] Qualità del codice (naming, funzione lunghe, duplicazione?)
- [ ] Performance (niente loop inutili, query ottimizzate?)
- [ ] Error handling (try/catch, fallback, logging?)
- [ ] Test (unit test, integration test se pertinenti?)
- [ ] Documentazione (JSDoc, commenti sul "perché"?)

**Output atteso:**
- Review compilata in `PROPOSTE.md` o `REVIEW.md`
- Voto motivato con severità per ogni problema trovato
- Eventuali contro-proposte o modifiche richieste
- Verdict chiaro: Merge Ready / Changes Required / Not Ready

---

### Costruttore

**Responsabilità:**
- Implementare task assegnate in `TASK.md`
- Scrivere codice seguendo convenzioni di progetto
- Eseguire build e test dopo ogni cambiamento
- Aggiornare documentazione correlata

**Workflow:**
```
1. Legge TASK.md e identifica task assegnate
2. Verifica dipendenze e prerequisiti (proposte approvate, ricerche)
3. Esegue `git status` per verificare stato repo
4. Implementa in batch piccoli e verificabili
5. Esegue `npm run build` dopo ogni batch
6. Esegue `npm run test:smoke` se pertinente
7. `git add .` per file modificati
8. `git commit -m "messaggio con task ID"` 
9. Aggiorna TASK.md: stato, commit link, note
10. Se blocca → aggiorna TASK.md e notifica in CODEX.md
```

**Convenzioni di codice:**
- CamelCase per variabili e funzioni
- Async/await corretto ovunque
- Error handling con try/catch
- Niente console.log in produzione (usare logger se esiste)
- Commenti solo per "perché", non per "cosa"

**Output atteso:**
- Codice funzionante e testato
- Commit con messaggio chiaro
- TASK.md aggiornato
- Eventuali note in CODEX.md

---

### Architect

**Responsabilità:**
- Definire la visione architetturale a lungo termine
- Prendere decisioni su pattern, tecnologie core, confini di modulo
- Risolvere disaccordi tra revisore e costruttore
- Mantenere coerenza tra PROPOSTE.md e architettura target
- Aggiornare CODEX.md con cambiamenti architetturali

**Workflow:**
```
1. Riceve proposta controversa o decisione complessa
2. Valuta impatto su architettura esistente e futura
3. Consulta documentazione architetturale (CODEX.md, ANTIGRAVITY.md)
4. Decide: approva, modifica, o respinge con motivazione
5. Aggiorna documentazione architetturale se necessario
6. Comunica decisione a tutti gli agenti
```

**Output atteso:**
- Decisione architetturale documentata in CODEX.md o PROPOSTE.md
- Aggiornamenti a documentazione se l'architettura cambia
- Linee guida chiare per implementazioni future

---

### QA / Tester

**Responsabilità:**
- Verificare che le task completate funzionino correttamente
- Eseguire test manuali e automatizzati
- Segnalare bug in TASK.md con riproducibilità
- Mantenere suite di test aggiornata

**Workflow:**
```
1. Identifica task completate in TASK.md (stato: Completed)
2. Esegue build: npm run build
3. Esegue test: npm run test:smoke o test specifici
4. Test manuali se pertinenti (flusso utente, edge case)
5. Segnala bug in TASK.md con:
   - Descrizione chiara
   - Step per riprodurre
   - Comportamento atteso vs osservato
   - Screenshot/log se utili
6. Approva merge se tutto verde
```

**Output atteso:**
- Report di test in TASK.md o REVIEW.md
- Bug segnalati con riproducibilità
- Approvazione merge o richiesta di fix

---

### Documenter

**Responsabilità:**
- Mantenere documentazione sincronizzata con il codice
- Scrivere guide, README, esempi d'uso
- Aggiornare PROPOSTE.md, TASK.md, RICERCA.md con formattazione corretta
- Creare diagrammi architetturali quando utili

**Workflow:**
```
1. Monitora commit e task completate
2. Identifica documentazione da aggiornare
3. Scrive/aggiorna file pertinenti
4. Verifica coerenza con codice implementato
5. Segnala discrepanze tra docs e implementazione
```

**Output atteso:**
- Documentazione aggiornata e coerente
- README.md chiaro per nuovi sviluppatori
- Diagrammi o esempi quando utili

---

### UI Specialist

**Responsabilità:**
- Progettare e mantenere coerenza visiva dell'interfaccia (React components)
- Garantire usabilità, accessibilità (a11y) e user experience
- Definire design system: palette colori, tipografia, spacing, componenti
- Ottimizzare layout per responsive e diverse risoluzioni
- Progettare animazioni e micro-interazioni (transizioni, feedback visivi)
- Condurre user testing e raccogliere feedback sull'interfaccia

**Workflow:**
```
1. Analizza UI esistente o nuova feature da implementare
2. Definisce/revisa design system e pattern visivi
3. Crea mockup o prototipi (Figma, schizzi, o codice diretto)
4. Implementa o coordina implementazione con Costruttore
5. Testa usabilità: navigazione, accessibilità, responsive
6. Documenta pattern UI in documentazione progetto
7. Raccoglie feedback utente e itera su miglioramenti
```

**Strumenti:**
- Figma o strumenti di design per mockup
- React DevTools per analisi componenti
- Lighthouse per audit accessibilità e performance
- User testing (osservazione diretta, registrazioni)

**Criteri di qualità UI:**
- [ ] Coerenza visiva (colori, font, spacing uniformi)
- [ ] Accessibilità WCAG AA (contrasti, keyboard navigation, screen reader)
- [ ] Responsive (funziona su diverse risoluzioni)
- [ ] Performance (nessun layout shift, animazioni fluide 60fps)
- [ ] Usabilità (flusso intuitivo, feedback chiari, error handling visibile)

**Output atteso:**
- Design system documentato (colori, tipografia, componenti)
- UI coerente in tutte le finestre (avatar, chat, canvas)
- Audit accessibilità con score Lighthouse ≥90
- Pattern UI riutilizzabili documentati
- Mockup/prototipi per nuove feature

---

## Ruoli Futuri (Non Ancora Attivi)

Questi ruoli saranno attivati quando il progetto raggiungerà determinate milestone.

### Security Specialist (Da attivare - Phase 7)

**Quando attivare:** Prima del packaging Windows e distribuzione.

**Responsabilità:**
- Audit sicurezza: injection, secrets, validazione input, IPC security
- Review dipendenze per vulnerabilità note (npm audit)
- Hardening Electron: sandbox, contextIsolation, nodeIntegration
- Security testing: penetration test, fuzzing input
- Definire security policy e best practice

**Workflow:**
```
1. Analizza superfici di attacco (shell, file, IPC, browser automation)
2. Esegue audit automatico (npm audit, electron-builder security)
3. Review manuale codice per injection e secrets esposte
4. Documenta vulnerabilità per severità
5. Definisce fix e hardening required
6. Verifica fix applicati prima del release
```

**Output atteso:**
- Report sicurezza con vulnerabilità e fix
- Dipendenze aggiornate e senza CVE critiche
- Electron hardening applicato
- Security checklist per release

---

### DevOps / Release Manager (Da attivare - Phase 7)

**Quando attivare:** Prima del packaging Windows e distribuzione.

**Responsabilità:**
- Build automation e CI/CD pipeline
- Windows installer packaging (electron-builder)
- Versioning semantico e changelog
- Distribuzione e aggiornamenti automatici
- Monitoraggio crash e performance post-release

**Workflow:**
```
1. Configura pipeline build automatica (GitHub Actions o simile)
2. Setup electron-builder per Windows installer
3. Definisce versioning semantico (major.minor.patch)
4. Genera changelog da commit e task completate
5. Configura aggiornamenti automatici (electron-updater)
6. Monitora crash report e performance post-release
```

**Output atteso:**
- Installer Windows funzionante (.exe o .msi)
- CI/CD pipeline automatizzata
- Changelog versionato per release
- Sistema di aggiornamenti automatici
- Dashboard monitoraggio crash/performance

---

## Flusso di Lavoro Multi-Agente

```
┌─────────────────────────────────────────────────────────────────┐
│                         RICERCA.md                              │
│  Ricercatore: esplora, benchmark, raccomanda                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PROPOSTE.md                              │
│  Ricercatore: propone → Revisore: valuta → Architect: decide    │
└────────────────────────┬────────────────────────────────────────┘
                         │ approvato
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         TASK.md                                 │
│  Revisore: assegna → Costruttore: implementa → QA: testa        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        REVIEW.md                                │
│  Revisore: code review → Verdict: Merge / Changes / Not Ready   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DECISIONI.md                               │
│  Architect: documenta ADR per decisioni importanti              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CODEX.md                                 │
│  Tutti: aggiornano stato, coordinamento, storico sessioni       │
└─────────────────────────────────────────────────────────────────┘
```

### Regole di Coordinamento

1. **Lettura obbligatoria:** Ogni agente legge CODEX.md prima di lavorare
2. **Riallineamento:** Controllare TASK.md e PROPOSTE.md prima di ogni batch
3. **Niente sovrascritture:** Non modificare lavoro di altri agenti senza conferma
4. **Build verde:** `npm run build` deve passare dopo ogni cambiamento
5. **Test smoke:** `npm run test:smoke` per verifiche rapide
6. **Documentazione:** Aggiornare il file pertinente dopo ogni cambiamento
7. **Git sempre:** Ogni cambiamento deve essere committato con messaggio descrittivo

---

## Regole Git

**Obbligatorio:**
- `git status` prima di iniziare lavoro
- `git add .` per file modificati
- `git commit -m "messaggio chiaro"` dopo ogni task completata
- `git log -n 3` per verificare stile messaggi
- `git status` dopo commit per verificare successo

**Messaggi di commit:**
- Usare imperativo presente: "Migrare X", "Fix Y", "Aggiornare Z"
- Includere riferimenti a task/task: "T003a", "PROPOSTE.md #001"
- Essere concisi ma descrittivi (max 72 caratteri prima riga)

**Branch:**
- Default: `master` per cambiamenti diretti
- Feature grandi: `feature/<nome>-<data>` (es. `feature/module-migration-0402`)
- Merge solo dopo review e build verde

---

## Obiettivo Architetturale

Portare il runtime a **`model-planned agent with server execution`**:

- **Brain (model-planned):** Decide se chiamare tool, aspettare risultati, parlare, rispondere
- **Server (executor):** Esegue tool, ritorna risultati strutturati, streama stato, enforce limiti

---

## Current Status

- **Stato:** In progress
- **Area di lavoro attiva:** Documentazione in riallineamento (Documenter batch)
- **Ultima build verificata:** `npm run build` passata il 2026-04-02
- **Task in esecuzione:** Nessuna
- **Ultima task completata:** T009 — JSDoc aggiunta a preload API
- **Blocco corrente:** T003a (browser-agent service functions) — richiede migrazione helper da main.js
- **Decisione architetturale:** ADR-002 (Incapsulamento Completo), ADR-003 (Sblocco T003a/T003c) — entrambe approvate
- **Prossima azione:** T008 (popolare skills/) o T003a (completare migrazione browser-agent helper)

---

## Git

- **Repository:** Inizializzato il 2026-04-02
- **Ultimo commit:** `8e89479` — T004b: remove ~378 duplicate browser-agent lines from main.js
- **User:** `salzi <salzi@local>`
- **.gitignore:** `node_modules/`, `dist/`, `__pycache__/`, `.pinchtab-profile/`, `*.log`, `.env`

---

## Fasi di Sviluppo

| Fase | Descrizione | Stato | Note |
|------|-------------|-------|------|
| 0 | Project setup, scaffold Electron + React | ✅ Completato | Vite 7, React 18, Electron 40 |
| 1 | Transparent desktop shell + click-through | ✅ Completato | Frameless, always-on-top |
| 2 | Avatar host (NyxAvatar + TalkingHead) | ✅ Completato | WebGL, lip-sync, 55 emoji |
| 3 | Chat UI (streaming, stop, history) | ✅ Completato | AvatarChat, CanvasWorkspace |
| 4 | ACP brain integration (Qwen via ACP) | ✅ Completato | Direct stdio, session resume |
| 5 | TTS + lip sync (Kokoro, if_sara) | ✅ Completato | HTTP service, caching |
| 6 | Emotion, gesture, facial reactions | ✅ Completato | ACT tokens, mood/pose/gesture |
| 7 | Polish, packaging Windows | 🔄 Inizio | Installer, hardening, CI/CD |

---

## Roadmap Tool (Priorità)

**Completati:**
- ✅ `browser` — PinchTab automation (navigate, action, snapshot)
- ✅ `computer` — PowerShell desktop control (mouse, keyboard, screenshot, OCR)
- ✅ `canvas` — Rich media panel (text, clipboard, image, video, audio, files)
- ✅ `workspace` — Markdown persistence (USER.md, MEMORY.md, sessions)
- ✅ `shell` — Command execution (run, background, stop)
- ✅ `read_file`, `write_file`, `edit_file`, `delete_file`, `list_directory`
- ✅ `glob`, `grep`, `read_many_files`
- ✅ `git` — status, diff, log, add, commit, branch, checkout
- ✅ `web_fetch`, `web_search`
- ✅ `task` — TASK/TODOLIST management
- ✅ `apply_patch` — Unified diff application

**Da implementare (vedi TASK.md):**
- Completare migrazione browser-agent service functions (T003a)
- Skills reali in `skills/` (T008)
- JSDoc API preload (T009 — completata)
- JSDoc moduli estratti (T010)

---

## Architettura Core

### Runtime Attivo

- Loop tool neutro: `agentLoop(...)` come unico ponte planner/executor
- Niente fallback browser-only
- Niente routing semantico lato server
- Risultati action-tool feedati nel prossimo turno ACP
- Prompt ricostruito ogni turno via `buildDirectAcpPrompt(...)`

### Moduli Estratti (22 totali)

| Modulo | Stato import | Note |
|--------|--------------|------|
| `constants.js` | ✅ Importato | Tutte le costanti magiche |
| `state-manager.js` | ✅ Importato | Lock, race condition |
| `acp-runtime.js` | ✅ Importato | QwenAcpRuntime class |
| `tts-service.js` | ✅ Importato | Kokoro HTTP, caching |
| `workspace-manager.js` | ✅ Importato (parziale) | Bootstrap, memory search |
| `shell-tool.js` | ✅ Importato | Esecuzione comandi |
| `file-tool.js` | ✅ Importato | Read/write/edit/delete |
| `search-tool.js` | ✅ Importato | Glob, grep, readMany |
| `git-tool.js` | ✅ Importato | Git operations |
| `web-tool.js` | ✅ Importato | Fetch, search |
| `task-tool.js` | ✅ Importato | TASK/TODOLIST |
| `frustration-detector.js` | ✅ Importato | Regex multi-lingua |
| `circuit-breaker.js` | ✅ Importato | Stop dopo 3 fallimenti |
| `dream-mode.js` | ✅ Importato | Idle reprocessing |
| `personality-manager.js` | ✅ Importato | Personalità evolutiva |
| `prompt-optimizer.js` | ✅ Importato | Token estimation, trim |
| `hooks-setup.js` | ✅ Importato | Inizializzazione hooks |
| `hooks.js` | ✅ Importato | registerHook, emitHook |
| `session-pruning.js` | ✅ Importato | Smart pruning contesto |
| `skills.js` | ✅ Importato | Caricamento skill |
| `apply-patch.js` | ✅ Importato | Patch diff unificato |
| `renderer-loop.js` | ✅ Importato | IPC utilities |
| `window-manager.js` | ✅ Importato | Factory pattern con getter/setter. Tutte le create*Window migrate. |
| `browser-agent.js` | ⚠️ Parziale | 21 utility + 18 alias importati, ~378 righe duplicate rimosse (T004b). Service functions restano in main.js (T003a blocked) |
| `computer-control.js` | ✅ Importato | Migrato, nessuna funzione duplicata residua |

---

## Vincoli Architetturali

- **NO** fallback routing semantico lato server
- **NO** modalità esecuzione task-specifiche scelte dal server
- **SI** hard capability checks:
  - Tool binario non disponibile
  - Piattaforma non supportata
  - Vincoli di mutabilità file

---

## Verifica

- `npm run build` deve rimanere verde dopo ogni batch
- Smoke test richiesti dopo cambiamenti che influenzano:
  - Multi-turn browser flows
  - Intermediate TTS updates
  - Session management

---

## Note Recenti

- Transizione JSON tool-use completata: envelope JSON canonico con `segments` ordinati (`818765f`)
- Benchmark Kokoro in-app completato: startup ~10.16s, warm ensure ~2ms, prima sintesi ~99ms, seconda ~93ms (`5269361`)
- `isLikelyBrowserAutopilotTask(...)` eliminato da main.js
- `getToolAvailability(...)` rimane come capability gate
- ACP runtime convergente: niente doppia implementazione
- Costant aliases (`const X = C.X`) rimangono (48 linee) — low priority

---

## Storico Sessioni

| Data | Agente | Cambiamenti | Note |
|------|--------|-------------|------|
| 2026-04-02 | Agente analisi | Creati PROPOSTE.md, TASK.md, RICERCA.md | Struttura multi-agente base |
| 2026-04-02 | Agente analisi | Aggiornato CODEX.md con ruoli e workflow | 3 ruoli: Ricercatore, Revisore, Costruttore |
| 2026-04-02 | Agente analisi | Esteso ruoli: Ricercatore (ricerche online), Revisore (code review) | Workflow dettagliati |
| 2026-04-02 | Agente analisi | Aggiunti ruoli: Architect, QA/Tester, Documenter | 6 ruoli totali |
| 2026-04-02 | Agente analisi | Creati REVIEW.md, DECISIONI.md | Review formali + ADR |
| 2026-04-02 | Agente analisi | Aggiornato flusso multi-agente con tutti i file | Diagramma completo |
| 2026-04-02 | Agente Revisore (AI) | Review PROPOSTE.md #001 | ✅ Approvata con modifiche, Opzione C selezionata |
| 2026-04-02 | Agente Revisore (AI) | Aggiornato DECISIONI.md | ADR-002 approvata |
| 2026-04-02 | Agente Revisore (AI) | Aggiornato TASK.md | Task T003a/b/c pronte, blocco rimosso |
| 2026-04-02 | Agente analisi | Aggiunto ruolo UI Specialist | 7 ruoli attivi + 2 futuri |
| 2026-04-02 | Agente analisi | Aggiunti Ruoli Futuri: Security Specialist, DevOps | Da attivare in Phase 7 |
| 2026-04-02 | Agente analisi | Cancellati PROJECT_STATUS.md, ROADMAP.md | Non integrati, info migrate in CODEX.md |
| 2026-04-02 | Agente analisi | Aggiunte Fasi di Sviluppo + Roadmap Tool | Phase 0-7, tool completati vs da fare |
| 2026-04-02 | Codex | Completata transizione JSON tool-use | Commit `818765f`, formato canonico `segments` |
| 2026-04-02 | Codex | Misurata latenza Kokoro in-app | Commit `5269361`, cold start ~10.16s, synth warm ~93ms |
| 2026-04-02 | Kilo (Revisore 2) | Completata revisione PROPOSTE.md #001 | ✅ Approvato con note — confermata Opzione C |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | Migrazione computer-control.js | ✅ T003b completato, -109 righe duplicate, commit `d60234e` |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | browser-agent auth token getter/setter, window-manager utility imports | Parziale T003a/T003c, commit `601ad79` |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | Bloccato T003a/T003c, aggiunti T004b/T004c | Service functions accoppiate a helper main.js-specifici, commit `cddb148` |
| 2026-04-02 | Kilo (Architect) | ADR-003 — Sblocco T003a/T003c | Rimozione duplicati browser-agent + factory window-manager |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T002 junk rimosso, T004b partial (18 alias browser-agent), CODEX allineato | Commit `2ac277e`, build verde |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T004b completato: ~378 righe duplicate browser-agent rimosse da main.js | Build verde, dead code eliminato (helpers + service functions). T004c iniziato |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T004c completato: getter/setter finestre in window-manager.js, 93 reference sites aggiornati | Build e smoke test passati |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T005 completato: Jest installato, test per window-manager.js e browser-agent.js | Build e test passati |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T006 completato: electron-builder configurato, installer Windows creato | dist-electron/Avatar ACP Setup 0.1.0.exe |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T007 completato: ENABLE_LIVE_CANVAS default true | Build e smoke test passati |
| 2026-04-02 | opencode/mimo-v2-pro-free (Costruttore) | T009 completato: JSDoc aggiunta a preload API | |
| 2026-04-02 | Documenter (opencode) | Riallineamento documentazione: CODEX.md, TASK.md, REVIEW.md, ANTIGRAVITY.md | Fix discrepanze docs vs codice |

---

*Ultimo aggiornamento: 2026-04-02 (Documenter batch — riallineamento documentazione)*
*Prossima azione: **Costruttore** completa T003a (browser-agent service functions) o **Documenter** popola T008 (skills/)*
*Ruoli disponibili: Ricercatore, Revisore, Costruttore, Architect, QA/Tester, Documenter, UI Specialist (7 attivi)*
*Ruoli futuri: Security Specialist, DevOps/Release Manager (da attivare in Phase 7)*
*Task pronte: T008 (Pending), T010 (Pending), T003a (Blocked)*
*Task completate: T003b ✅, T003c ✅, T004b ✅, T004c ✅, T005 ✅, T006 ✅, T007 ✅, T009 ✅*
*Decisioni approvate: ADR-001 (struttura file), ADR-002 (incapsulamento moduli), ADR-003 (sblocco T003a/T003c)*
*Review complete: PROPOSTE.md #001 (2/2 revisori), Review #001 CODEX.md (fix in corso)*
*Fasi: Phase 0-6 completate, Phase 7 (packaging) iniziato*
*Tool: 20+ implementati, migrazione moduli quasi completata (resta T003a)*
*Directory nuove: `skills/` (vuota), `__tests__/` (Jest tests), `dist-electron/` (installer)*

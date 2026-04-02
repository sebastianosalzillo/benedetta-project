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
| `CODEX.md` | Coordinamento multi-agente, stato architetturale, ruoli | Lettura obbligatoria prima di ogni sessione di lavoro |
| `PROPOSTE.md` | Proposte architetturali e refactor in revisione | Scrivere quando serve approvazione multi-agente su decisioni |
| `TASK.md` | Task implementative tracciate e assegnate | Leggere per vedere cosa fare, aggiornare dopo ogni commit |
| `RICERCA.md` | Ricerche su tecnologie, performance, best practice | Avviare ricerche quando serve esplorazione prima di implementare |
| `ANTIGRAVITY.md` | Analisi approfondita architettura e codice | Consultare per comprensione completa del sistema |
| `PROJECT_STATUS.md` | Stato fasi di sviluppo e roadmap | Riferimento per milestone e deliverable |
| `ROADMAP.md` | Feature future e visione lungo termine | Pianificazione e priorizzazione |

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
3. Implementa in batch piccoli e verificabili
4. Esegue `npm run build` dopo ogni batch
5. Esegue `npm run test:smoke` se pertinente
6. Commit con messaggio descrittivo
7. Aggiorna TASK.md: stato, commit link, note
8. Se blocca → aggiorna TASK.md e notifica in CODEX.md
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

## Flusso di Lavoro Multi-Agente

```
┌─────────────────┐
│   RICERCA.md    │ ← Ricercatore esplora e documenta
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PROPOSTE.md    │ ← Ricercatore propone, Revisore valuta
└────────┬────────┘
         │ approvato
         ▼
┌─────────────────┐
│    TASK.md      │ ← Revisore assegna, Costruttore esegue
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   CODEX.md      │ ← Aggiornamento stato e coordinamento
└─────────────────┘
```

### Regole di Coordinamento

1. **Lettura obbligatoria:** Ogni agente legge CODEX.md prima di lavorare
2. **Riallineamento:** Controllare TASK.md e PROPOSTE.md prima di ogni batch
3. **Niente sovrascritture:** Non modificare lavoro di altri agenti senza conferma
4. **Build verde:** `npm run build` deve passare dopo ogni cambiamento
5. **Test smoke:** `npm run test:smoke` per verifiche rapide
6. **Documentazione:** Aggiornare il file pertinente dopo ogni cambiamento

---

## Obiettivo Architetturale

Portare il runtime a **`model-planned agent with server execution`**:

- **Brain (model-planned):** Decide se chiamare tool, aspettare risultati, parlare, rispondere
- **Server (executor):** Esegue tool, ritorna risultati strutturati, streama stato, enforce limiti

---

## Current Status

- **Stato:** In progress
- **Area di lavoro attiva:** `electron/main.js`
- **Ultima build verificata:** `npm run build` passata il 2026-04-02
- **Task in esecuzione:** Sblocco migrazione moduli — Opzione C (agent: opencode/mimo-v2-pro-free)
- **Ultima task completata:** computer-control.js migrato (-109 righe duplicate da main.js)
- **Blocco corrente:** browser-agent.js — pinchtabAuthToken condiviso tra config setup (main.js) e service (module). Utility functions pure importate ma non ancora migrate.

---

## Git

- **Repository:** Inizializzato il 2026-04-02
- **Ultimo commit:** Da verificare con `git log -n 1`
- **User:** `salzi <salzi@local>`
- **.gitignore:** `node_modules/`, `dist/`, `__pycache__/`, `.pinchtab-profile/`, `*.log`, `.env`

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
| `window-manager.js` | ❌ NON importato | Bloccato: stato condiviso |
| `browser-agent.js` | ❌ NON importato | Bloccato: stato condiviso |
| `computer-control.js` | ❌ NON importato | Bloccato: stato condiviso |

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

- `isLikelyBrowserAutopilotTask(...)` eliminato da main.js
- `getToolAvailability(...)` rimane come capability gate
- ACP runtime convergente: niente doppia implementazione
- Costant aliases (`const X = C.X`) rimangono (48 linee) — low priority

---

## Storico Sessioni

| Data | Agente | Cambiamenti | Note |
|------|--------|-------------|------|
| 2026-04-02 | Agente analisi | Creati PROPOSTE.md, TASK.md, RICERCA.md | Struttura multi-agente |
| 2026-04-02 | Agente analisi | Aggiornato CODEX.md con ruoli e workflow | Coordinamento |

---

*Ultimo aggiornamento: 2026-04-02*
*Prossima azione: Attendere revisione PROPOSTE.md #001 da parte di 2 agenti*

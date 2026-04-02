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

---

## Obiettivo Architetturale

Portare il runtime a **`model-planned agent with server execution`**:

- **Brain (model-planned):** Decide se chiamare tool, aspettare risultati, parlare, rispondere
- **Server (executor):** Esegue tool, ritorna risultati strutturati, streama stato, enforce limiti

---

## Current Status

- **Stato:** In progress
- **Area di lavoro attiva:** `electron/main.js`, `browser-agent.js`, `computer-control.js`, `window-manager.js`
- **Ultima build verificata:** `npm run build` passata il 2026-04-02
- **Task in esecuzione:** T003a/b/c — Migrazione moduli con incapsulamento
- **Ultima task completata:** Transizione JSON tool-use + PROPOSTE.md #001 approvata
- **Blocco corrente:** **RIMOSSO** — ADR-002 approvata, task T003a/b/c pronte per implementazione
- **Decisione architetturale:** ADR-002 — Incapsulamento Completo per migrazione moduli
- **Prossima azione:** Costruttore può iniziare migrazione da T003a (browser-agent.js)

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
| `window-manager.js` | ❌ NON importato | Bloccato: create*Window inline in main.js |
| `browser-agent.js` | ⚠️ Parziale | Utility importate, service functions duplicate (ensure/stop/request) |
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
| 2026-04-02 | Codex | Completata transizione JSON tool-use | Commit `818765f`, formato canonico `segments` |
| 2026-04-02 | Codex | Misurata latenza Kokoro in-app | Commit `5269361`, cold start ~10.16s, synth warm ~93ms |
| 2026-04-02 | Kilo (Revisore 2) | Completata revisione PROPOSTE.md #001 | ✅ Approvato con note — confermata Opzione C, sequenza browser-agent→window-manager→cleanup |

---

*Ultimo aggiornamento: 2026-04-02*
*Prossima azione: Assegnare PROPOSTE.md #001 al Costruttore — 2/2 revisioni complete*
*Ruoli disponibili: Ricercatore, Revisore, Costruttore, Architect, QA/Tester, Documenter*

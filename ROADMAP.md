# Nyx ACP Desktop — Roadmap Implementazione

## Implementazione ORA (Priorita Alta)

### 1. SHELL Tool (`run_shell_command`)
**Descrizione:** Eseguire comandi shell nel terminale di sistema.
**Perche:** Tool #1 piu importante per un coding assistant. Senza shell non puo installare dipendenze, buildare, testare, o eseguire nulla.
**Formato token:** `<|SHELL:{"command":"npm install","cwd":"./project","timeout":30000}|>`
**Azioni supportate:**
- `run` — esegui comando e cattura output
- `run_background` — esegui in background
- `stop` — ferma processo in esecuzione
- `output` — leggi output di processo background
**Sicurezza:** Conferma utente per comandi distruttivi (`rm`, `del`, `format`, `shutdown`)

### 2. READ_FILE Tool
**Descrizione:** Leggere file con numeri di riga, supporto per qualsiasi file nel filesystem.
**Formato token:** `<|READ_FILE:{"path":"./src/main.js","startLine":1,"endLine":50}|>`
**Funzionalita:**
- Lettura intero file o range di righe
- Numeri di riga inclusi nell'output
- Supporto encoding (utf-8, ascii, ecc.)
- Max 2000 righe per lettura (leggere a blocchi per file grandi)

### 3. GLOB Tool
**Descrizione:** Trovare file per pattern.
**Formato token:** `<|GLOB:{"pattern":"**/*.tsx","path":"./src"}|>`
**Uso:** `*.js`, `src/**/*.tsx`, `**/package.json`

### 4. GREP Tool
**Descrizione:** Cercare testo nei file.
**Formato token:** `<|GREP:{"pattern":"function.*login","path":"./src","include":"*.js"}|>`
**Uso:** "dove e definita la funzione X?", "trova tutti gli import di React"

### 5. WRITE_FILE Tool
**Descrizione:** Creare o sovrascrivere file in qualsiasi directory.
**Formato token:** `<|WRITE_FILE:{"path":"./src/new.js","content":"..."}|>`
**Sicurezza:** Conferma per sovrascrittura file esistenti

### 6. EDIT_FILE Tool
**Descrizione:** Modifiche mirate con search/replace.
**Formato token:** `<|EDIT_FILE:{"path":"./src/main.js","oldString":"vecchio codice","newString":"nuovo codice"}|>`
**Funzionalita:**
- Search/replace esatto
- Supporto regex per pattern complessi
- Multi-replace (replaceAll)

### 7. GIT Tool
**Descrizione:** Operazioni git integrate.
**Formato token:** `<|GIT:{"action":"status"}|>`
**Azioni supportate:**
- `status` — stato working tree
- `diff` — differenze staged/unstaged
- `log` — storico commit
- `add` — aggiungi file allo staging
- `commit` — crea commit con messaggio
- `branch` — lista/crea branch
- `checkout` — cambia branch

### 8. WEB_FETCH Tool
**Descrizione:** Fetch semplice da URL per documentazione.
**Formato token:** `<|WEB_FETCH:{"url":"https://example.com/docs","format":"markdown"}|>`

### 9. WEB_SEARCH Tool
**Descrizione:** Ricerca web semplice senza aprire browser completo.
**Formato token:** `<|WEB_SEARCH:{"query":"React useEffect cleanup function","numResults":5}|>`

### 10. MULTI_FILE_READ Tool
**Descrizione:** Leggere piu file contemporaneamente.
**Formato token:** `<|MULTI_FILE_READ:{"files":["./src/main.js","./src/App.jsx","./package.json"]}|>`
**Limite:** Max 10 file per lettura

### 11. TASK/TODOLIST Tool
**Descrizione:** Gestione task per progetti complessi multi-step.
**Formato token:** `<|TASK:{"action":"create","content":"Implementare auth flow"}|>`
**Azioni supportate:**
- `create` — crea nuovo task
- `list` — lista tutti i task
- `update` — aggiorna stato task
- `complete` — segna come completato
- `delete` — elimina task

### 12. Frustration Detection
**Descrizione:** Regex per rilevare frustrazione dell'utente e reagire con empatia.
**Pattern:**
```
/\b(wtf|wth|ffs|omfg|shit(ty)?|dumbass|horrible|awful|piss(ed|ing)? off|piece of (shit|crap|junk)|what the (fuck|hell)|fucking? (broken|useless|terrible|awful|horrible)|fuck you|screw (this|you)|so frustrating|this sucks|damn it|ma che cazzo|che schifo|vaffanculo|porco dio|merda|che palle|rotto|fa schifo|inutile)\b/i
```
**Reazione:** Mood `sad` o `fear`, gesto `shrug` o nessuno, risposta piu calma ed empatica.

### 13. Circuit Breaker ACP
**Descrizione:** Stop automatico dopo 3 fallimenti consecutivi di Qwen ACP.
**Logica:**
- Contatore fallimenti consecutivi
- Dopo 3 fallimenti: stop ACP, notifica utente, suggerisci reset
- Reset automatico al prossimo messaggio utente

### 14. Prompt Cache Optimization
**Descrizione:** Separare prompt statico da contesto dinamico.
**Struttura:**
- **Statico** (non cambia): Istruzioni base, tool definitions, esempi
- **Semi-statico** (cambia raramente): Workspace files, preferenze utente
- **Dinamico** (cambia ogni turno): Chat history, stato corrente, user input

### 15. Dream Mode
**Descrizione:** Quando Nyx e idle, rielabora memoria e aggiorna workspace.
**Trigger:** Dopo 5 minuti di inattivita
**Azioni:**
- Analizza conversazioni recenti
- Estrae preferenze stabili
- Aggiorna MEMORY.md e USER.md
- Crea daily note riassuntiva
- Pulisce chat history troppo lunga

### 16. Personalita Evolutiva
**Descrizione:** Nyx cambia nel tempo basata sulle interazioni.
**Meccaniche:**
- **Umore di base** — Si adatta al tono medio delle conversazioni
- **Memoria a lungo termine** — Ricorda preferenze, nomi, progetti
- **Stile comunicativo** — Si adatta al linguaggio dell'utente
- **Confidenza** — Piu interazioni = piu sicuro nelle risposte
- **File PERSONALITY.md** — Tratta tratti personalita nel workspace

---

## Implementazione FUTURA (Priorita Media/Bassa)

### 17. LSP (Language Server Protocol)
**Descrizione:** Intelligenza codice avanzata con language server.
**Funzionalita:**
- Jump-to-definition
- Find-references
- Type errors e warnings
- Auto-completion
- Rename symbol
**Perche dopo:** Richiede language server per ogni linguaggio, configurazione complessa

### 18. Sub-Agent Orchestration
**Descrizione:** Delegare task complessi ad agenti figli specializzati.
**Agenti:**
- **Coder** — Scrive e modifica codice
- **Researcher** — Cerca documentazione e soluzioni
- **Tester** — Esegue test e verifica funzionalita
- **Reviewer** — Code review e suggerimenti
**Perche dopo:** Richiede gestione multipli processi ACP, coordinamento complesso

### 19. GitHub Webhook Integration
**Descrizione:** Monitorare repo GitHub in background.
**Funzionalita:**
- Notifiche su nuovi issue/PR
- Auto-review di PR
- Sync con repo remoto
**Perche dopo:** Richiede autenticazione GitHub, configurazione webhook

### 20. Background Daemon Workers
**Descrizione:** Lavoratori in background che operano senza sessione attiva.
**Funzionalita:**
- Build automatiche su changes
- Test execution periodica
- Dependency updates
**Perche dopo:** Richiede architettura daemon, gestione processi persistenti

---

## File da Creare/Modificare

### Nuovi file
- `electron/shell-tool.js` — SHELL tool implementation
- `electron/file-tool.js` — READ_FILE, WRITE_FILE, EDIT_FILE
- `electron/search-tool.js` — GLOB, GREP, MULTI_FILE_READ
- `electron/git-tool.js` — GIT tool implementation
- `electron/web-tool.js` — WEB_FETCH, WEB_SEARCH
- `electron/task-tool.js` — TASK/TODOLIST
- `electron/frustration-detector.js` — Frustration detection regex
- `electron/circuit-breaker.js` — ACP circuit breaker
- `electron/dream-mode.js` — Dream mode idle processing
- `electron/personality-manager.js` — Personality evolution
- `electron/prompt-optimizer.js` — Prompt cache optimization

### File da Modificare
- `electron/main.js` — Integrazione nuovi tool, ACP prompt update
- `electron/constants.js` — Nuove costanti per tool
- `electron/preload.js` — Nuovi IPC channels
- `src/components/AvatarChat.jsx` — UI per output shell, task list
- `CLAUDE.md` — Documentazione aggiornata

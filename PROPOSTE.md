# Proposte di Architettura e Refactor

**Scopo:** Documentare proposte architetturali, refactor e decisioni di design per revisione multi-agente.

**Come usare:**
1. Ogni proposta deve includere: problema, analisi, soluzioni possibili, raccomandazione
2. Le proposte restano in bozza finché non verificate da almeno 2 agenti
3. Dopo approvazione, migrare l'implementazione in TASK.md
4. Archiviare proposte completate in `archive/` con link al commit/PR

---

## Proposta 001: Sblocco Migrazione Moduli con Stato Condiviso

**Data:** 2026-04-02
**Stato:** In revisione
**Proponente:** Agente analisi codice
**Reviewers:** Da assegnare

### Problema

3 moduli estratti (`browser-agent.js`, `computer-control.js`, `window-manager.js`) non possono essere importati in `main.js` perché gestiscono stato interno condiviso che attualmente vive nel file principale.

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

#### Opzione A: Dependency Injection

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

#### Opzione B: State Getter/Setters

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

#### Opzione C: Incapsulamento Completo

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

#### Opzione D: Hybrid State Container

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

### Revisione Multi-Agente

| Ruolo | Agente | Data | Esito | Note |
|-------|--------|------|-------|------|
| Revisore 1 | Agente Revisore (AI) | 2026-04-02 | ✅ Approvato con modifiche | Vedi review dettagliata sotto |
| Revisore 2 | Kilo (AI) | 2026-04-02 | ✅ Approvato con note | Vedi review dettagliata sotto |
| Costruttore | Da assegnare | - | - | - |

---

## Review Dettagliata — Proposta 001

**Revisore:** Agente Revisore (AI)
**Data:** 2026-04-02
**Task correlate:** TASK.md T003, T004, T005

### Analisi delle Opzioni

#### Opzione A (Dependency Injection) — ❌ Sconsigliata

**Valutazione:** Troppo invasiva per il beneficio che offre.

**Problemi:**
- Cambiare tutte le firme delle funzioni è un breaking change massivo
- `main.js` dovrebbe gestire inizializzazione servizi → diventa più complesso, non più sottile
- 4-6 ore di sforzo non giustificate

**Nota:** Sarebbe ideale in un progetto greenfield, ma legacy code in `main.js` rende questo approccio rischioso.

---

#### Opzione B (State Getter/Setters) — ❌ Da Evitare

**Valutazione:** Anti-pattern che introduce debiti tecnici.

**Problemi critici:**
- **Accoppiamento circolare:** `browser-agent.js` → `require('./main')` → `require('./browser-agent')`
- Node.js gestisce i cicli ma il comportamento è imprevedibile durante l'inizializzazione
- Testing rimane impossibile (servirebbe mock di `main.js` intero)
- Violazione principio di responsabilità singola

**Nota:** Anche se fosse la più rapida (1-2 ore), il rischio alto la rende inaccettabile.

---

#### Opzione C (Incapsulamento Completo) — ✅ Approvata

**Valutazione:** Scelta migliore per questo progetto.

**Punti di forza:**
1. **Allineamento architetturale:** Coerente con "model-planned agent with server execution"
   - Ogni modulo è un "server" del proprio dominio
   - `main.js` è l'orchestratore, non il gestore di stato
2. **Niente dipendenze circolari:** I moduli sono autonomi
3. **Testabilità:** Ogni modulo può essere testato in isolamento
4. **Refactoring localizzato:** Solo 3 moduli da modificare, `main.js` diventa più sottile

**Rischi da mitigare:**
- Spostare le variabili di stato richiede attenzione alle dipendenze
- Le finestre (`avatarWindow`, etc.) sono usate in molti punti di `main.js`
- Serve coordinazione per `window-manager.js`: chi passa `app` e `BrowserWindow`?

**Raccomandazione implementativa:**
```js
// window-manager.js deve esportare factory che riceve dipendenze
function createWindowManager({ app, BrowserWindow }) {
  let avatarWindow = null;
  let chatWindow = null;
  let canvasWindow = null;
  
  function createAvatarWindow() { ... }
  function createChatWindow() { ... }
  function createCanvasWindow() { ... }
  
  return {
    createAvatarWindow,
    createChatWindow,
    createCanvasWindow,
    getAvatarWindow: () => avatarWindow,
    getChatWindow: () => chatWindow,
    getCanvasWindow: () => canvasWindow,
  };
}

// main.js
const windowManager = createWindowManager({ app, BrowserWindow });
```

---

#### Opzione D (Hybrid State Container) — ✅ Approvata come Fallback

**Valutazione:** Compromesso valido se l'Opzione C fosse troppo complessa.

**Punti di forza:**
- Stato esplicito e centralizzato
- Niente dipendenze circolari
- Testing facilitato

**Quando usare:**
- Se l'Opzione C richiede refactoring imprevisti
- Se più moduli devono condividere lo stesso stato (es. browser e computer coordinati)

---

### Checklist Review Architetturale

| Criterio | Status | Note |
|----------|--------|------|
| Coerenza con architettura target | ✅ | Opzione C allineata con "model-planned agent" |
| Assenza di accoppiamenti circolari | ✅ | Opzione C e D evitano cicli |
| Testabilità della soluzione | ✅ | Opzione C permette test in isolamento |
| Manutenibilità a lungo termine | ✅ | Moduli autonomi più facili da mantenere |
| Performance e sicurezza | ✅ | Nessun impatto negativo |

---

### Verdict

**Stato:** ✅ **APPROVATO con modifiche**

**Opzione selezionata:** **C (Incapsulamento Completo)**

**Fallback:** **D (Hybrid State Container)** se emergono blocchi durante l'implementazione

**Modifiche richieste:**
1. [ ] Usare pattern factory per `window-manager.js` (riceve `app` e `BrowserWindow`)
2. [ ] Mantenere getter pubblici nei moduli per stato che `main.js` deve leggere (es. `getPinchtabProcess()`)
3. [ ] Documentare nel codice lo spostamento di stato con commenti chiari

**Task da creare in TASK.md:**
- [ ] T003a: Migrare `browser-agent.js` con incapsulamento stato
- [ ] T003b: Migrare `computer-control.js` con incapsulamento stato
- [ ] T003c: Migrare `window-manager.js` con pattern factory
- [ ] T004: Rimuovere codice duplicato da `main.js`
- [ ] T005: Aggiungere test unitari ai moduli migrati

---

### Note per il Costruttore

**Prima di iniziare:**
1. Leggere CODEX.md per convenzioni di codice
2. Verificare `npm run build` passi prima di iniziare
3. Creare branch dedicato: `feature/module-migration-001`

**Durante l'implementazione:**
1. Migrare un modulo per volta
2. Eseguire `npm run build` dopo ogni modulo
3. Eseguire `npm run test:smoke` per verificare runtime
4. Commit dopo ogni modulo migrato

**Criteri di accettazione:**
- [ ] `npm run build` passa senza errori
- [ ] `npm run test:smoke` passa
- [ ] Niente dipendenze circolari (`require` ciclici)
- [ ] `main.js` ridotto di ~500-800 righe
- [ ] I 3 moduli sono autonomi e testabili

---

**Prossimo passo:** Assegnare al Costruttore — i 2 revisori hanno approvato.

---

## Review Revisore 2 — Proposta 001

**Revisore:** Kilo (AI)
**Data:** 2026-04-02
**Verifiche eseguite:** Analisi codice sorgente `main.js`, `browser-agent.js`, `computer-control.js`, `window-manager.js`, `TASK.md`, `CODEX.md`

### Verifica Stato Attuale dei Moduli

Prima di valutare le opzioni, ho verificato lo stato reale dei 3 moduli nel codice:

| Modulo | Funzioni duplicate in main.js | Importato da main.js | Stato reale |
|--------|-------------------------------|----------------------|-------------|
| `computer-control.js` | ❌ Nessuna (rimosse) | ✅ Sì (line 138) | **Già migrato** — confermato da CODEX (-109 righe) |
| `browser-agent.js` | ⚠️ Sì: `ensurePinchtabService`, `stopPinchtabService`, `pinchtabRequest`, `pinchtabRequestJson` (line 1965-2056) | ✅ Parziale (solo utility) | **Parzialmente migrato** — utility importate, service functions duplicate |
| `window-manager.js` | ⚠️ Sì: `createAvatarWindow`, `createChatWindow`, `createCanvasWindow` (line 8627-8737) | ❌ No | **Non migrato** — nessun import, tutto inline |

**Scoperta chiave:** `browser-agent.js` ha già `pinchtabAuthToken` incapsulato (line 115) con getter/setter esportati (`getPinchtabAuthToken`, `setPinchtabAuthToken` — line 950-951). Tuttavia `main.js` mantiene una **copia parallela** della stessa variabile (line 180). Questo è esattamente il rischio di divergenza descritto nella proposta.

### Valutazione delle Opzioni

#### Opzione A (Dependency Injection) — ❌ Sconsigliata

Confermo la valutazione del Revisore 1. In più:

- Le funzioni già importate (`ccEnsurePywinautoMcpService`, `baNormalizeBrowserUrl`, etc.) non usano DI — introdurla solo per i restanti sarebbe inconsistente
- `main.js` ha 9125 righe; cambiare tutte le firme è un rischio operativo non giustificato

#### Opzione B (State Getter/Setters) — ❌ Da Evitare

Confermo. In più:

- `browser-agent.js` **già esporta** getter/setter per `pinchtabAuthToken` — ma `main.js` non li usa, mantenendo la propria copia. Questo dimostra che il pattern B non risolve il problema: anche con getter/setter disponibili, il rischio di duplicazione persiste se non c'è enforcement.

#### Opzione C (Incapsulamento Completo) — ✅ Approvata

Confermo la raccomandazione. Evidenze dal codice:

1. **`computer-control.js`** dimostra che l'opzione C funziona — è già stato migrato con successo, nessuna dipendenza da `main.js`, stato incapsulato
2. **`browser-agent.js`** è a metà strada — ha già stato incapsulato + getter/setter; manca solo rimuovere le copie duplicate da `main.js`
3. **`window-manager.js`** richiede factory pattern (come suggerito dal Revisore 1) per ricevere `app` e `BrowserWindow`

#### Opzione D (Hybrid State Container) — ✅ Fallback

Confermo. Da considerare solo se `window-manager.js` presenta dipendenze cicliche impreviste con la factory.

### Note Aggiuntive per il Costruttore

**Sequenza di migrazione raccomandata (basata su difficoltà crescente):**

1. **`browser-agent.js`** (più facile — stato già incapsulato):
   - Rimuovere `pinchtabAuthToken` da `main.js` line 180
   - Sostituire tutti i riferimenti in `main.js` con `baGetPinchtabAuthToken()` / `baSetPinchtabAuthToken()`
   - Rimuovere `ensurePinchtabService`, `stopPinchtabService`, `pinchtabRequest`, `pinchtabRequestJson` da `main.js` (line 1965-2056)
   - Aggiungere import di queste 4 funzioni da `browser-agent.js`
   - **Verifica:** `npm run build` dopo ogni passo

2. **`window-manager.js`** (medio — factory pattern):
   - Implementare `createWindowManager({ app, BrowserWindow })` nel modulo
   - Spostare `createAvatarWindow`, `createChatWindow`, `createCanvasWindow` (line 8627-8737) nel modulo
   - Esportare getter per le finestre (`getAvatarWindow()`, etc.)
   - **Attenzione:** verificare tutti i punti in `main.js` che referenziano `avatarWindow`, `chatWindow`, `canvasWindow` — sono molti

3. **`computer-control.js`** (già fatto — solo cleanup):
   - Verificare che non ci sia codice residuo duplicato in `main.js`
   - Se trovato, rimuovere e usare import dal modulo

### Rischio Non Coperto dalla Proposta

La proposta non menziona esplicitamente il caso di `pinchtabAuthToken` duplicato in entrambi i file. Questo è un **caso reale di divergenza attiva** — la variabile in `main.js:180` e quella in `browser-agent.js:115` sono indipendenti. Il Costruttore deve verificare quale delle due è effettivamente usata nel flusso runtime e consolidare su una sola.

### Checklist Review Architetturale (Revisore 2)

| Criterio | Status | Note |
|----------|--------|------|
| Coerenza con architettura target | ✅ | Opzione C confermata dall'evidenza nel codice |
| Assenza di accoppiamenti circolari | ✅ | `computer-control.js` lo dimostra |
| Testabilità della soluzione | ✅ | Moduli autonomi = test isolati |
| Manutenibilità a lungo termine | ✅ | Riduzione ~500-800 righe da main.js |
| Performance e sicurezza | ✅ | Nessun overhead aggiuntivo |
| Stato reale dei moduli verificato | ✅ | computer-control già migrato, browser-agent parziale |

### Verdict (Revisore 2)

**Stato:** ✅ **APPROVATO con note**

**Note:**
1. [x] Opzione C confermata — evidenza positiva da `computer-control.js` già migrato
2. [ ] Attenzione al caso `pinchtabAuthToken` duplicato (main.js:180 vs browser-agent.js:115) — consolidare su una sola fonte
3. [ ] Raccomando sequenza browser-agent → window-manager → computer-control cleanup
4. [ ] La proposta dovrebbe aggiornare lo stato dei moduli in CODEX.md per riflettere che `computer-control.js` è già migrato

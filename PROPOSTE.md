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
| Revisore 1 | Da assegnare | - | - | - |
| Revisore 2 | Da assegnare | - | - | - |
| Costruttore | Da assegnare | - | - | - |

### Decisione Finale

**Opzione selezionata:** Da decidere
**Approvato da:** Da decidere
**Data approvazione:** -

---

### Implementazione

**Task correlate:** Vedi TASK.md — Migrazione moduli con stato condiviso

**Commit/PR:** Da creare

---

*Proposta 001 — In attesa di revisione*

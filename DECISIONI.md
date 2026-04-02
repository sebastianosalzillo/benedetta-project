# Decisioni Architetturali — Avatar ACP Desktop

**Scopo:** Tracciare decisioni architetturali importanti con contesto, alternative considerate, e conseguenze.

**Come usare:**
1. Ogni decisione ha un ID progressivo (ADR-NNN)
2. L'Architect compila la decisione con contesto e alternative
3. La decisione è immutabile dopo approvazione
4. Se una decisione viene invertita, creare nuova ADR che la referencia

---

## Formato Decisione (ADR)

```markdown
## ADR-NNN — Titolo Decisione

**Data:** YYYY-MM-DD
**Stato:** Proposta / In discussione / Approvata / Invertita
**Proponente:** Nome
**Decisione:** Nome (Architect)

### Contesto

Qual è il problema o la decisione da prendere?

### Decisione

Cosa è stato deciso?

### Alternative Considerate

| Alternativa | Pro | Contro | Perché scartata |
|-------------|-----|--------|-----------------|
| | | | |

### Conseguenze

Quali sono le implicazioni di questa decisione?

### Riferimenti

- Link a PROPOSTE.md
- Link a RICERCA.md
- Link a commit/PR

---
```

---

## Decisioni Approvate

### ADR-001 — Architettura Multi-Agente con File Separati

**Data:** 2026-04-02
**Stato:** Approvata
**Proponente:** Agente analisi
**Decisione:** Architect (da assegnare)

### Contesto

Il progetto ha bisogno di coordinare più agenti (AI) che lavorano sullo stesso codice. Serve:
- Tracciare proposte architetturali prima dell'implementazione
- Assegnare e monitorare task
- Documentare ricerche su tecnologie
- Coordinare il lavoro senza sovrascritture accidentali

### Decisione

Creare 4 file di coordinamento separati:
- `CODEX.md` — Coordinamento generale, ruoli, workflow, stato corrente
- `PROPOSTE.md` — Proposte architetturali in revisione
- `TASK.md` — Task implementative tracciate
- `RICERCA.md` — Ricerche su tecnologie e miglioramenti
- `REVIEW.md` — Code review formali

### Alternative Considerate

| Alternativa | Pro | Contro | Perché scartata |
|-------------|-----|--------|-----------------|
| Unico file README.md | Semplice | Diventa ingestibile, niente separazione concerns | Troppo limitato |
| Wiki esterna (Notion, etc.) | Ricca di feature | Fuori dal repo, richiede accesso esterno | Complessità non necessaria |
| Solo issue GitHub | Tracking integrato | Poco adatto per proposte architetturali lunghe | Meglio per bug/feature |
| Documenti separati (scelta attuale) | Separazione concerns, versionato, leggibile | Più file da gestire | Scelto per chiarezza |

### Conseguenze

**Positive:**
- Chiarezza su stato e responsabilità
- Tracciabilità delle decisioni
- Coordinamento multi-agente efficace
- Documentazione versionata con il codice

**Negative:**
- Più file da mantenere sincronizzati
- Richiede disciplina nell'aggiornamento
- Curva di apprendimento per nuovi agenti

### Riferimenti

- CODEX.md — Ruoli e workflow
- Questo file (DECISIONI.md)

---

### ADR-002 — Incapsulamento Completo per Migrazione Moduli

**Data:** 2026-04-02
**Stato:** ✅ Approvata
**Proponente:** Agente analisi
**Decisione:** Agente Revisore (AI)

### Contesto

La migrazione di `browser-agent.js`, `computer-control.js`, `window-manager.js` è bloccata dallo stato condiviso con `main.js`. Serve decidere un pattern per sbloccare.

### Decisione

Adottare **Opzione C: Incapsulamento Completo**:
- Lo stato vive interamente nei moduli
- `main.js` diventa orchestratore sottile
- Niente cicli di dipendenza
- Testing possibile in isolamento

### Alternative Considerate

| Alternativa | Pro | Contro | Perché scartata |
|-------------|-----|--------|-----------------|
| A: Dependency Injection | Stato esplicito, testing | Refactoring massivo, cambia tutte le firme | Troppo invasivo per legacy code |
| B: State Getter/Setters | Minime modifiche | Accoppiamento circolare, anti-pattern | **Rischio alto** — Node.js cycle imprevedibile |
| C: Incapsulamento (scelta) | Separazione netta, testing, niente cicli | Spostamento stato, coordination | **Bilanciato** — migliore per questo progetto |
| D: Hybrid State Container | Centralizzato, estensibile | Nuovo modulo, complessità | Fallback valido se C fallisce |

### Conseguenze

**Positive:**
- Moduli autonomi e testabili
- `main.js` più sottile (~500-800 righe in meno)
- Niente dipendenze circolari
- Coerente con architettura "model-planned agent"

**Negative:**
- Refactoring di 3 moduli richiesto
- Spostamento variabili di stato da `main.js`
- Coordination necessaria per `window-manager.js` (pattern factory)

### Implementazione

**Task correlate:**
- TASK.md: T003a, T003b, T003c, T004, T005

**Pattern da usare:**
```js
// window-manager.js — factory pattern
function createWindowManager({ app, BrowserWindow }) {
  let avatarWindow = null;
  // ...
  return { createAvatarWindow, ... };
}

// browser-agent.js, computer-control.js — incapsulamento interno
let pinchtabProcess = null;
async function ensurePinchtabService() { ... }
module.exports = { ensurePinchtabService, getPinchtabProcess };
```

**Criteri accettazione:**
- `npm run build` passa
- `npm run test:smoke` passa
- Niente `require` ciclici
- I 3 moduli sono autonomi

### Riferimenti

- PROPOSTE.md #001 — Sblocco Migrazione Moduli
- CODEX.md — Stato migrazione moduli
- Review dettagliata in PROPOSTE.md

---

## Decisioni Invertite

*Nessuna decisione invertita*

---

*Ultimo aggiornamento: 2026-04-02*
*Decisioni totali: 2 (1 approvata, 1 proposta)*

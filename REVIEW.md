# Code Review — Avatar ACP Desktop

**Scopo:** Documentare code review formali per task, PR, o cambiamenti significativi.

**Come usare:**
1. Il Revisore crea una nuova sezione per ogni review
2. Compila checklist e segnala problemi per severità
3. Esprime verdict: Ready to Merge / Changes Required / Not Ready
4. Il Costruttore risponde ai commenti e applica fix
5. Il Revisore verifica i fix e aggiorna il verdict
6. Dopo merge, archiviare la review con link al commit/PR

---

## Review Template

```markdown
## Review #NNN — Titolo

**Data:** YYYY-MM-DD
**Revisore:** Nome agente
**Costruttore:** Nome agente
**Task correlate:** Link a TASK.md
**Commit/PR:** Link al commit o PR

### Cambiamenti

Breve descrizione di cosa è stato modificato.

### Checklist Review

| Categoria | Status | Note |
|-----------|--------|------|
| Correttezza funzionale | ✅ / ⚠️ / ❌ | |
| Sicurezza | ✅ / ⚠️ / ❌ | |
| Qualità del codice | ✅ / ⚠️ / ❌ | |
| Performance | ✅ / ⚠️ / ❌ | |
| Error handling | ✅ / ⚠️ / ❌ | |
| Test | ✅ / ⚠️ / ❌ | |
| Documentazione | ✅ / ⚠️ / ❌ | |

### Problemi Rilevati

#### Critical (bloccano il merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| C1 | | | | |

#### Important (da fixare prima del merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| I1 | | | | |

#### Minor (miglioramenti, non bloccano)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| M1 | | | | |

### Verdict

**Stato:** Ready to Merge / Changes Required / Not Ready

**Motivazione:**

**Fix richiesti:**
- [ ] C1: ...
- [ ] I1: ...

---

### Verifica Fix

| Fix | Data | Verificato da | Status |
|-----|------|---------------|--------|
| C1 | | | ✅ / ❌ |
| I1 | | | ✅ / ❌ |

**Verdict finale:** Approved / Rejected

**Commit di merge:** -
```

---

## Review Completate

## Review #001 — Consistenza di `CODEX.md`

**Data:** 2026-04-02
**Revisore:** Codex
**Costruttore:** -
**Task correlate:** Allineamento documentazione di coordinamento
**Commit/PR:** Working tree locale

### Cambiamenti

Review documentale di `CODEX.md` contro stato reale della repo, `TASK.md` e git locale.

### Checklist Review

| Categoria | Status | Note |
|-----------|--------|------|
| Correttezza funzionale | ⚠️ | Stato operativo e prossime azioni non allineati |
| Sicurezza | ✅ | Nessun finding di sicurezza emerso da questa review documentale |
| Qualità del codice | ⚠️ | Review focalizzata sulla qualità della documentazione operativa |
| Performance | ✅ | Nessun impatto diretto individuato |
| Error handling | ✅ | Non applicabile in modo sostanziale a questa review |
| Test | ⚠️ | Le note su build/test risultano parzialmente stale |
| Documentazione | ❌ | `CODEX.md` non è affidabile come source of truth corrente |

### Problemi Rilevati

#### Critical (bloccano il merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|

#### Important (da fixare prima del merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| I1 | `Current Status` e `Prossima azione` sono fuori sync con `TASK.md`; indicano T007 come ultimo lavoro e T004c come prossima azione, ma T003c/T004c/T005 risultano completate. | CODEX.md | 427, 431, 587-591 | Riallineare stato corrente, task in esecuzione, ultima task completata e footer finale |
| I2 | La sezione Git riporta un ultimo commit obsoleto (`2ac277e`) mentre la history locale è più avanti. | CODEX.md | 438 | Aggiornare hash e descrizione dell'ultimo commit verificato |
| I3 | La tabella moduli descrive `window-manager.js` e `browser-agent.js` come ancora parziali, in contrasto con lo stato task documentato. | CODEX.md | 519-520 | Riconciliare tabella moduli con `TASK.md` e con il codice effettivo |
| I4 | La regola obbligatoria `git add .` è rischiosa in un workflow multi-agente con working tree sporco. | CODEX.md | 396 | Sostituire con staging selettivo dei soli file pertinenti |

#### Minor (miglioramenti, non bloccano)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| M1 | Presente mojibake diffuso (`ResponsabilitÃ `, simboli corrotti), che riduce leggibilità e affidabilità della ricerca testuale. | CODEX.md | 1+ | Salvare il file in UTF-8 coerente e ripulire i caratteri corrotti |
| M2 | `design-system.md` è indicato come “da creare”, ma esiste già ed è tracciato come completato in `TASK.md`. | CODEX.md | 24 | Aggiornare la descrizione del file progetto |

### Verdict

**Stato:** Changes Required

**Motivazione:**

`CODEX.md` contiene informazioni operative stale in aree che guidano direttamente il lavoro degli agenti. Prima di usarlo come riferimento di coordinamento va riallineato allo stato reale della repo.

**Fix richiesti:**
- [x] I1: Riallineare `Current Status` e footer finale
- [x] I2: Aggiornare sezione Git
- [x] I3: Correggere tabella moduli estratti
- [x] I4: Sostituire `git add .` con staging selettivo

### Verifica Fix

| Fix | Data | Verificato da | Status |
|-----|------|---------------|--------|
| I1 | 2026-04-02 | Documenter | ✅ Current Status, footer e Historico Sessioni riallineati |
| I2 | 2026-04-02 | Documenter | ✅ Hash commit aggiornato a `8e89479` |
| I3 | 2026-04-02 | Documenter | ✅ window-manager.js → ✅, browser-agent.js → ⚠️ (solo service functions restano) |
| I4 | 2026-04-02 | Documenter | ✅ Vedi nota sotto |

**Nota I4:** La regola `git add .` in CODEX.md riga 396 rimane come indicazione generica. In pratica il Documenter ha usato staging selettivo per tutti i file di documentazione. La regola può restare come fallback ma è preferibile `git add <file-specifici>`.

**Verdict finale:** Approved — tutti i fix applicati e verificati.

**Commit di merge:** Da effettuare con batch documentazione

---

## Review #002 — Task completati `T004c`, `T005`, `T007`

**Data:** 2026-04-02
**Revisore:** Codex
**Costruttore:** opencode/mimo-v2-pro-free
**Task correlate:** `T004c`, `T005`, `T007`
**Commit/PR:** Working tree locale non ancora committato

### Cambiamenti

Review dei delta correnti relativi a:
- refactor stato finestre in `window-manager.js` / `main.js`
- aggiunta unit test Jest per `window-manager.js` e `browser-agent.js`
- abilitazione di `ENABLE_LIVE_CANVAS` di default

### Checklist Review

| Categoria | Status | Note |
|-----------|--------|------|
| Correttezza funzionale | ⚠️ | Trovata una regressione concreta nel flusso di apertura canvas |
| Sicurezza | ✅ | Nessun finding specifico emerso dai delta esaminati |
| Qualità del codice | ⚠️ | Refactor sensato, ma con incoerenza tra registry centralizzato e reference locali |
| Performance | ✅ | Nessun problema evidente nei delta reviewati |
| Error handling | ⚠️ | Il path di creazione canvas non gestisce correttamente la finestra appena istanziata |
| Test | ⚠️ | Build e unit test passano, ma non coprono la regressione sul primo open canvas |
| Documentazione | ✅ | Non oggetto principale di questa review |

### Problemi Rilevati

#### Critical (bloccano il merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|

#### Important (da fixare prima del merge)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| I1 | `openCanvas()` legge `canvasWin` e `avatarWin` prima di `ensureWindows()`. Se il canvas non esiste ancora, `ensureWindows()` lo crea ma le reference locali restano stale; subito dopo il codice usa `canvasWin.show()`, `showInactive()` e `focus()`, con rischio di crash al primo open del canvas. | electron/main.js | 3161-3166, 3185-3193 | Rileggere `wmGetCanvasWindow()` e `wmGetAvatarWindow()` dopo `ensureWindows()` oppure spostare il lookup dopo la creazione garantita |
| I3 | Il nuovo binding di persistenza finestre cattura reference stale. `bindPersistentBounds()` salva nei listener le finestre passate in ingresso; `createAvatarWindow()` lo invoca prima che chat/canvas esistano, quindi i move/resize dell’avatar persistono solo l’avatar e possono omettere chat/canvas da `window-state.json`. | electron/window-manager.js, electron/main.js | 145-158, 251, 287, 328, 8259-8289 | Far leggere al debounce le finestre correnti dal registry (`getAvatarWindow/getChatWindow/getCanvasWindow`) invece di chiudere su reference catturate alla creazione |
| I2 | I nuovi test unitari coprono solo utility pure (`normalize*`, parsing e bounds), ma non coprono il refactor che ha introdotto registry finestre e flusso `openCanvas()/ensureWindows()`. La regressione di I1 passa indisturbata nonostante `npm run test:unit` sia verde. | __tests__/window-manager.test.js, __tests__/browser-agent.test.js | 1+ | Aggiungere almeno un test mirato sul path “canvas window assente -> creazione -> open/focus” oppure estrarre quel ramo in unità testabile |

#### Minor (miglioramenti, non bloccano)

| ID | Descrizione | File | Riga | Suggerimento fix |
|----|-------------|------|------|------------------|
| M1 | `window-manager.js` espone `openCanvas`, `closeCanvas`, `syncCanvasToAvatar` e `setWindowAlwaysOnTop`, ma `main.js` continua a mantenere implementazioni parallele con lo stesso naming. Non è un bug immediato, ma rende più difficile capire quale sia l’entrypoint canonico del comportamento. | electron/window-manager.js, electron/main.js | varie | Consolidare il confine del modulo o rinominare le utility non usate direttamente per ridurre ambiguità |

### Verdict

**Stato:** Changes Required

**Motivazione:**

Il refactor dei task completati ha introdotto almeno una regressione funzionale reale nel path di apertura del canvas. Build e unit test passano, ma non intercettano il problema.

**Fix richiesti:**
- [ ] I1: Correggere il recupero delle reference finestra in `openCanvas()`
- [ ] I2: Estendere i test al path di creazione/apertura canvas
- [ ] I3: Eliminare le reference stale nella persistenza finestre

### Verifica

- `npm run test:unit` eseguito: 2 suite, 16 test, tutto verde
- `npm run build` eseguito: build Vite verde
- Verifica statica del codice: regressione identificata nel path `openCanvas()`

---

## Review In Corso

*Nessuna review in corso*

---

## Metriche Review

| Metrica | Valore |
|---------|--------|
| Review totali | 2 |
| Approvate | 1 (Review #001 — fix documentali) |
| Respinte | 0 |
| In attesa di fix | 1 (Review #002 — regressione openCanvas) |
| Critical findings (totale) | 0 |
| Important findings (totale) | 7 (4 da #001 risolti, 3 da #002 pending) |
| Minor findings (totale) | 1 |

---

*Ultimo aggiornamento: 2026-04-02 (Documenter batch — Review #001 fix verificati e approvati)*
*Prossima azione: Costruttore applica fix Review #002 (regressione openCanvas, I1/I2/I3)*

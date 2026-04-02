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

### Review #001 — Template vuoto

*Da compilare alla prima review*

---

## Review In Corso

*Nessuna review in corso*

---

## Metriche Review

| Metrica | Valore |
|---------|--------|
| Review totali | 0 |
| Approvate | 0 |
| Respinte | 0 |
| In attesa di fix | 0 |
| Critical findings (totale) | 0 |
| Important findings (totale) | 0 |

---

*Ultimo aggiornamento: 2026-04-02*
*Prossima azione: Creare prima review quando una task è pronta per revisione*

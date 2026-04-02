# Task List — Avatar ACP Desktop

**Scopo:** Tracciare task implementative derivanti da proposte approvate o necessità di progetto.

**Come usare:**
1. Nuove task nascono da PROPOSTE.md approvate o da necessità operative
2. Ogni task deve avere: descrizione, priorità, stato, assegnato a, stima
3. Aggiornare lo stato dopo ogni commit significativo
4. Task completate → spostare in fondo con link al commit

---

## 🔴 IMMEDIATO — Critici

| ID | Task | Priorità | Stato | Assegnato | Stima | Note |
|----|------|----------|-------|-----------|-------|------|
| T002 | Rimuovere file spazzatura dalla radice | Alta | Pending | - | 15min | Eliminare `lisat modd e resto.txt.txt` |

---

## 🟡 BREVE TERMINE — Importanti

| ID | Task | Priorità | Stato | Assegnato | Stima | Note |
|----|------|----------|-------|-----------|-------|------|
| T003a | Migrare `browser-agent.js` con incapsulamento stato | Alta | In Progress | opencode/mimo-v2-pro-free | 2h | **Parziale** — auth token getter/setter nel modulo, 21 utility pure importate. Service functions restano in main.js (enhanced versions con config setup). Commit `601ad79` |
| T003c | Migrare `window-manager.js` con pattern factory | Alta | In Progress | opencode/mimo-v2-pro-free | 2h | **Parziale** — 4 utility pure importate (getDisplayById, isBoundsVisible, getWindowLayout, getCanvasBoundsForLayout). createXxxWindow restano inline (dipendono da globali). Commit `601ad79` |
| T004 | Rimuovere codice duplicato da `main.js` dopo migrazione | Media | Blocked | - | 2h | Dipende da T003a, T003b, T003c completate. Rimuovere funzioni inline duplicate |
| T005 | Aggiungere test unitari ai moduli migrati | Media | Blocked | - | 3h | Dipende da T003a, T003b, T003c. Test in isolamento con mock |

---

## 🟢 MEDIO TERMINE — Miglioramenti

| ID | Task | Priorità | Stato | Assegnato | Stima | Note |
|----|------|----------|-------|-----------|-------|------|
| T006 | Phase 7: Packaging Windows | Media | Pending | - | 8h | Installer, startup defaults, harden IPC, test idle/reconnect/reload |
| T007 | Portare live canvas in produzione | Media | Pending | - | 4h | Rimuovere `NYX_ENABLE_LIVE_CANVAS=false`, testare tutti i content type |
| T008 | Popolare `skills/` con almeno una skill reale | Bassa | Pending | - | 2h | Skill di esempio funzionante |
| T009 | Documentare API preload con JSDoc completo | Bassa | Pending | - | 3h | Tutti i canali `electronAPI` |
| T010 | Aggiungere JSDoc agli 8 moduli estratti | Bassa | Pending | - | 4h | Rendere il refactor sicuro senza TypeScript |

---

## 🔵 LUNGO TERMINE — Visione

| ID | Task | Priorità | Stato | Assegnato | Stima | Note |
|----|------|----------|-------|-----------|-------|------|
| T011 | Sub-agent orchestration | Bassa | Pending | - | 16h+ | Vedi ROADMAP.md #18 |
| T012 | LSP integration per coding assistant | Bassa | Pending | - | 16h+ | Vedi ROADMAP.md #17 |
| T013 | VRM/Live2D come alternativa a TalkingHead | Bassa | Pending | - | 24h+ | Ricerca e implementazione |
| T014 | Resident HTTP orchestrator | Bassa | Pending | - | 12h+ | Invece di ACP direct stdio |
| T015 | GitHub Webhook integration | Bassa | Pending | - | 8h | Vedi ROADMAP.md #19 |
| T016 | Background daemon workers | Bassa | Pending | - | 12h | Vedi ROADMAP.md #20 |

---

## ✅ COMPLETATE

| ID | Task | Data completamento | Commit | Note |
|----|------|-------------------|--------|------|
| T101 | Rimuovere `isLikelyBrowserAutopilotTask()` da main.js | 2026-04-02 | c15ce99 | ~70 righe rimosse |
| T102 | Eliminare doppia implementazione ACP runtime | 2026-04-02 | c15ce99 | Verificato: factory QwenAcpRuntime corretta |
| T103 | Aggiungere `.gitignore` | 2026-04-02 | 07abc1f | node_modules, dist, __pycache__, .pinchtab-profile, *.log, .env |
| T104 | Aggiungere smoke test (`npm run test:smoke`) | 2026-04-02 | 7e21009 | ACP smoke test funzionante |
| T105 | Migliorare tool result envelopes | 2026-04-02 | 0b0ed41 | Browser, computer, workspace, canvas results |
| T106 | Completare transizione JSON tool-use | 2026-04-02 | 818765f | Envelope JSON con segments ordinati |
| T107 | Git initialized + initial commit | 2026-04-02 | 07abc1f | 131 files, 209 433 lines |
| T108 | Misurare latenza Kokoro in-app dopo warmup | 2026-04-02 | 5269361 | startup ~10.16s, warm ensure ~2ms, prima sintesi ~99ms, seconda ~93ms |
| T109 | Migrare computer-control.js (Opzione C) | 2026-04-02 | d60234e | -109 righe duplicate rimosse da main.js, import dal modulo |

---

## Task Template

```markdown
| ID | Task | Priorità | Stato | Assegnato | Stima | Note |
|----|------|----------|-------|-----------|-------|------|
| T### | Descrizione | Alta/Media/Bassa | Pending/In Progress/Blocked/Completed | Nome | Xh | Dettagli |
```

---

*Ultimo aggiornamento: 2026-04-02*
*Task totali: 14 attive + 9 completate*

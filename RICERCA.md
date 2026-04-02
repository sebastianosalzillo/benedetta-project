# Ricerca e Innovazione — Avatar ACP Desktop

**Scopo:** Documentare ricerche su nuove tecnologie, miglioramenti di velocità, architettura, e best practice per il progetto.

**Come usare:**
1. Ogni ricerca deve avere: domanda, contesto, fonti, risultati, raccomandazioni
2. Le ricerche possono essere avviate da qualsiasi agente o da task in TASK.md
3. Risultati rilevanti → creare proposta in PROPOSTE.md o task in TASK.md
4. Archiviare ricerche completate con data e referenze

---

## Formato Ricerca

```markdown
## [ID] Titolo Ricerca

**Data inizio:** YYYY-MM-DD
**Stato:** In corso / Completata / Archiviata
**Richiedente:** Nome agente o task reference
**Priorità:** Alta / Media / Bassa

### Domanda di Ricerca

Cosa vogliamo scoprire o migliorare?

### Contesto

Perché questa ricerca è importante? Quale problema risolve?

### Fonti Esaminate

- [Link o riferimento 1](url)
- Documentazione ufficiale
- Benchmark, paper, articoli

### Risultati

Cosa è stato scoperto? Dati, benchmark, confronti.

### Raccomandazioni

Cosa fare con questi risultati? Implementare, ignorare, approfondire?

### Task Correlate

- Link a TASK.md
- Link a PROPOSTE.md

---
```

---

## Ricerche Completate

### [R001] Benchmark Kokoro TTS — Latenza e Performance

**Data:** 2026-03-31
**Stato:** Completata
**Richiedente:** Team sviluppo
**Priorità:** Alta

#### Domanda di Ricerca

Quali sono le performance reali di Kokoro TTS su Windows per l'uso in-app?

#### Contesto

Il progetto usa Kokoro come provider TTS default. Serve conoscere:
- Tempo di inizializzazione
- Latenza prima sintesi (cold)
- Latenza sintesi successive (warm)
- Impatto su UX e lip-sync

#### Fonti Esaminate

- Benchmark locale su PC di sviluppo
- Documentazione Kokoro
- Confronto con VibeVoice (alternativa test-only)

#### Risultati

| Metrica | Valore |
|---------|--------|
| Inizializzazione server | ~1.7s |
| Prima sintesi | ~1.1s |
| Sintesi successive (warm) | ~80ms |
| Voce default | `if_sara` (italiana) |

#### Raccomandazioni

- Usare testo di warmup all'avvio per ridurre latenza percepita
- Mantenere Kokoro come default, VibeVoice solo test
- Monitorare latenza in-app reale dopo deploy

#### Task Correlate

- TASK.md: T001 — Misurare latenza Kokoro in-app dopo warmup

---

## Ricerche In Corso

### [R002] Ottimizzazione Caricamento Moduli Electron

**Data inizio:** 2026-04-02
**Stato:** In corso
**Richiedente:** Agente analisi codice
**Priorità:** Media

#### Domanda di Ricerca

Esistono tecniche per ridurre il tempo di avvio di Electron caricando moduli on-demand?

#### Contesto

`main.js` importa 22+ moduli all'avvio. Alcuni potrebbero essere caricati lazy.

#### Fonti Esaminate

- Da esaminare: documentazione Electron su lazy loading
- Da esaminare: webpack/vite code splitting per main process
- Da esaminare: dynamic import() in Node.js

#### Risultati

Da completare.

#### Raccomandazioni

Da definire.

---

### [R003] Pattern di State Management per Moduli Node.js

**Data inizio:** 2026-04-02
**Stato:** In corso
**Richiedente:** Agente analisi codice
**Priorità:** Alta

#### Domanda di Ricerca

Quali sono i pattern migliori per gestire stato condiviso tra moduli in Node.js senza accoppiamento circolare?

#### Contesto

La migrazione dei moduli `browser-agent`, `computer-control`, `window-manager` è bloccata dallo stato condiviso. Serve un pattern che:
- Eviti cicli di dipendenza
- Permetta testing in isolamento
- Mantenga il codice leggibile

#### Fonti Esaminate

- Da esaminare: Node.js module pattern best practices
- Da esaminare: Dependency injection in Node.js
- Da esaminare: State container pattern (Redux-like)
- Da esaminare: Service locator pattern

#### Risultati

Da completare.

#### Raccomandazioni

Da definire.

#### Task Correlate

- TASK.md: T003 — Completare migrazione moduli con stato condiviso
- PROPOSTE.md: #001 — Sblocco Migrazione Moduli

---

## Ricerche Future (Backlog)

| ID | Titolo | Priorità | Note |
|----|--------|----------|------|
| R004 | Confronto TalkingHead vs VRM vs Live2D | Bassa | Per T013 |
| R005 | Resident HTTP orchestrator pattern | Media | Per T014 |
| R006 | LSP integration per coding assistant | Bassa | Per T012 |
| R007 | WebSocket vs stdio per ACP | Media | Performance e affidabilità |
| R008 | Token estimation accuracy per pruning | Media | Migliorare session-pruning.js |

---

*Ultimo aggiornamento: 2026-04-02*
*Ricerche totali: 2 completate + 2 in corso + 7 backlog*

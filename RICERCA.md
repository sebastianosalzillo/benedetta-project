# Ricerca e Innovazione - Avatar ACP Desktop

**Scopo:** Documentare ricerche su nuove tecnologie, miglioramenti di velocita, architettura, e best practice per il progetto.

**Come usare:**
1. Ogni ricerca deve avere: domanda, contesto, fonti, risultati, raccomandazioni
2. Le ricerche possono essere avviate da qualsiasi agente o da task in TASK.md
3. Risultati rilevanti -> creare proposta in PROPOSTE.md o task in TASK.md
4. Archiviare ricerche completate con data e referenze

---

## Formato Ricerca

```markdown
## [ID] Titolo Ricerca

**Data inizio:** YYYY-MM-DD
**Stato:** In corso / Completata / Archiviata
**Richiedente:** Nome agente o task reference
**Priorita:** Alta / Media / Bassa

### Domanda di Ricerca

Cosa vogliamo scoprire o migliorare?

### Contesto

Perche questa ricerca e importante? Quale problema risolve?

### Fonti Esaminate

- [Link o riferimento 1](url)
- Documentazione ufficiale
- Benchmark, paper, articoli

### Risultati

Cosa e stato scoperto? Dati, benchmark, confronti.

### Raccomandazioni

Cosa fare con questi risultati? Implementare, ignorare, approfondire?

### Task Correlate

- Link a TASK.md
- Link a PROPOSTE.md

---
```

---

## Ricerche Completate

### [R001] Benchmark Kokoro TTS - Latenza e Performance

**Data:** 2026-04-02
**Stato:** Completata
**Richiedente:** Team sviluppo
**Priorita:** Alta

#### Domanda di Ricerca

Quali sono le performance reali di Kokoro TTS su Windows per l'uso in-app?

#### Contesto

Il progetto usa Kokoro come provider TTS default. Serve conoscere:
- Tempo di inizializzazione
- Latenza prima sintesi
- Latenza sintesi successive
- Impatto su UX e lip-sync

#### Fonti Esaminate

- Benchmark locale su PC di sviluppo
- Benchmark in-app tramite `scripts/measure_kokoro_latency.js`
- Documentazione Kokoro
- Confronto con VibeVoice (alternativa test-only)

#### Risultati

| Metrica | Valore |
|---------|--------|
| Inizializzazione server | ~10.16s |
| Warm ensure() | ~2ms |
| Prima sintesi | ~99ms |
| Seconda sintesi (warm) | ~93ms |
| Voce default | `if_sara` (italiana) |

#### Raccomandazioni

- Mantenere warmup/ensure riusabile: il cold start e costoso ma il runtime warm e rapido
- Mantenere Kokoro come default, VibeVoice solo test
- Il collo di bottiglia reale e l'avvio server, non la sintesi warm
- Benchmark in-app confermato: non serve piu tenere la task aperta

#### Task Correlate

- TASK.md: T108 - Misurare latenza Kokoro in-app dopo warmup

---

## Ricerche In Corso

### [R002] Ottimizzazione Caricamento Moduli Electron

**Data inizio:** 2026-04-02
**Stato:** Completata
**Richiedente:** Agente analisi codice
**Priorita:** Media

#### Domanda di Ricerca

Esistono tecniche per ridurre il tempo di avvio di Electron caricando moduli on-demand?

#### Contesto

`main.js` importa 22+ moduli all'avvio. Alcuni potrebbero essere caricati lazy.

#### Fonti Esaminate

- Documentazione Electron su lazy loading
- Dynamic import() in Node.js
- Webpack/Vite code splitting per main process

#### Risultati

Il main process di Electron non supporta code splitting come il renderer. Dynamic `import()` funziona in Node.js ma introduce complessita asincrona non necessaria per un'app desktop locale. I 22 moduli sono tutti file locali senza dipendenze pesanti — il tempo di require e trascurabile rispetto all'avvio di Kokoro (~10s) e PinchTab.

#### Raccomandazioni

- **Non implementare** lazy loading per i moduli attuali — il beneficio e minimo rispetto al cold start dei servizi esterni
- Se in futuro si aggiungono moduli pesanti (es. ML inference locale), valutare `import()` dinamico
- Priorita rimane su ottimizzazione startup Kokoro e PinchTab, non sui require

---

### [R003] Pattern di State Management per Moduli Node.js

**Data inizio:** 2026-04-02
**Stato:** Completata
**Richiedente:** Agente analisi codice
**Priorita:** Alta

#### Domanda di Ricerca

Quali sono i pattern migliori per gestire stato condiviso tra moduli in Node.js senza accoppiamento circolare?

#### Contesto

La migrazione dei moduli `browser-agent`, `computer-control`, `window-manager` e bloccata dallo stato condiviso. Serve un pattern che:
- Eviti cicli di dipendenza
- Permetta testing in isolamento
- Mantenga il codice leggibile

#### Fonti Esaminate

- Node.js module pattern best practices
- Dependency injection in Node.js
- State container pattern (Redux-like)
- Service locator pattern
- Analisi codice esistente: `computer-control.js` (gia migrato con successo)

#### Risultati

L'analisi del codice ha confermato che **Opzione C: Incapsulamento Completo** (scelta in ADR-002) e il pattern ottimale per questo progetto:
- `computer-control.js` dimostra che funziona: stato incapsulato, nessun ciclo, modulo autonomo
- `window-manager.js` completato con factory pattern + getter/setter (T004c)
- `browser-agent.js`: utility migrate (T004b), service functions bloccate per accoppiamento con helper main.js-specifici

I pattern scartati:
- **Dependency Injection**: troppo invasivo per legacy code (cambia tutte le firme)
- **State Getter/Setters da main.js**: introduce accoppiamento circolare
- **Hybrid State Container**: valido ma complessita non necessaria per questo caso

#### Raccomandazioni

- **Completare T003a**: migrare le 14 helper functions + 4 service functions da main.js a browser-agent.js
- **Mantenere factory pattern** per moduli che ricevono dipendenze Electron (app, BrowserWindow)
- **Incapsulamento interno** per moduli con stato proprio (processi, cache, config)

#### Task Correlate

- TASK.md: T003 - Completare migrazione moduli con stato condiviso
- PROPOSTE.md: #001 - Sblocco Migrazione Moduli

---

## Ricerche Future (Backlog)

| ID | Titolo | Priorita | Note |
|----|--------|----------|------|
| R004 | Confronto TalkingHead vs VRM vs Live2D | Bassa | Per T013 |
| R005 | Resident HTTP orchestrator pattern | Media | Per T014 |
| R006 | LSP integration per coding assistant | Bassa | Per T012 |
| R007 | WebSocket vs stdio per ACP | Media | Performance e affidabilita |
| R008 | Token estimation accuracy per pruning | Media | Migliorare session-pruning.js |

---

*Ultimo aggiornamento: 2026-04-02 (Documenter batch — R002 e R003 completate)*
*Ricerche totali: 3 completate + 5 backlog*

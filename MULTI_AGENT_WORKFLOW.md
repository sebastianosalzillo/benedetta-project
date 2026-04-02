# Multi-Agent Project Workflow — Guida Completa

**Versione:** 1.0
**Ultimo aggiornamento:** 2026-04-02
**Scopo:** Definire tutti i ruoli, workflow e punti di integrazione per un team di agenti AI che collaborano su un progetto software.

---

## Panoramica

Questo documento descrive un sistema multi-agente completo per gestire un progetto software dalla fase di idea fino al deploy e manutenzione. Ogni agente ha responsabilità specifiche, workflow definiti e punti di handoff chiari con gli altri agenti.

**Totale ruoli:** 16 (7 attivi + 9 futuri)

**Ruoli attivi (7):** Architect, Ricercatore, Revisore, Costruttore, QA/Tester, Documenter, UI Specialist

**Ruoli futuri (9):** Security Specialist, DevOps/Release Manager, Backend Specialist, Database Specialist, Performance Engineer, Accessibility Specialist, i18n Specialist, Integration Specialist, Data Analyst

---

## Mappa dei Ruoli

### Ruoli Attivi (7)

```
                    ┌─────────────────┐
                    │   Architect     │
                    │  (visione,      │
                    │   decisioni)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Ricercatore    │ │   Revisore      │ │  UI Specialist  │
│  (esplora,      │ │  (valuta,       │ │  (design,       │
│   benchmark)    │ │   review)       │ │   usabilità)    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Costruttore    │
                    │ (implementa,    │
                    │  testa, commit) │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  QA / Tester    │ │  Documenter     │ │  Integration*   │
│  (verifica,     │ │  (docs,         │ │  (*se 5+        │
│   report bug)   │ │   sincronizza)  │ │   integrazioni) │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Ruoli Futuri (9)

```
┌──────────────────────────────────────────────────────────────────┐
│                    RUOLI FUTURI (per fase matura)                │
├──────────────────────────────────────────────────────────────────┤
│  Security        │  DevOps/         │  Performance               │
│  Specialist      │  Release         │  Engineer                  │
│  (packaging)     │  Manager         │  (latenza, leak)           │
│                  │  (packaging)     │                            │
├──────────────────────────────────────────────────────────────────┤
│  Backend         │  Database        │  Accessibility             │
│  Specialist      │  Specialist      │  Specialist (A11y)         │
│  (API server)    │  (>1GB dati)     │  (WCAG AAA)                │
├──────────────────────────────────────────────────────────────────┤
│  i18n            │  Data Analyst /  │                            │
│  Specialist      │  Telemetry       │                            │
│  (5+ lingue)     │  (>1000 utenti)  │                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## File di Coordinamento

| File | Scopo | Aggiornato da | Letto da |
|------|-------|---------------|----------|
| `CODEX.md` | Coordinamento centrale, stato corrente, regole | Tutti | Tutti (obbligatorio) |
| `PROPOSTE.md` | Proposte architetturali in revisione | Ricercatore, Architect | Revisore, Architect, Costruttore |
| `TASK.md` | Task implementative tracciate | Revisore (assegna), Costruttore (aggiorna) | Costruttore, QA, Documenter |
| `RICERCA.md` | Ricerche tecnologie, benchmark | Ricercatore | Architect, Revisore, Costruttore |
| `REVIEW.md` | Code review formali | Revisore | Costruttore, QA, Architect |
| `DECISIONI.md` | Decisioni architetturali (ADR) | Architect | Tutti |
| `design-system.md` | Design system UI | UI Specialist | Costruttore, UI Specialist |

---

## Ruoli e Workflow

### 1. Architect

**Responsabilità principali:**
- Definire visione architetturale a lungo termine
- Prendere decisioni su pattern, tecnologie core, confini di modulo
- Risolvere disaccordi tra Revisore e Costruttore
- Mantenere coerenza tra PROPOSTE.md e architettura target
- Aggiornare CODEX.md e DECISIONI.md con cambiamenti architetturali

**Workflow completo:**

```
FASE 1: Ricezione proposta controversa o decisione complessa
  ↓
FASE 2: Valuta impatto su architettura esistente e futura
  - Consulta CODEX.md (stato corrente)
  - Consulta DECISIONI.md (decisioni precedenti)
  - Consulta ANTIGRAVITY.md (analisi architetturale)
  ↓
FASE 3: Analizza alternative e conseguenze
  - Pro e contro di ogni opzione
  - Coerenza con "model-planned agent" architecture
  - Impatto su manutenibilità, performance, sicurezza
  ↓
FASE 4: Decide e documenta
  - Scrive decisione in DECISIONI.md (formato ADR)
  - Aggiorna PROPOSTE.md con esito
  - Aggiorna CODEX.md Current Status se necessario
  ↓
FASE 5: Comunica a tutti gli agenti
  - Aggiorna TASK.md se nascono nuove task
  - Notifica in CODEX.md Storico Sessioni
  ↓
FASE 6: Monitora implementazione
  - Verifica che Costruttore segua decisione
  - Interviene se emergono problemi imprevisti
```

**Output attesi:**
- ADR documentate in DECISIONI.md
- CODEX.md aggiornato con stato architetturale
- Linee guida per implementazioni future
- Risoluzione conflitti tra agenti

**Handoff:**
- → Revisore: Assegna task dopo approvazione proposta
- → Costruttore: Decisioni architetturali chiare
- → Tutti: Aggiornamenti in CODEX.md

---

### 2. Ricercatore

**Responsabilità principali:**
- Esplorare tecnologie, pattern, librerie per problemi specifici
- Condurre ricerche online (documentazione, GitHub, Stack Overflow, paper, blog)
- Produrre benchmark e confronti oggettivi
- Testare localmente tecnologie promettenti quando fattibile
- Documentare risultati in RICERCA.md
- Segnalare raccomandazioni per proposte o task

**Workflow completo:**

```
FASE 1: Riceve domanda di ricerca
  - Da TASK.md (task esistente)
  - Da richiesta diretta (Architect o altro agente)
  - Da iniziativa propria (identifica problema/opportunità)
  ↓
FASE 2: Pianifica ricerca
  - Definisce domande chiave da rispondere
  - Identifica fonti da consultare
  - Stima tempo necessario
  ↓
FASE 3: Esegue ricerca online
  - Documentazione ufficiale
  - GitHub (issue, PR, activity, stars, manutenzione)
  - npm trends (popolarità, alternative)
  - Stack Overflow (problemi comuni, workaround)
  - Blog tecnici, paper accademici
  ↓
FASE 4: Valuta opzioni
  - Maturità della tecnologia
  - Manutenzione attiva (ultimi commit, issue risolte)
  - Compatibilità con stack esistente
  - Performance (benchmark se disponibili)
  - Licenza (MIT, Apache, GPL, etc.)
  - Community e supporto
  ↓
FASE 5: Test locale (se applicabile)
  - Installa libreria/package
  - Crea proof-of-concept minimo
  - Misura performance reali
  - Verifica compatibilità
  ↓
FASE 6: Documenta in RICERCA.md
  - Domanda di ricerca
  - Fonti esaminate (con link)
  - Risultati (benchmark, confronti)
  - Raccomandazioni (implementare / ignorare / approfondire)
  ↓
FASE 7: Propone azione
  - Se serve approvazione → crea proposta in PROPOSTE.md
  - Se azione diretta → crea/aggiorna task in TASK.md
  - Notifica in CODEX.md
```

**Output attesi:**
- Sezione completata in RICERCA.md
- Link a fonti primarie (documentazione, repo, issue)
- Benchmark numerici quando possibile
- Raccomandazioni chiare con pro/contro
- Proposta in PROPOSTE.md o task in TASK.md

**Handoff:**
- → Architect: Proposte che richiedono decisione
- → Revisore: Task pronte per assegnazione
- → Costruttore: Raccomandazioni implementative

---

### 3. Revisore

**Responsabilità principali:**
- Valutare proposte architetturali in PROPOSTE.md
- Eseguire code review di cambiamenti, PR, o task completate
- Verificare correttezza, sicurezza, qualità del codice
- Controllare coerenza con architettura target
- Approvare o richiedere modifiche prima dell'implementazione o del merge

**Workflow completo:**

```
FASE 1: Identifica cosa revieware
  - Nuova proposta in PROPOSTE.md
  - Task completata in TASK.md (stato: "Changes Applied" o "Completed")
  - PR o commit da revieware
  ↓
FASE 2: Review Architetturale (se proposta)
  - Legge PROPOSTE.md
  - Analizza: correttezza tecnica, impatto, rischi, alternative
  - Verifica coerenza con architettura "model-planned agent"
  - Controlla DECISIONI.md per decisioni precedenti correlate
  ↓
FASE 3: Code Review (se task completata)
  - Esegue `git diff` per vedere cambiamenti
  - Analizza codice con checklist:
    [ ] Correttezza funzionale
    [ ] Sicurezza (injection, secrets, validazione)
    [ ] Qualità codice (naming, funzioni lunghe, duplicazione)
    [ ] Performance (loop inutili, query ottimizzate)
    [ ] Error handling (try/catch, fallback, logging)
    [ ] Test (unit test, integration test)
    [ ] Documentazione (JSDoc, commenti sul "perché")
  ↓
FASE 4: Classifica problemi per severità
  - Critical: bloccano il merge (bug, security, regressioni)
  - Important: da fixare prima del merge (architettura, qualità)
  - Minor: miglioramenti, non bloccano (style, ottimizzazioni)
  ↓
FASE 5: Documenta review in REVIEW.md
  - Compila template review
  - Elenca problemi con severità
  - Suggerisce fix per ogni problema
  ↓
FASE 6: Esprime verdetto
  - Ready to Merge: nessun problema critical/importante
  - Changes Required: problemi da fixare prima di merge
  - Not Ready: problemi gravi, serve redesign
  ↓
FASE 7: Aggiorna TASK.md
  - Cambia stato task:
    - "Ready to Merge" → Costruttore può mergiare
    - "Changes Required" → Costruttore deve fixare
  - Aggiunge note con riferimenti a REVIEW.md
  ↓
FASE 8: Notifica Costruttore
  - Lascia commento in CODEX.md o TASK.md
  - Indica chiaramente cosa fixare
  ↓
FASE 9: Attende fix del Costruttore
  - Monitora TASK.md per stato "Changes Applied"
  ↓
FASE 10: Verifica fix
  - Rilegge REVIEW.md con problemi originali
  - Esegue `git diff` sui nuovi cambiamenti
  - Verifica ogni fix applicato
  ↓
FASE 11: Aggiorna verdetto
  - Se tutti i fix sono corretti → "Ready to Merge"
  - Se fix incompleti → ripete Fasi 7-10
  ↓
FASE 12: Approva merge
  - Cambia stato in REVIEW.md: "Approved"
  - Aggiorna TASK.md: stato "Ready to Merge"
  - Notifica Costruttore che può procedere
```

**Output attesi:**
- Review compilata in REVIEW.md o PROPOSTE.md
- Voto motivato con severità per ogni problema
- Verdict chiaro: Ready to Merge / Changes Required / Not Ready
- TASK.md aggiornato con stato corretto

**Handoff:**
- → Costruttore: Review con fix richiesti
- → Architect: Proposte approvate con assegnazione
- → QA/Tester: Task pronte per testing dopo merge

---

### 4. Costruttore

**Responsabilità principali:**
- Implementare task assegnate in TASK.md
- Scrivere codice seguendo convenzioni di progetto
- Eseguire build e test dopo ogni cambiamento
- Aggiornare documentazione correlata
- Applicare fix richiesti dal Revisore

**Workflow completo:**

```
FASE 1: Legge TASK.md
  - Identifica task assegnate a sé
  - Verifica stato: "Ready", "In Progress", "Changes Required"
  ↓
FASE 2: Verifica prerequisiti
  - Controlla PROPOSTE.md correlate (devono essere "Approvate")
  - Controlla RICERCA.md per raccomandazioni
  - Controlla DECISIONI.md per decisioni architetturali
  - Controlla REVIEW.md se task ha "Changes Required"
  ↓
FASE 3: Prepara ambiente di lavoro
  - Esegue `git status` per verificare stato repo
  - Esegue `git pull` se necessario
  - Crea branch se task è grande: `feature/<nome>-<data>`
  ↓
FASE 4: Implementa in batch piccoli
  - Suddivide task in sotto-task se complessa
  - Implementa un batch alla volta
  - Segue convenzioni di codice (CODEX.md)
  ↓
FASE 5: Verifica dopo ogni batch
  - Esegue `npm run build`
  - Esegue `npm run test:smoke` se pertinente
  - Verifica che build sia verde
  ↓
FASE 6: Commit
  - Esegue `git add .` per file modificati
  - Esegue `git commit -m "messaggio con task ID"`
    - Usa imperativo presente: "Migrare X", "Fix Y"
    - Include riferimenti: "T003a", "PROPOSTE.md #001"
    - Max 72 caratteri prima riga
  ↓
FASE 7: Aggiorna TASK.md
  - Cambia stato: "In Progress"
  - Aggiunge nota con commit link
  - Stima tempo rimanente
  ↓
FASE 8: Ripete Fasi 4-7 fino a task completata
  ↓
FASE 9: Se Revisore richiede modifiche (stato: "Changes Required")
  - Legge REVIEW.md per problemi identificati
  - Applica fix richiesti (priorità: Critical → Important → Minor)
  - Esegue `npm run build` e `npm run test:smoke` dopo ogni fix
  - Commit con messaggio: "Fix: [descrizione] (T003a)"
  - Aggiorna TASK.md: stato → "Changes Applied"
  - Notifica Revisore in CODEX.md: "Fix applicati, pronto per re-review"
  ↓
FASE 10: Task completata
  - Aggiorna TASK.md: stato → "Completed" o "Ready to Merge"
  - Aggiunge link a commit finale
  - Notifica in CODEX.md
  ↓
FASE 11: Se blocca
  - Aggiorna TASK.md: stato → "Blocked"
  - Aggiunge nota con descrizione blocco
  - Notifica in CODEX.md chiedendo aiuto (Architect o Revisore)
```

**Convenzioni di codice:**
- CamelCase per variabili e funzioni
- Async/await corretto ovunque
- Error handling con try/catch
- Niente console.log in produzione
- Commenti solo per "perché", non per "cosa"

**Output attesi:**
- Codice funzionante e testato
- Commit con messaggio chiaro
- TASK.md aggiornato
- Eventuali note in CODEX.md

**Handoff:**
- → Revisore: Task "Completed" pronta per review
- → QA/Tester: Task "Ready to Merge" pronta per testing
- → Documenter: Documentazione da aggiornare se codice cambia API

---

### 5. QA / Tester

**Responsabilità principali:**
- Verificare che le task completate funzionino correttamente
- Eseguire test manuali e automatizzati
- Segnalare bug in TASK.md con riproducibilità
- Mantenere suite di test aggiornata
- Approvare merge finale prima di production

**Workflow completo:**

```
FASE 1: Identifica task da testare
  - Legge TASK.md per task stato "Ready to Merge" o "Completed"
  - Priorità: task critical o che toccano codice core
  ↓
FASE 2: Prepara ambiente di test
  - Esegue `git checkout` del branch/task
  - Esegue `npm install` se dipendenze cambiate
  ↓
FASE 3: Esegue build
  - Esegue `npm run build`
  - Verifica che build passi senza errori
  ↓
FASE 4: Esegue test automatizzati
  - Esegue `npm run test:smoke` o test specifici
  - Verifica che tutti i test passino
  ↓
FASE 5: Esegue test manuali
  - Segue scenario d'uso della task
  - Testa flussi utente principali
  - Testa edge case e input estremi
  - Verifica UI/UX (coerenza, usabilità)
  ↓
FASE 6: Documenta risultati
  - Se tutto verde: aggiorna TASK.md con "QA Approved"
  - Se trova bug: aggiunge sezione bug in TASK.md con:
    - Descrizione chiara
    - Step per riprodurre (numerati, 1-2-3...)
    - Comportamento atteso vs osservato
    - Screenshot o log se utili
    - Severità: Critical / Important / Minor
  ↓
FASE 7: Segnala bug
  - Cambia stato task: "Bug Found"
  - Notifica Costruttore in CODEX.md
  ↓
FASE 8: Attende fix
  - Monitora TASK.md per stato "Changes Applied"
  ↓
FASE 9: Verifica fix
  - Ripete Fasi 2-5 per bug fixati
  ↓
FASE 10: Approva merge
  - Se tutto verde: aggiorna TASK.md "QA Approved"
  - Notifica Costruttore che può mergiare
```

**Output attesi:**
- Report di test in TASK.md o REVIEW.md
- Bug segnalati con riproducibilità chiara
- Approvazione merge o richiesta di fix

**Handoff:**
- → Costruttore: Bug da fixare
- → Revisore: Approvazione per merge
- → Architect: Bug architetturali o regressioni gravi

---

### 6. Documenter

**Responsabilità principali:**
- Mantenere documentazione sincronizzata con il codice
- Scrivere guide, README, esempi d'uso
- Aggiornare PROPOSTE.md, TASK.md, RICERCA.md con formattazione corretta
- Creare diagrammi architetturali quando utili
- Verificare coerenza tra documentazione e implementazione

**Workflow completo:**

```
FASE 1: Monitora cambiamenti
  - Legge CODEX.md Storico Sessioni per commit recenti
  - Legge TASK.md per task completate
  - Esegue `git log -n 10` per vedere cambiamenti codice
  ↓
FASE 2: Identifica documentazione da aggiornare
  - API cambiate (nuovi parametri, funzioni, classi)
  - Workflow modificati
  - Nuove feature implementate
  - Decisioni architetturali (ADR)
  ↓
FASE 3: Verifica coerenza
  - Confronta documentazione con codice effettivo
  - Identifica discrepanze (docs obsolete o codice non documentato)
  ↓
FASE 4: Aggiorna documentazione
  - CODEX.md: sezioni obsolete
  - TASK.md: formattazione, chiarezza
  - RICERCA.md: formattazione, link rotti
  - PROPOSTE.md: formattazione, chiarezza
  - README.md: guide, esempi d'uso
  - Crea nuovi file se necessario (es. design-system.md)
  ↓
FASE 5: Crea diagrammi (se utili)
  - Flusso di lavoro multi-agente
  - Architettura sistema
  - Sequenza di chiamate per feature complesse
  ↓
FASE 6: Verifica aggiornamenti
  - Esegue `npm run build` per verificare che esempi di codice funzionino
  - Testa link e riferimenti incrociati
  ↓
FASE 7: Commit documentazione
  - Esegue `git add` per file documentazione
  - Esegue `git commit -m "Docs: [descrizione]"`
  ↓
FASE 8: Segnala discrepanze
  - Se trova codice non documentato o documentazione non allineata
  - Crea task in TASK.md per Documenter futuro o Costruttore
  - Notifica in CODEX.md
```

**Output attesi:**
- Documentazione aggiornata e coerente
- README.md chiaro per nuovi sviluppatori
- Diagrammi o esempi quando utili
- Task per discrepanze identificate

**Handoff:**
- → Tutti: Documentazione aggiornata
- → Costruttore: Task per documentare codice non documentato
- → Revisore: Segnala documentazione come criterio di review

---

### 7. UI Specialist

**Responsabilità principali:**
- Progettare e mantenere coerenza visiva dell'interfaccia (React components)
- Garantire usabilità, accessibilità (a11y) e user experience
- Definire design system: palette colori, tipografia, spacing, componenti
- Ottimizzare layout per responsive e diverse risoluzioni
- Progettare animazioni e micro-interazioni (transizioni, feedback visivi)
- Condurre user testing e raccogliere feedback sull'interfaccia

**Workflow completo:**

```
FASE 1: Analizza UI esistente o nuova feature
  - Identifica componenti da creare o migliorare
  - Raccoglie requisiti da TASK.md o PROPOSTE.md
  ↓
FASE 2: Definisce/revisa design system
  - Palette colori (primari, secondari, accenti, stati)
  - Tipografia (font, dimensioni, pesi, line-height)
  - Spacing (margin, padding, gap)
  - Componenti (bottoni, input, card, modal, etc.)
  ↓
FASE 3: Crea mockup o prototipi
  - Figma o strumenti di design per mockup statici
  - Oppure codice diretto per prototipi interattivi
  - Include stati: default, hover, focus, active, disabled
  ↓
FASE 4: Implementa o coordina implementazione
  - Implementa direttamente se task assegnata a UI Specialist
  - Oppure coordina con Costruttore per implementazione
  - Fornisce specifiche dettagliate (colori, dimensioni, animazioni)
  ↓
FASE 5: Testa usabilità
  - Navigazione (flusso intuitivo, breadcrumb, menu)
  - Accessibilità (WCAG AA: contrasti, keyboard nav, screen reader)
  - Responsive (diverse risoluzioni, mobile, tablet, desktop)
  - Performance (nessun layout shift, animazioni fluide 60fps)
  ↓
FASE 6: Documenta pattern UI
  - Aggiorna design-system.md
  - Crea esempi di utilizzo per ogni componente
  - Documenta best practice e anti-pattern
  ↓
FASE 7: Raccoglie feedback utente
  - Osserva utenti reali che usano l'interfaccia
  - Registra sessioni di usabilità
  - Identifica punti di attrito o confusione
  ↓
FASE 8: Itera su miglioramenti
  - Applica feedback raccolti
  - Aggiorna design system
  - Notifica cambiamenti in CODEX.md
```

**Strumenti:**
- Figma o strumenti di design per mockup
- React DevTools per analisi componenti
- Lighthouse per audit accessibilità e performance
- User testing (osservazione diretta, registrazioni)

**Criteri di qualità UI:**
- [ ] Coerenza visiva (colori, font, spacing uniformi)
- [ ] Accessibilità WCAG AA (contrasti, keyboard navigation, screen reader)
- [ ] Responsive (funziona su diverse risoluzioni)
- [ ] Performance (nessun layout shift, animazioni fluide 60fps)
- [ ] Usabilità (flusso intuitivo, feedback chiari, error handling visibile)

**Output attesi:**
- Design system documentato (colori, tipografia, componenti)
- UI coerente in tutte le finestre/sezioni
- Audit accessibilità con score Lighthouse ≥90
- Pattern UI riutilizzabili documentati
- Mockup/prototipi per nuove feature

**Handoff:**
- → Costruttore: Specifiche UI da implementare
- → Documenter: Design system da documentare
- → QA/Tester: Criteri di usabilità per testing

---

## Ruoli Futuri (Da Attivare in Fase Matura)

Questi ruoli saranno attivati quando il progetto raggiungerà determinate milestone o complessità.

### 8. Security Specialist

**Quando attivare:** Prima del packaging Windows e distribuzione.

**Responsabilità:**
- Audit sicurezza: injection, secrets, validazione input, IPC security
- Review dipendenze per vulnerabilità note (npm audit)
- Hardening Electron: sandbox, contextIsolation, nodeIntegration
- Security testing: penetration test, fuzzing input
- Definire security policy e best practice

**Workflow:**
```
1. Analizza superfici di attacco (shell, file, IPC, browser automation)
2. Esegue audit automatico (npm audit, electron-builder security)
3. Review manuale codice per injection e secrets esposte
4. Documenta vulnerabilità per severità
5. Definisce fix e hardening required
6. Verifica fix applicati prima del release
```

**Output attesi:**
- Report sicurezza con vulnerabilità e fix
- Dipendenze aggiornate e senza CVE critiche
- Electron hardening applicato
- Security checklist per release

---

### 9. DevOps / Release Manager

**Quando attivare:** Prima del packaging Windows e distribuzione.

**Responsabilità:**
- Build automation e CI/CD pipeline
- Windows installer packaging (electron-builder)
- Versioning semantico e changelog
- Distribuzione e aggiornamenti automatici
- Monitoraggio crash e performance post-release

**Workflow:**
```
1. Configura pipeline build automatica (GitHub Actions o simile)
2. Setup electron-builder per Windows installer
3. Definisce versioning semantico (major.minor.patch)
4. Genera changelog da commit e task completate
5. Configura aggiornamenti automatici (electron-updater)
6. Monitora crash report e performance post-release
```

**Output attesi:**
- Installer Windows funzionante (.exe o .msi)
- CI/CD pipeline automatizzata
- Changelog versionato per release
- Sistema di aggiornamenti automatici
- Dashboard monitoraggio crash/performance

---

### 10. Backend Specialist

**Quando attivare:** Se il progetto aggiunge API server, database remoti, o servizi backend complessi.

**Responsabilità:**
- Progettare e ottimizzare query database
- API design (REST, GraphQL, RPC)
- Caching strategy (Redis, Memcached)
- Message queue (RabbitMQ, Kafka)
- Ottimizzazione performance server-side
- Database connection pooling

**Workflow:**
```
1. Analizza requisiti dati e API
2. Progetta schema database o API contract
3. Implementa query ottimizzate con indici
4. Configura caching layer (Redis/Memcached)
5. Implementa message queue se necessario
6. Esegue load testing e ottimizza bottleneck
7. Documenta API e schema database
```

**Output attesi:**
- API documentate (OpenAPI/Swagger)
- Schema database versionato
- Query ottimizzate con indici appropriati
- Caching layer configurato
- Load test report con benchmark

---

### 11. Database Specialist

**Quando attivare:** Se il progetto ha schemi complessi, migrazioni frequenti, o grandi volumi di dati (>1GB).

**Responsabilità:**
- Schema design e normalizzazione
- Migrazioni database versionate
- Indicizzazione e query optimization
- Backup/restore strategy
- Data modeling e ER diagram
- Performance tuning (query lente, lock)

**Workflow:**
```
1. Analizza requisiti dati e relazioni
2. Progetta schema normalizzato (3NF o denormalizzato se necessario)
3. Crea migrazioni versionate (up/down)
4. Configura indici per query frequenti
5. Implementa backup automatico
6. Monitora query lente e ottimizza
7. Documenta schema e relazioni
```

**Output attesi:**
- Schema database documentato (ER diagram)
- Migrazioni versionate e testate
- Indici configurati per query critiche
- Backup strategy implementata
- Query optimization report

---

### 12. Performance Engineer

**Quando attivare:** Se il progetto ha requisiti di performance stringenti (latenza <100ms, alto throughput, memory leak).

**Responsabilità:**
- Profiling codice (CPU, memory, I/O)
- Identificare bottleneck
- Load testing e stress testing
- Ottimizzazione algoritmi e strutture dati
- Monitoring performance in production
- Memory leak detection

**Workflow:**
```
1. Configura strumenti di profiling (Chrome DevTools, node --inspect)
2. Esegue baseline benchmark (latenza, throughput, memory)
3. Identifica bottleneck (CPU hot path, memory leak, I/O wait)
4. Propone ottimizzazioni (algoritmi, caching, strutture dati)
5. Implementa ottimizzazioni con Costruttore
6. Verifica miglioramenti con benchmark comparativi
7. Configura monitoring continuo (APM, metrics)
```

**Output attesi:**
- Profiling report con bottleneck identificati
- Benchmark prima/dopo ottimizzazioni
- Load test report (request/sec, p95 latency)
- Memory leak fixati
- Dashboard monitoring performance

---

### 13. Accessibility Specialist (A11y)

**Quando attivare:** Se il progetto deve essere accessibile a utenti con disabilità (WCAG AAA, Section 508, requisiti legali).

**Responsabilità:**
- Audit accessibilità approfondito
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Keyboard-only navigation
- Color contrast per daltonici
- ARIA labels e semantic HTML
- Focus management e skip links

**Workflow:**
```
1. Esegue audit automatico (Lighthouse, axe-core)
2. Testa con screen reader (NVDA, VoiceOver)
3. Verifica keyboard navigation (tab order, focus visible)
4. Controlla color contrast (WCAG AA/AAA)
5. Aggiunge ARIA labels e ruoli semantici
6. Implementa skip links e focus management
7. Documenta conformità WCAG
```

**Output attesi:**
- Audit accessibilità con score WCAG
- Screen reader testing report
- Keyboard navigation verificata
- Color contrast AA/AAA per tutti gli elementi
- ARIA labels e semantic HTML corretti
- Conformità WCAG documentata (A/AA/AAA)

---

### 14. Internationalization (i18n) Specialist

**Quando attivare:** Se il progetto deve supportare multiple lingue/regioni (5+ lingue, RTL support).

**Responsabilità:**
- Traduzioni e localizzazioni
- RTL support (Arabo, Ebraico)
- Format data/ora/valuta per regione
- Pluralizzazione e grammatica multi-lingua
- Cultural adaptation (colori, simboli, icone)
- i18n framework integration (i18next, react-intl)

**Workflow:**
```
1. Analizza lingue target e requisiti regionali
2. Configura i18n framework (i18next, react-intl)
3. Estrae stringhe traducibili in file JSON
4. Coordina traduttori nativi per ogni lingua
5. Implementa RTL support se necessario
6. Configura format regionali (data, valuta, numeri)
7. Testa UI con tutte le lingue attive
```

**Output attesi:**
- i18n framework configurato
- File di traduzione per ogni lingua (JSON)
- RTL support funzionante
- Format regionali corretti
- UI testata con tutte le lingue
- Documentazione per aggiungere nuove lingue

---

### 15. Integration Specialist

**Quando attivare:** Se il progetto ha 5+ integrazioni con servizi esterni (API terze, webhook, OAuth).

**Responsabilità:**
- Gestire integrazioni esterne (PinchTab, ACP, Kokoro, Ollama, etc.)
- API versioning e backward compatibility
- Error handling per servizi esterni
- Rate limiting e retry logic
- Monitoring uptime servizi esterni
- OAuth e autenticazione servizi terzi

**Workflow:**
```
1. Mappa tutte le integrazioni esterne
2. Documenta API contract per ogni servizio
3. Implementa adapter pattern per isolare dipendenze
4. Configura retry logic con exponential backoff
5. Implementa rate limiting per evitare ban API
6. Configura monitoring uptime e alerting
7. Testa fallback per servizi down
```

**Output attesi:**
- Mappa integrazioni esterne documentata
- Adapter per ogni servizio esterno
- Retry logic e rate limiting configurati
- Error handling robusto per ogni integrazione
- Dashboard uptime servizi esterni
- Fallback testati per scenari di errore

---

### 16. Data Analyst / Telemetry Specialist

**Quando attivare:** Se il progetto raccoglie dati d'uso e serve analizzarli per decisioni (post-release, utente attivo >1000).

**Responsabilità:**
- Definire metriche da tracciare (eventi, crash, performance)
- Dashboard e report automatizzati
- A/B testing framework
- User behavior analysis (funnel, retention)
- Crash analytics e categorizzazione
- Privacy compliance (GDPR, anonymization)

**Workflow:**
```
1. Definisce metriche chiave (DAU, MAU, retention, crash rate)
2. Configura telemetry SDK (Sentry, Mixpanel, GA4)
3. Implementa event tracking nel codice
4. Crea dashboard per metriche (Grafana, Looker)
5. Configura alert per anomalie (crash spike, drop retention)
6. Analizza user behavior (funnel, cohort analysis)
7. Report settimanali per team
```

**Output attesi:**
- Metriche chiave definite e tracciate
- Dashboard telemetry in tempo reale
- A/B testing framework configurato
- Crash report categorizzati e prioritizzati
- User behavior report (funnel, retention)
- Privacy compliance documentata (GDPR)

---

## Riepilogo Ruoli Futuri

| Ruolo | Attivazione | Priorità | Complessità richiesta |
|-------|-------------|----------|----------------------|
| Security Specialist | Phase 7 (packaging) | Alta | Sicurezza, Electron hardening |
| DevOps / Release Manager | Phase 7 (packaging) | Alta | CI/CD, installer, versioning |
| Integration Specialist | 5+ integrazioni esterne | Media | API multiple, adapter pattern |
| Performance Engineer | Latenza >500ms o memory leak | Media | Profiling, ottimizzazione |
| Database Specialist | DB complessi o >1GB dati | Bassa | Schema, migrazioni, query |
| Backend Specialist | API server o servizi remoti | Bassa | Backend, caching, message queue |
| Accessibility Specialist | WCAG AAA richiesto | Bassa | Screen reader, ARIA, keyboard nav |
| i18n Specialist | 5+ lingue o RTL | Bassa | Traduzioni, format regionali |
| Data Analyst | >1000 utenti attivi | Bassa | Telemetry, dashboard, A/B test |

---

## Flusso End-to-End: Da Idea a Release

```
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 1: IDEA / RICERCA                                              │
│ Ricercatore esplora, benchmark, raccomanda                          │
│ Output: RICERCA.md con raccomandazioni                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 2: PROPOSTA                                                    │
│ Ricercatore crea proposta in PROPOSTE.md                            │
│ Output: Proposta con problema, soluzioni, raccomandazione           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 3: REVIEW ARCHITETTURALE                                       │
│ Revisore valuta proposta                                            │
│ Architect decide se controversa                                     │
│ Output: PROPOSTE.md approvata/rivista, ADR in DECISIONI.md          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 4: ASSEGNAZIONE TASK                                           │
│ Revisore assegna task in TASK.md                                    │
│ Output: Task con stato "Ready", assegnata a Costruttore             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 5: IMPLEMENTAZIONE                                             │
│ Costruttore implementa, commit, aggiorna TASK.md                    │
│ Output: Codice funzionante, commit, TASK.md aggiornata              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 6: CODE REVIEW                                                 │
│ Revisore review codice, richiede fix se necessario                  │
│ Costruttore applica fix, Revisore verifica                          │
│ Output: REVIEW.md con verdict "Ready to Merge"                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 7: QA / TESTING                                                │
│ QA/Tester esegue test manuali e automatizzati                       │
│ Segnala bug se trovati, Costruttore fixa                            │
│ Output: TASK.md "QA Approved"                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 8: DOCUMENTAZIONE                                              │
│ Documenter aggiorna docs sincronizzate con codice                   │
│ UI Specialist aggiorna design-system.md se UI cambiata              │
│ Output: Documentazione coerente, commit docs                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FASE 9: MERGE / RELEASE                                             │
│ Costruttore esegue merge                                            │
│ DevOps (Phase 7) packetta e distribuisce                            │
│ Output: Release versionata, changelog, installer                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Regole di Coordinamento

1. **Lettura obbligatoria:** Ogni agente legge CODEX.md prima di lavorare
2. **Riallineamento:** Controllare TASK.md e PROPOSTE.md prima di ogni batch
3. **Niente sovrascritture:** Non modificare lavoro di altri agenti senza conferma
4. **Build verde:** `npm run build` deve passare dopo ogni cambiamento
5. **Test smoke:** `npm run test:smoke` per verifiche rapide
6. **Documentazione:** Aggiornare il file pertinente dopo ogni cambiamento
7. **Git sempre:** Ogni cambiamento deve essere committato con messaggio descrittivo

---

## Regole Git

**Obbligatorio:**
- `git status` prima di iniziare lavoro
- `git add .` per file modificati
- `git commit -m "messaggio chiaro"` dopo ogni task completata
- `git log -n 3` per verificare stile messaggi
- `git status` dopo commit per verificare successo

**Messaggi di commit:**
- Usare imperativo presente: "Migrare X", "Fix Y", "Aggiornare Z"
- Includere riferimenti a task: "T003a", "PROPOSTE.md #001"
- Essere concisi ma descrittivi (max 72 caratteri prima riga)

**Branch:**
- Default: `master` per cambiamenti diretti
- Feature grandi: `feature/<nome>-<data>` (es. `feature/module-migration-0402`)
- Merge solo dopo review e build verde

---

## Matrice di Integrazione

### Ruoli Attivi

| Da → A ↓ | Architect | Ricercatore | Revisore | Costruttore | QA | Documenter | UI |
|----------|-----------|-------------|----------|-------------|-----|------------|-----|
| **Architect** | — | Domande ricerca | Decisioni ADR | Task assegnate | — | Docs da creare | — |
| **Ricercatore** | Proposte | — | Proposte | Raccomandazioni | — | — | — |
| **Revisore** | Review richieste | — | — | Review con fix | Task da testare | — | — |
| **Costruttore** | Blocchi da risolvere | — | Fix applicati | — | Bug da fixare | Docs da aggiornare | UI da implementare |
| **QA** | Bug gravi | — | — | Bug da fixare | — | — | Usabilità da testare |
| **Documenter** | — | — | — | Codice da documentare | — | — | Design da documentare |
| **UI Specialist** | — | — | — | UI da implementare | Usabilità da testare | Design da documentare | — |

### Ruoli Futuri

| Da → A ↓ | Security | DevOps | Backend | DB | Performance | A11y | i18n | Integration | Data |
|----------|----------|--------|---------|----|-------------|------|------|-------------|------|
| **Security** | — | Hardening | API secure | DB secure | — | — | — | Auth OAuth | Privacy |
| **DevOps** | Security check | — | Deploy API | Deploy DB | Monitoring | — | — | CI/CD integrazioni | Telemetry |
| **Backend** | Audit API | API deploy | — | Query ottimizzate | Performance API | — | i18n API | Adapter esterni | Event tracking |
| **DB Specialist** | Audit DB | DB deploy | Schema DB | — | Query tuning | — | — | — | Data modeling |
| **Performance** | — | Performance CI/CD | Bottleneck API | Query lente | — | — | — | — | Metrics dashboard |
| **A11y Specialist** | — | — | — | — | — | — | RTL support | — | — |
| **i18n Specialist** | — | — | — | — | — | A11y RTL | — | Traduzioni UI | — |
| **Integration** | Security integrazioni | CI/CD integrazioni | Adapter API | — | — | — | — | — | Uptime monitoring |
| **Data Analyst** | Privacy GDPR | Crash metrics | API metrics | DB metrics | Performance metrics | — | — | — | — |

---

## Checklist per Ogni Ruolo

### Architect Checklist
- [ ] CODEX.md aggiornato con stato architetturale
- [ ] DECISIONI.md ha ADR per decisioni importanti
- [ ] Conflitti tra agenti risolti
- [ ] Coerenza con architettura target verificata

### Ricercatore Checklist
- [ ] RICERCA.md ha fonti con link
- [ ] Benchmark numerici inclusi se applicabile
- [ ] Raccomandazioni chiare (implementare/ignorare)
- [ ] PROPOSTE.md o TASK.md aggiornate con azioni

### Revisore Checklist
- [ ] REVIEW.md compilata per ogni review
- [ ] Problemi classificati per severità
- [ ] Verdict chiaro espresso
- [ ] TASK.md aggiornata con stato corretto
- [ ] Costruttore notificato

### Costruttore Checklist
- [ ] `npm run build` passa dopo ogni batch
- [ ] `npm run test:smoke` passa se pertinente
- [ ] Commit con messaggio chiaro e task ID
- [ ] TASK.md aggiornata con stato e commit link
- [ ] Fix applicati se Revisore richiesto
- [ ] Notifica in CODEX.md se completato o bloccato

### QA Checklist
- [ ] Build verificata
- [ ] Test automatizzati passati
- [ ] Test manuali eseguiti
- [ ] Bug documentati con riproducibilità
- [ ] TASK.md aggiornata con "QA Approved" o bug report

### Documenter Checklist
- [ ] Documentazione sincronizzata con codice
- [ ] Link e riferimenti verificati
- [ ] Diagrammi creati se utili
- [ ] Esempi di codice testati
- [ ] Discrepanze segnalate in TASK.md

### UI Specialist Checklist
- [ ] Design system documentato
- [ ] Accessibilità WCAG AA verificata
- [ ] Responsive testato
- [ ] Performance UI (60fps, no layout shift)
- [ ] Feedback utente raccolti e iterati

---

### Ruoli Futuri Checklist

#### Security Specialist Checklist
- [ ] Audit sicurezza completato
- [ ] npm audit senza CVE critiche
- [ ] Electron hardening applicato
- [ ] Secrets non esposte nel codice
- [ ] Security checklist per release

#### DevOps / Release Manager Checklist
- [ ] CI/CD pipeline configurata
- [ ] Installer Windows funzionante
- [ ] Versioning semantico applicato
- [ ] Changelog generato
- [ ] Aggiornamenti automatici testati

#### Backend Specialist Checklist
- [ ] API documentate (OpenAPI/Swagger)
- [ ] Schema database versionato
- [ ] Query ottimizzate con indici
- [ ] Caching layer configurato
- [ ] Load test completati

#### Database Specialist Checklist
- [ ] Schema database documentato (ER diagram)
- [ ] Migrazioni versionate e testate
- [ ] Indici configurati per query critiche
- [ ] Backup strategy implementata
- [ ] Query optimization report

#### Performance Engineer Checklist
- [ ] Profiling report completato
- [ ] Benchmark prima/dopo ottimizzazioni
- [ ] Load test report (request/sec, p95 latency)
- [ ] Memory leak fixati
- [ ] Dashboard monitoring configurata

#### Accessibility Specialist Checklist
- [ ] Audit accessibilità completato
- [ ] Screen reader testing (NVDA, VoiceOver)
- [ ] Keyboard navigation verificata
- [ ] Color contrast AA/AAA per tutti elementi
- [ ] ARIA labels e semantic HTML corretti
- [ ] Conformità WCAG documentata

#### i18n Specialist Checklist
- [ ] i18n framework configurato
- [ ] File traduzione per ogni lingua (JSON)
- [ ] RTL support funzionante
- [ ] Format regionali corretti
- [ ] UI testata con tutte le lingue

#### Integration Specialist Checklist
- [ ] Mappa integrazioni esterne documentata
- [ ] Adapter per ogni servizio esterno
- [ ] Retry logic e rate limiting configurati
- [ ] Error handling robusto per ogni integrazione
- [ ] Dashboard uptime servizi esterni
- [ ] Fallback testati per scenari di errore

#### Data Analyst / Telemetry Specialist Checklist
- [ ] Metriche chiave definite e tracciate
- [ ] Dashboard telemetry in tempo reale
- [ ] A/B testing framework configurato
- [ ] Crash report categorizzati
- [ ] User behavior report (funnel, retention)
- [ ] Privacy compliance documentata (GDPR)

---

## Metriche di Progetto

| Metrica | Come misurare | Target |
|---------|---------------|--------|
| Task completate | TASK.md stato "Completed" | +5/settimana |
| Review completate | REVIEW.md sezioni | 100% task prima di merge |
| Bug trovati da QA | TASK.md bug report | < 5% task con bug critical |
| Build verdi | `npm run build` output | 100% |
| Documentazione aggiornata | CODEX.md Storico Sessioni | Entro 24h da commit |
| Tempo medio review | TASK.md timestamp | < 24h |
| Tempo medio fix | TASK.md timestamp | < 48h |

---

*Documento di riferimento per team multi-agente. Mantenere aggiornato quando si aggiungono ruoli o si modificano workflow.*

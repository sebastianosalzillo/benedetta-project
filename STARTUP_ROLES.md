# Startup Team — Ruoli Essenziali per Lancio Prodotto

**Versione:** 1.0
**Data:** 2026-04-02
**Scopo:** Definire i 6 ruoli business + ruoli tecnici essenziali per una startup che lancia un prodotto software.

---

## Criteri di Selezione

Ho selezionato questi ruoli basandomi su:

1. **Impatto diretto sul lancio** — Senza questi, il prodotto non raggiunge il mercato
2. **Riduzione rischio** — Evitano di costruire la cosa sbagliata o fallire il go-to-market
3. **Copertura competenze** — Nessun overlap significativo, ogni ruolo copre un'area critica
4. **Scalabilità** — Possono essere ricoperti dalla stessa persona all'inizio, ma sono responsabilità distinte

---

## 6 Ruoli Business Essenziali

### 1. Product Manager (PM)

**Perché è critico:** Senza PM, nessuno decide COSA costruire e PERCHÉ. Il team tecnico costruisce feature senza validazione di mercato.

**Responsabilità:**
- Definisce product vision e roadmap
- Priorizza feature in base a valore business e bisogni utente
- Scrive PRD (Product Requirements Document)
- Validare ipotesi con dati e feedback utente
- Decide cosa entra in ogni release
- Bilancia technical debt vs nuove feature

**Output:**
- Roadmap trimestrale
- PRD per ogni feature major
- Backlog priorizzato
- Metriche di successo definite (KPI)

**Quando assumere:** Giorno 1 (può essere il founder)

---

### 2. UX Researcher

**Perché è critico:** Senza ricerca utente, costruisci basandoti su ipotesi non validate. Alto rischio di fallimento product-market fit.

**Responsabilità:**
- Interviste utente qualitative (5-10 utente/settimana)
- Usability testing di prototipi e feature esistenti
- Crea personas e journey maps
- Identifica pain point e opportunità
- Testa pricing e positioning con utenti reali
- Competitor analysis dal punto di vista utente

**Output:**
- Report interviste utente settimanali
- Personas documentate
- Journey map per flussi critici
- Usability report con priorità di fix
- Validazione (o smentita) di ipotesi product

**Quando assumere:** Prima di costruire feature major (settimana 2-4)

---

### 3. Marketing / Growth Specialist

**Perché è critico:** Anche il prodotto migliore fallisce se nessuno lo conosce. Serve chi porta utenti dal giorno del lancio.

**Responsabilità:**
- Definisce positioning e messaging
- Crea landing page e copy di vendita
- Gestisce social media e content marketing
- Campaign di lancio (email, social, PR)
- SEO e organic growth
- Paid ads (se budget disponibile)
- Analizza funnel di conversione e ottimizza

**Output:**
- Piano di go-to-market
- Landing page convertente
- Content calendar (blog, social)
- Email sequence per onboarding
- Report acquisizione utenti (CAC, canali)
- Funnel optimization (A/B test)

**Quando assumere:** 4-6 settimane prima del lancio

---

### 4. Customer Support / Success

**Perché è critico:** I primi utenti hanno domande, bug, frustrazioni. Supporto lento = churn alto e recensioni negative.

**Responsabilità:**
- Risponde a ticket utente (email, chat, social)
- Documenta bug e li segnala al team tecnico
- Crea knowledge base e FAQ
- Onboarding utenti nuovi
- Raccoglie feedback e lo sintetizza per PM
- Gestisce refund e situazioni critiche

**Output:**
- Tempo di risposta < 24h
- Knowledge base con 20+ articoli
- Report bug settimanali per team tecnico
- Feedback sintetizzato per PM
- Customer satisfaction score (CSAT)

**Quando assumere:** 2 settimane prima del lancio (o al primo utente pagante)

---

### 5. Technical Writer

**Perché è critico:** Documentazione per UTENTI è diversa da documentazione per sviluppatori. Senza docs chiari, gli utenti abbandonano.

**Responsabilità:**
- Scrive manuali utente e guide
- Crea tutorial e video walkthrough
- Documenta API (se prodotto ha API pubbliche)
- Mantiene knowledge base e FAQ
- Traduce documentazione (se multi-lingua)
- Screen shot e annotazioni UI

**Output:**
- Getting Started Guide
- User Manual completo
- API Documentation (se applicabile)
- Video tutorial (3-5 video)
- FAQ con 30+ domande comuni
- Release notes per ogni versione

**Quando assumere:** 4 settimane prima del lancio

---

### 6. Project Manager / Scrum Master

**Perché è critico:** Senza chi tiene il team focalizzato e rimuove blocker, la velocity crolla e le deadline slittano.

**Responsabilità:**
- Facilita standup daily e sprint planning
- Rimuove blocker per il team tecnico
- Gestisce timeline e milestone
- Coordina dipendenze tra ruoli
- Report status settimanale a founder/stakeholder
- Protegge il team da distrazioni esterne
- Facilita retrospettive e miglioramento continuo

**Output:**
- Sprint backlog e velocity tracking
- Timeline con milestone chiare
- Report status settimanale
- Risk register (rischi identificati e mitigati)
- Retrospettive con action items

**Quando assumere:** Quando il team tecnico ha 3+ persone

---

## Ruoli Tecnici Essenziali (7 attivi)

Dal sistema multi-agente già definito, questi sono i ruoli tecnici minimi:

| Ruolo | Perché serve | Quando |
|-------|-------------|--------|
| **Architect** | Visione tecnica, decisioni architetturali, risolve conflitti | Giorno 1 (può essere CTO/founder) |
| **Costruttore** | Implementa feature, fixa bug, scrive codice | Giorno 1 (1-3 persone) |
| **Revisore** | Code review, previene bug e debito tecnico | Quando ci sono 2+ sviluppatori |
| **QA / Tester** | Verifica qualità prima del rilascio, trova bug | 4 settimane prima del lancio |
| **UI Specialist** | Design system, coerenza visiva, accessibilità | Prima di costruire UI |
| **Documenter** | Documentazione tecnica per sviluppatori interni | Quando il codice ha 10k+ righe |
| **Ricercatore** | Esplora tecnologie, benchmark, raccomanda soluzioni | Quando servono decisioni tecnologiche |

**Minimo team tecnico per lancio:**
- 1 Architect (può essere founder/CTO)
- 2 Costruttori (per velocity accettabile)
- 1 QA/Tester (part-time fino al lancio)
- 1 UI Specialist (può essere contractor)

**Totale tecnico:** 4-5 persone

---

## Team Completo per Lancio

### Fase 1: Pre-Product (0-3 mesi)
**Team:** 3-4 persone

| Ruolo | FTE | Note |
|-------|-----|------|
| Product Manager | 1.0 | Founder o co-founder |
| Architect / CTO | 1.0 | Founder tecnico |
| Costruttore | 2.0 | 2 sviluppatori full-stack |
| UX Researcher | 0.5 | Part-time o contractor |

**Totale:** 4.5 FTE

**Obiettivo:** MVP validato con 10-20 utenti beta

---

### Fase 2: Pre-Lancio (3-6 mesi)
**Team:** 6-8 persone

| Ruolo | FTE | Note |
|-------|-----|------|
| Product Manager | 1.0 | |
| Architect / CTO | 1.0 | |
| Costruttore | 3.0 | 3 sviluppatori |
| QA / Tester | 1.0 | Full-time |
| UI Specialist | 1.0 | |
| UX Researcher | 1.0 | |
| Marketing / Growth | 1.0 | Assume 4 settimane prima lancio |
| Technical Writer | 0.5 | Part-time o contractor |
| Customer Support | 0.5 | Part-time o founder |

**Totale:** 9.5 FTE

**Obiettivo:** Lancio pubblico con 100-500 utenti

---

### Fase 3: Post-Lancio (6-12 mesi)
**Team:** 10-15 persone

| Ruolo | FTE | Note |
|-------|-----|------|
| Product Manager | 1.0 | |
| Architect / CTO | 1.0 | |
| Costruttore | 5.0 | 5 sviluppatori (2 team) |
| QA / Tester | 2.0 | |
| UI Specialist | 1.0 | |
| UX Researcher | 1.0 | |
| Marketing / Growth | 2.0 | +1 per scaling |
| Technical Writer | 1.0 | Full-time |
| Customer Support | 2.0 | Turno copre 12h/giorno |
| Project Manager | 1.0 | |
| Documenter | 0.5 | Part-time |
| Data Analyst | 0.5 | Part-time, scaling a 1.0 |

**Totale:** 17.5 FTE

**Obiettivo:** 10.000+ utenti, product-market fit validato

---

## Matrice Responsabilità per Fase

| Responsabilità | Fase 1 | Fase 2 | Fase 3 |
|---------------|--------|--------|--------|
| Product vision | Founder | PM | PM |
| Roadmap | Founder | PM | PM |
| Architettura | CTO | Architect | Architect |
| Sviluppo | Costruttori | Costruttori | Costruttori (2 team) |
| Code review | CTO | Revisore | Revisore + peer review |
| QA | Costruttori | QA | QA + automazione |
| UI/UX | UI Specialist | UI Specialist | UI + UX Researcher |
| User research | Founder | UX Researcher | UX Researcher |
| Marketing | Founder | Marketing | Marketing (2 persone) |
| Supporto | Founder | Support (part-time) | Support (2 persone) |
| Documentazione | Costruttori | Technical Writer | Technical Writer + Documenter |
| Project mgmt | Founder | PM | Project Manager |
| Data/metrics | Founder | PM + Marketing | Data Analyst |

---

## Cosa Succede Se Manca un Ruolo

| Ruolo Mancante | Conseguenza | Rischio |
|---------------|-------------|---------|
| Product Manager | Feature senza priorità, team costruisce a caso | **Alto** — fallimento product-market fit |
| UX Researcher | Ipotesi non validate, costruisci la cosa sbagliata | **Alto** — churn alto, utenti confusi |
| Marketing / Growth | Lancio silenzioso, nessun utente | **Critico** — prodotto muore in silenzio |
| Customer Support | Utenti frustrati, recensioni negative | **Alto** — churn, reputazione danneggiata |
| Technical Writer | Utenti non sanno usare il prodotto | **Medio** — supporto sovraccarico, abbandoni |
| Project Manager | Deadline slittano, team distratto | **Medio** — velocity bassa, burnout |
| Architect | Decisioni tecniche incoerenti, debito tecnico | **Alto** — refactor costosi, bug ricorrenti |
| QA | Bug in production, utenti frustrati | **Alto** — fiducia persa, churn |
| UI Specialist | UI incoerente, usabilità scarsa | **Medio** — utenti confusi, abbandoni |

---

## Assumere vs Outsourcing vs AI

| Ruolo | Assumere | Outsourcing | AI / Automazione |
|-------|----------|-------------|------------------|
| Product Manager | ✅ Founder | ❌ No | ❌ No |
| UX Researcher | ✅ Fase 2 | ✅ Contractor | ⚠️ Parziale (survey) |
| Marketing / Growth | ✅ Fase 2 | ✅ Agency | ⚠️ Parziale (content) |
| Customer Support | ✅ Fase 3 | ✅ Outsourced | ✅ Chatbot AI |
| Technical Writer | ✅ Fase 2 | ✅ Contractor | ✅ AI docs |
| Project Manager | ✅ Fase 3 | ❌ No | ⚠️ Parziale (tracking) |
| Architect | ✅ Founder | ❌ No | ❌ No |
| Costruttore | ✅ Sempre | ✅ Contractor | ⚠️ AI coding |
| QA / Tester | ✅ Fase 2 | ✅ Outsourced | ✅ Test automation |
| UI Specialist | ✅ Fase 2 | ✅ Designer | ⚠️ AI design |
| Documenter | ⚠️ Fase 3 | ✅ Contractor | ✅ AI docs |
| Ricercatore | ⚠️ Fase 2 | ✅ Contractor | ✅ AI research |

**Strategia consigliata:**
- Fase 1: Founder ricopre PM + CTO, 2 costruttori, UX Researcher contractor
- Fase 2: Assumi Marketing, Technical Writer, QA full-time
- Fase 3: Assumi Support, Project Manager, Data Analyst

---

## Budget Stimato (Italia, annuale)

| Ruolo | Stipendio Lordo | Note |
|-------|-----------------|------|
| Product Manager | €45-65k | Senior |
| UX Researcher | €35-50k | Mid-level |
| Marketing / Growth | €35-55k | + budget ads |
| Customer Support | €25-35k | Junior |
| Technical Writer | €30-45k | Mid-level |
| Project Manager | €40-55k | Senior |
| Architect / CTO | €60-90k | Founder o early hire |
| Costruttore | €35-55k | Mid-Senior |
| QA / Tester | €30-45k | Mid-level |
| UI Specialist | €35-50k | Mid-level |
| Documenter | €30-40k | Mid-level |
| Ricercatore | €35-50k | Mid-level |

**Budget Fase 1 (4.5 FTE):** ~€200-250k/anno
**Budget Fase 2 (9.5 FTE):** ~€400-500k/anno
**Budget Fase 3 (17.5 FTE):** ~€750k-1M/anno

---

## KPI per Ogni Ruolo

| Ruolo | KPI Primari |
|-------|-------------|
| Product Manager | Activation rate, Retention D30, Revenue, NPS |
| UX Researcher | Insight validati, Feature adoption post-research |
| Marketing / Growth | CAC, MQL→SQL conversion, Organic traffic |
| Customer Support | CSAT, Tempo risposta <24h, Churn ridotto |
| Technical Writer | Docs views, Support ticket ridotti, Time-to-value |
| Project Manager | Velocity, On-time delivery, Blocker rimossi |
| Architect | Technical debt ratio, Downtime, Security incidents |
| Costruttore | Feature completate, Bug rate, Code coverage |
| QA / Tester | Bug in production, Test coverage, False positive rate |
| UI Specialist | Lighthouse score, Usability score, Design consistency |
| Documenter | Docs completeness, Developer onboarding time |
| Ricercatore | Raccomandazioni adottate, Tempo decisione ridotto |

---

*Documento di riferimento per founder e HR di startup tech. Aggiornare quando il team scala o il prodotto entra in nuove fasi.*

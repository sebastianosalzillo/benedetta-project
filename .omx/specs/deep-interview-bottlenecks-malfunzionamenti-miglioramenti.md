# Deep Interview Spec — bottlenecks-malfunzionamenti-miglioramenti

## Metadata
- Date: 2026-04-03
- Profile: standard
- Rounds: 7
- Final ambiguity: 0.14
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/bottlenecks-malfunzionamenti-miglioramenti-20260403T102620Z.md`

## Clarity breakdown
| Dimension | Score |
|---|---:|
| Intent | 0.84 |
| Outcome | 0.88 |
| Scope | 0.92 |
| Constraints | 0.80 |
| Success | 0.82 |
| Context | 0.86 |

## Intent
Rendere l'app più snella e veloce rimuovendo colli di bottiglia e codice duplicato su scala ampia, con attenzione iniziale ai tool browser/computer ma senza limitarsi a quelli.

## Desired outcome
1. Meno duplicazione strutturale nella codebase.
2. Architettura più pulita e più facile da mantenere.
3. Miglioramento concreto di performance/perceived responsiveness, soprattutto in startup e nelle tool actions.
4. Riduzione di loop/processi inutili o fragili che impattano browser agent e computer control.

## In scope
- Refactor/deduplica ampia della codebase applicativa.
- Consolidamento di helper/flow duplicati, in particolare nei layer Electron e desktop-control.
- Identificazione e rimozione di colli di bottiglia architetturali e runtime.
- Ricerca online mirata a pattern e miglioramenti rilevanti per Electron performance, browser automation waits, desktop automation waits/readiness.
- Possibili breaking changes esterni su comportamento, UX, IPC e comandi/tool, se utili allo snellimento.

## Out of scope / Non-goals
- `build/`
- `dist/`
- asset/vendor
- `public/talkinghead`

## Decision boundaries
OMX può decidere senza nuova conferma:
- rompere e ridisegnare UX/IPC/comandi/tool;
- spostare, unificare o eliminare moduli duplicati;
- preferire percorsi architetturali più puliti anche se il diff è ampio;
- rivedere i percorsi browser/computer insieme al resto della codebase, non solo in isolamento.

## Constraints
- Prima dei cambi di cleanup/refactor va scritto un cleanup plan.
- Per cleanup/refactor, bloccare il comportamento con test dove non è già protetto.
- Evitare lavoro nella prima passata su output build e asset vendor esclusi.
- Repo attualmente con working tree sporco: evitare assunzioni distruttive e tenere i diff controllabili.

## Testable acceptance criteria
- Esiste un piano di cleanup/refactor esplicito prima delle modifiche.
- Le principali duplicazioni cross-file vengono censite e almeno una strategia di consolidamento copre i duplicati ad alto impatto.
- La codebase applicativa risulta più semplice: meno helper duplicati, meno logica cross-cutting dispersa, confini di responsabilità più chiari.
- I percorsi critici selezionati mostrano riduzione di attese/polling/overhead non necessari o una proposta concreta e verificata per farlo.
- Esiste evidenza di verifica (test/build mirati o misure) per supportare le affermazioni di miglioramento.

## Assumptions exposed + resolutions
- Assunzione iniziale da stressare: il focus fosse solo su bug browser/computer. **Risoluzione:** no, il vero obiettivo è refactor/deduplica ampia per snellire l'intera app.
- Assunzione critica: “nulla invariato” poteva significare solo libertà interna. **Risoluzione:** l'utente accetta esplicitamente breaking changes esterni.

## Pressure-pass findings
- Round 4–5 hanno rivisitato l'affermazione “nulla” per chiarire se includesse breaking changes esterni.
- L'ambiguità si è ridotta quando il vincolo è diventato esplicito: sono consentiti cambi di comportamento, UX, IPC e comandi/tool.

## Brownfield evidence vs inference
### Evidence from repository
- Duplicazione confermata tra `electron/main.js` e `electron/computer-control.js` per helper PowerShell/Desktop-control (`buildPowerShellEncodedCommand`, `decodePowerShellCliXml`, `runPowerShellJson`, `buildComputerWindowsStateScript`).
- `browser-agent` gestisce lifecycle/recovery/config di PinchTab.
- `computer-control` gestisce lifecycle/runtime di PowerShell e `pywinauto-mcp`.
- `src/App.jsx` ed `electron/renderer-loop.js` contengono loop/polling periodici da valutare come potenziali overhead.

### Online research findings
- Electron performance guidance: minimizzare lavoro in startup/main/renderer, rimandare moduli costosi, evitare blocchi non necessari. Source: https://www.electronjs.org/docs/latest/tutorial/performance
- Browser automation guidance: preferire attese legate allo stato/actionability invece di timeout fissi fragili. Source: https://playwright.dev/docs/actionability
- Desktop automation guidance: preferire attese/readiness (es. CPU lower / wait utilities) a polling cieco. Source: https://pywinauto.readthedocs.io/en/latest/wait_long_operations.html

## Technical context findings
- Stack: Electron + React + Vite.
- Hotspots probabili: startup services, tool lifecycle, polling loops, desktop-control duplication, browser/computer orchestration.
- Risk note: il working tree contiene molte modifiche locali già presenti.

## Condensed execution brief
Eseguire prima una pianificazione di cleanup/refactor ampia sull'applicazione, escludendo output build e vendor assets, con obiettivo combinato di deduplica architetturale e miglioramento concreto di reattività/tool actions. Sono ammessi breaking changes esterni se aiutano lo snellimento.

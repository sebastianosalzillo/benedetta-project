# Deep Interview Transcript — bottlenecks-malfunzionamenti-miglioramenti

- Date: 2026-04-03
- Profile: standard
- Context type: brownfield
- Final ambiguity: 0.14
- Threshold: 0.20
- Context snapshot: `.omx/context/bottlenecks-malfunzionamenti-miglioramenti-20260403T102620Z.md`

## Summary
The user wants a broad deduplication/refactor pass across the codebase to make the app leaner and faster, with explicit openness to breaking external changes in UX, IPC, commands, and tool behavior. The first pass should exclude build/dist outputs and vendor assets under `public/talkinghead`.

## Transcript
1. Q: Qual è il problema che ti sta facendo più male adesso in questa app — con un esempio concreto di sintomo o flusso rotto — e perché vuoi priorizzare proprio quello rispetto a startup, chat streaming, TTS Kokoro, browser agent o avatar/canvas?
   A: tool in generale agent broswer e a computer controll

2. Q: Tra browser agent e computer control, qual è il malfunzionamento o rallentamento più concreto che vuoi eliminare per primo — per esempio startup lenta, processi zombie, focus finestra sbagliato, click/OCR inaffidabili, navigazione fragile, oppure recovery dopo errore — con un caso reale che hai visto?
   A: ma voglio rende l'app piu snella e veloce togliere colli di bottiglia e togliere duplicvati codice su code base generale

3. Q: Dato che hai chiesto una pulizia generale, voglio forzare il confine: vuoi una ottimizzazione mirata ai percorsi critici (soprattutto browser agent, computer control e duplicazioni collegate) oppure una deduplica/refactor ampia dell’intera codebase, anche se questo aumenta rischio regressioni e numero di file toccati?
   A: deduplica/refactor ampia dell’intera codebase

4. Q: Per questo refactor ampio, che cosa deve restare assolutamente invariato anche se il codice interno cambia? Per esempio: UX attuale, API IPC Electron, comportamento di browser agent/computer control, TTS Kokoro, compatibilità Windows, struttura dei file workspace, oppure test/smoke esistenti.
   A: nulla

5. Q: Vuoi darmi libertà anche per breaking changes esterni — cioè cambiare comportamento, UX, IPC o comandi/tool — oppure la libertà deve restare interna, mantenendo però le stesse feature finali per l’utente?
   A: cioè cambiare comportamento, UX, IPC o comandi/tool

6. Q: In questa prima passata ampia, cosa vuoi che non assorba tempo? Per esempio: asset/vendor public/talkinghead, documentazione markdown, cartelle build/dist, packaging installer, oppure nuove feature non legate a velocità/snellimento/deduplica.
   A: cartelle build/dist asset/vendor public/talkinghead

7. Q: Come vuoi giudicare il successo di questa passata? Preferisci un criterio tipo “meno duplicazione e architettura più pulita”, oppure vuoi anche obiettivi concreti come startup/tool actions più rapide, meno processi/loop inutili, meno file toccati dai flussi browser/computer, build/test più stabili?
   A: “meno duplicazione e architettura più pulita”, oppure vuoi anche obiettivi concreti come startup/tool actions più rapide, meno processi/loop inuti entrambi

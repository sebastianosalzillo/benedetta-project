## Task Statement

Revisionare, velocizzare e migliorare il tool, aumentare la qualita del codice e rimuovere codice/complessita non necessari dove possibile.

## Desired Outcome

- Ridurre la complessita nei punti caldi principali senza cambiare il comportamento utente atteso.
- Migliorare la manutenibilita del codice e rimuovere codice morto o accoppiamenti inutili quando e sicuro farlo.
- Verificare con test e controlli di build/lint disponibili nel repo.

## Known Facts / Evidence

- Repo desktop Electron + React (`package.json` -> `electron/main.js`, `src/main.jsx`).
- `omx` e `tmux` sono installati; la sessione leader corrente non e dentro tmux, quindi il team verra lanciato tramite una sessione tmux dedicata.
- Il worktree e sporco con modifiche utente gia presenti; non vanno revertite.
- Test presenti:
  - `__tests__/browser-agent.test.js`
  - `__tests__/window-manager.test.js`
  - `__tests__/skills.test.js`
- Hotspot per dimensione/complessita:
  - `electron/main.js` ~7888 righe / ~330 KB
  - `electron/browser-agent.js` ~976 righe
  - `electron/workspace-manager.js` ~859 righe
  - `src/App.jsx` ~617 righe
  - `src/components/NyxAvatar.jsx` ~589 righe

## Constraints

- Nessuna nuova dipendenza senza richiesta esplicita.
- Cleanup/refactor: scrivere e seguire un cleanup plan prima delle modifiche.
- Bloccare il comportamento con test/regression checks prima dei refactor quando la copertura e insufficiente.
- Preferire cancellazione/riduzione codice rispetto ad aggiunta di nuovi layer.
- Non toccare o revertire modifiche utente non correlate.
- Eseguire verifiche dopo i cambiamenti.

## Unknowns / Open Questions

- Quali parti di `electron/main.js` sono piu sicure da estrarre/rimuovere senza conflitti con modifiche utente correnti.
- Se esiste codice morto nei moduli Electron non coperto dai test.
- Se i colli di bottiglia percepiti sono principalmente startup, IPC, window/state management o rendering UI.

## Likely Touchpoints

- `electron/main.js`
- `electron/browser-agent.js`
- `electron/window-manager.js`
- `electron/file-tool.js`
- `electron/skills.js`
- `src/App.jsx`
- `src/components/AvatarChat.jsx`
- `src/components/SettingsPanel.jsx`
- `__tests__/*`

## Cleanup Plan

1. Stabilire baseline di test/build e aggiungere test mirati dove manca protezione nei moduli toccati.
2. Fare un audit dei punti caldi e scegliere un set ristretto di refactor ad alto impatto e basso rischio.
3. Eseguire prima semplificazioni per estrazione, deduplicazione e rimozione di codice morto.
4. Rieseguire test e build, poi riesaminare diff e rischi residui.

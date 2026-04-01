# Piano Implementazione: Full JSON Tool Use per Nyx ACP

## Formato JSON delle Risposte del Brain

### Risposta CON tool:
```json
{
  "tools": [
    {"tool": "read_file", "args": {"path": "IDENTITY.md"}}
  ],
  "speech": "Sto leggendo il file..."
}
```

### Risposta SENZA tool (conversazione):
Testo semplice, nessun JSON.

### Risposta con tool MULTIPLI:
```json
{
  "tools": [
    {"tool": "glob", "args": {"pattern": "**/*.js", "path": "./src"}},
    {"tool": "grep", "args": {"pattern": "import React", "path": "./src", "include": "*.js"}}
  ],
  "speech": "Cerco i file JavaScript..."
}
```

### Risposta con ACT (avatar):
```json
{
  "tools": [
    {"tool": "act", "args": {"emotion": "happy", "gesture": "handup"}}
  ],
  "speech": "Ciao! 👋"
}
```

## Tool Definitions (JSON Schema)

Ogni tool ha: name, description, parameters (JSON schema)

### 1. read_file
```json
{"tool": "read_file", "args": {"path": "string", "startLine": "number?", "endLine": "number?"}}
```

### 2. write_file
```json
{"tool": "write_file", "args": {"path": "string", "content": "string", "overwrite": "boolean?"}}
```

### 3. edit_file
```json
{"tool": "edit_file", "args": {"path": "string", "oldString": "string", "newString": "string", "replaceAll": "boolean?", "regex": "boolean?"}}
```

### 4. shell
```json
{"tool": "shell", "args": {"command": "string", "cwd": "string?", "timeout": "number?", "background": "boolean?"}}
```

### 5. glob
```json
{"tool": "glob", "args": {"pattern": "string", "path": "string?"}}
```

### 6. grep
```json
{"tool": "grep", "args": {"pattern": "string", "path": "string?", "include": "string?"}}
```

### 7. multi_file_read
```json
{"tool": "multi_file_read", "args": {"files": "string[]"}}
```

### 8. git
```json
{"tool": "git", "args": {"action": "string", "params": "object?", "cwd": "string?"}}
```

### 9. web_fetch
```json
{"tool": "web_fetch", "args": {"url": "string", "format": "string?"}}
```

### 10. web_search
```json
{"tool": "web_search", "args": {"query": "string", "numResults": "number?"}}
```

### 11. task
```json
{"tool": "task", "args": {"action": "string", "params": "object?"}}
```

### 12. act (avatar)
```json
{"tool": "act", "args": {"emotion": "string?", "gesture": "string?", "pose": "string?", "animation": "string?", "intensity": "number?", "expression": "string?"}}
```

### 13. delay
```json
{"tool": "delay", "args": {"seconds": "number"}}
```

### 14. canvas
```json
{"tool": "canvas", "args": {"action": "string", "layout": "string?", "content": "object"}}
```

### 15. browser
```json
{"tool": "browser", "args": {"action": "string", "url": "string?", "ref": "string?", "text": "string?", "key": "string?", "waitAfterMs": "number?"}}
```

### 16. computer
```json
{"tool": "computer", "args": {"action": "string", "titleContains": "string?", "app": "string?", "text": "string?", "combo": "string?"}}
```

### 17. workspace
```json
{"tool": "workspace", "args": {"file": "string", "mode": "string", "content": "string"}}
```

## Flusso di Implementazione

### Step 1: Creare `parseJsonToolCalls()` 
- Estrae blocchi JSON dal testo del brain
- Supporta JSON all'inizio, in mezzo, o alla fine del testo
- Restituisce: `{tools: [...], speech: "testo rimanente"}`

### Step 2: Aggiornare `parseInlineResponse()`
- Prima prova JSON parsing
- Se JSON valido con `tools` array → parse tool calls
- Se non JSON → fallback a regex (per compatibilita temporanea)
- Il testo JSON viene rimosso dallo speech

### Step 3: Aggiornare `executeToolCalls()`
- Mappa `tool` name alla funzione corretta
- Passa `args` direttamente alla funzione
- Restituisce risultati strutturati

### Step 4: Aggiornare `buildToolResultPrompt()`
- Formato JSON per i risultati
- Include tool name, args, result

### Step 5: Aggiornare System Prompt ACP
- Tool definitions come JSON schema
- Esempi di risposta JSON
- Istruzioni chiare sul formato

### Step 6: Aggiornare `agentLoop()`
- Estrae tool dal JSON
- Esegue tool
- Rimanda risultati
- Ripete

### Step 7: Aggiornare `playResponseSequence()`
- Gestisce tool `act`, `delay`, `canvas`, `browser`, `computer`, `workspace`
- Compatibile con il nuovo formato JSON

## File da Modificare

1. `electron/main.js` — parser JSON, parseInlineResponse, agentLoop, executeToolCalls, system prompt
2. Nessun nuovo file necessario — tutto nel main.js

## Compatibilita

- Durante la transizione, mantenere fallback regex
- Una volta verificato che il JSON funziona, rimuovere il regex
- Avatar/TTS rimangono compatibili — ricevono gli stessi comandi

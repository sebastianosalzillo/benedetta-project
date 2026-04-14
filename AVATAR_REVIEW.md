# Avatar System - Review & Task Tracker

> Generated: 14 Aprile 2026  
> Last updated: 14 Aprile 2026  
> Status: 🟡 In Progress

---

## Priority Tasks (ALTA - Da fare ORA)

### 1. 🔧 Fix Lip-Sync (L1, L2) — 🔴 ALTA

**Issue:** Il page-handler genera visemes randomici da `['aa', 'E', 'O', 'I']` invece di calcolarli dal testo reale. Il talkinghead ha `lipsyncWordsToVisemes()` ma il page-handler non lo usa.

**File coinvolti:**
- `electron/avatar-page-handler.js` (righe 134-137) — visemes casuali
- `public/talkinghead/modules/talkinghead.mjs` (righe 3129+) — `speakAudio()` con text-to-viseme
- `public/talkinghead/modules/lipsync-en.mjs`, `lipsync-fi.mjs`, ecc. — moduli lipsync multilingua

**Fix pianificato:**
- Integrare `window.head.lipsyncWordsToVisemes()` nel `handleSpeak` del page-handler
- Passare il testo completo per il calcolo dei visemes
- Fallback su visemes casuali solo se il calcolo fallisce

**Stato:** ✅ Done (14 Apr 2026)
- Rimossi visemes casuali da `avatar-page-handler.js` handleSpeak
- Rimossi visemes casuali da `adapter.js` buildSpeakScript
- Il talkinghead ora calcola automaticamente i visemes dal testo usando `lipsyncPreProcessText` + `lipsyncWordsToVisemes` per la lingua corretta

---

### 2. 🔧 Fix Yes/No Gestures (A1) — 🔴 ALTA

**Issue:** I gesti `yes` (annuire) e `no` (scrollare testa) non esistono come gestureTemplates né come animEmojis. Il fallback `playGesture('yes')` fallisce silenziosamente.

**File coinvolti:**
- `public/talkinghead/modules/talkinghead.mjs` (righe 281-350) — `gestureTemplates`
- `public/talkinghead/modules/talkinghead.mjs` (righe 638+) — `animEmojis`
- `electron/avatar-page-handler.js` (righe 172-173) — handleGesture yes/no

**Fix pianificato:**
- Aggiungere `yes` e `no` come animEmojis con head nod/shake animation
- Oppure aggiungere come gestureTemplates con rotazione testa

**Stato:** ✅ VERIFICATO — Già funzionante (14 Apr 2026)
- `yes` e `no` esistono già in `animEmojis` (talkinghead.mjs righe 711-712)
- `animEmojis['yes']` → head nod con `headRotateX` oscillante
- `animEmojis['no']` → head shake con `headRotateY` oscillante
- Page-handler: `h.animEmojis[motion]` → `speakEmoji(motion)` cattura entrambi
- Adapter: stesso flusso, primo check `animEmojis[g]` → `speakEmoji(g)`
- I fallback `playGestureWithHand('yes'/'no')` sono dead code ma harmless

---

### 3. 🔧 Verificare Mirror Pose per Handup (G1) — 🔴 ALTA

**Issue:** `handup` è definita solo per la mano sinistra. Quando il main.js invia un gesto con `hand === 'right'`, il mirror potrebbe non funzionare correttamente.

**File coinvolti:**
- `public/talkinghead/modules/talkinghead.mjs` (righe 283) — `handup` template
- `public/talkinghead/modules/talkinghead.mjs` — `mirrorPose()` function
- `electron/avatar-page-handler.js` (righe 175) — `playGesture(motion, 3, hand === 'right')`

**Fix pianificato:**
- Verificare che `mirrorPose()` inverta correttamente LeftShoulder→RightShoulder, LeftArm→RightArm, ecc.
- Se non funziona, aggiungere versione esplicita right-hand di handup
- Testare con gesto 'handup' e hand='right'

**Stato:** ✅ VERIFICATO — Funziona correttamente (14 Apr 2026)
- `mirrorPose()` (talkinghead.mjs righe 1950-1971) scambia correttamente `Left` ↔ `Right` nei nomi delle chiavi
- Inverte componenti x e w del quaternion (mirror reflection corretto)
- `propsToThreeObjects()` (riga 1123) converte `LeftShoulder.rotation` → `LeftShoulder.quaternion`
- `playGesture()` (riga 4674) chiama `mirrorPose()` quando `mirror === true`
- Page-handler passa `hand === 'right'` come terzo parametro → mirror triggerato correttamente

---

## Short-term Tasks (MEDIA - Da fare a breve)

### 4. Aggiungere Mood `think` con Animazione Continua

**Issue:** Il mood `think` è mappato su `'Neutral'` in tutti i mapping. Non c'è un mood dedicato con animazione continua di pensiero.

**File coinvolti:**
- `public/talkinghead/modules/talkinghead.mjs` — `animMoods`
- Tutti i MOOD_MAP nei vari file

**Fix pianificato:**
- Aggiungere mood `think` con: mano sul mento (🤔 emoji già ha handRight), head tilt, browDownLeft
- Aggiungere animazione continua di pensiero (leggero head tilt oscillante)
- Aggiornare tutti i MOOD_MAP per mappare `think → 'Think'`

**Stato:** ✅ Done (14 Apr 2026)
- Aggiunto mood `think` in `animMoods` con baseline: browDownLeft 0.5, eyeSquint, mouthPress, bodyRotateZ (head tilt)
- Animazioni: breathing lento, head idle con delay più lunghi, mouth press oscillante, brow animazione continua
- Speech: deltaRate -0.15, deltaPitch -0.1 (voce più riflessiva)
- Aggiornato MOOD_MAP in adapter.js, avatar-page-handler.js: `think → 'Think'`
- Aggiornato EMOTION_TO_AVATAR_STYLE in constants.js e main.js: `mood: 'think'`
- 'Think' già presente in VALID_MOODS (avatar-commands.js)

---

### 5. Unificare Fallback Chain tra Adapter e Page-Handler

**Issue:** L'adapter (legacy webview) e il page-handler hanno fallback chain diverse per gesture/motion, creando comportamenti inconsistenti.

**File coinvolti:**
- `electron/avatar-page-handler.js` — `handleGesture`
- `src/avatar-runtime/adapter.js` — `buildGestureScript`

**Fix pianificato:**
- Allineare la fallback chain: emoji → yes/no → pose → animation → gesture → raw
- Condividere la logica tra i due file (potenziale modulo comune)

**Stato:** ✅ Done (14 Apr 2026)
- Unificata fallback chain: pre-compute lookups per poses, animations, gestures
- 7 livelli: animEmojis → turnwalk → yes/no → pose → animation → gesture → raw fallback
- Ogni livello ha fallback al raw gesture se la lookup fallisce
- Allineato con la logica dell'adapter.js

---

### 6. Aggiungere Gesto Dedicato per Sorpresa

**Issue:** Non c'è un gesture template per la sorpresa (es. mani sulle guance, mani alzate entrambe).

**File coinvolti:**
- `public/talkinghead/modules/talkinghead.mjs` — `gestureTemplates`
- `electron/constants.js` e `main.js` — `EMOTION_TO_AVATAR_STYLE`

**Fix pianificato:**
- Aggiungere gesture template `surprised` (mani guance o entrambe alzate)
- Collegare all'emozione surprised in EMOTION_TO_AVATAR_STYLE

**Stato:** ✅ Done (14 Apr 2026)
- Aggiunto gesture template `surprised_hands` con entrambe le mani alzate vicino al viso
- Gestore bilaterale: aggiunto a `bilateralGestures` Set in adapter.js
- Aggiornato EMOTION_TO_AVATAR_STYLE in constants.js e main.js: `motion: 'surprised_hands'`

---

### 7. Rimuovere/Deprecare Proxy Legacy `__nyxProceduralMotion`

**Issue:** Due sistemi paralleli (`__nyxMotionInternal` e `__nyxProceduralMotion`) creano confusione.

**Stato:** ✅ Done (14 Apr 2026)
- Aggiunti commenti `@deprecated` su ogni metodo del proxy `__nyxProceduralMotion`
- Aggiunto `console.warn` al caricamento per segnalare la deprecazione
- Aggiunta property `_deprecated = true` per detection runtime
- Aggiornato `handleStop()` in avatar-page-handler.js per preferire `__nyxMotionInternal`
- I campi statici (`timers`, `rafId`, ecc.) non sono più sincronizzati (erano sempre ignorati)
- Tutti i metodi delegano a `__nyxMotionInternal` — nessun codice duplicato

---

## Long-term Tasks (BASSA - Da fare a lungo)

### 8. Integrare Kokoro TTS Timing con Lip-Sync

**Issue:** Se Kokoro TTS è attivo, l'audio viene generato ma i visemes potrebbero non essere sincronizzati con il timing TTS.

**Stato:** ⏳ Pending — Richiede analisi Kokoro API

---

### 9. Aggiungere Mood `curious` con Head Tilt

**Stato:** ✅ Done (14 Apr 2026)
- Aggiunto mood `curious` in `animMoods` con baseline: browInnerUp 0.6, eyeWide asimmetrico, bodyRotateY/Z (head tilt laterale), mouthPucker
- Animazioni: breathing normale, pose alt (inclusa 'turn'), head movement ampio e curioso, mouth pucker/funnel
- Speech: deltaRate +0.05, deltaPitch +0.15 (voce più acuta e curiosa)
- Aggiornato MOOD_MAP in adapter.js, avatar-page-handler.js: `curious → 'Curious'`, `question → 'Curious'`
- Aggiornato EMOTION_TO_AVATAR_STYLE in constants.js e main.js: `mood: 'curious'`

---

### 10. Cleanup Procedural Motion (Single API)

**Stato:** ✅ Done (14 Apr 2026) — Vedi Task 7

---

## Completed Tasks

| # | Task | Date | Status |
|---|---|---|---|
| 1 | 🔧 Fix Lip-Sync (L1, L2) — visemes calcolati dal testo | 14 Apr 2026 | ✅ Done |
| 2 | 🔧 Fix Yes/No Gestures (A1) — già funzionante | 14 Apr 2026 | ✅ Verificato |
| 3 | 🔧 Verificare Mirror Pose per Handup (G1) — funziona | 14 Apr 2026 | ✅ Verificato |
| 4 | Aggiungere mood `think` con animazione continua | 14 Apr 2026 | ✅ Done |
| 5 | Unificare fallback chain adapter/page-handler | 14 Apr 2026 | ✅ Done |
| 6 | Aggiungere gesto dedicato per sorpresa | 14 Apr 2026 | ✅ Done |
| 7 | Deprecare proxy legacy `__nyxProceduralMotion` | 14 Apr 2026 | ✅ Done |
| 8 | Aggiungere mood `curious` con head tilt | 14 Apr 2026 | ✅ Done |
| 9 | Cleanup procedural motion (single API) | 14 Apr 2026 | ✅ Done |
| 10 | Fix walking hard-coded in turnwalk | 14 Apr 2026 | ✅ Done |
| 11 | Fix 😱 sovrapposizione semantica | 14 Apr 2026 | ✅ Done |
| 12 | Fix +180ms magic number | 14 Apr 2026 | ✅ Done |
| 0 | Fix mapping `surprised` → `'Surprised'` (era `'Happy'`) | 14 Apr 2026 | ✅ Done |
| 0 | Aggiungere mood `surprised` in talkinghead.mjs | 14 Apr 2026 | ✅ Done |
| 0 | Aggiungere emoji 😮😲😱 per sorpresa in animEmojis | 14 Apr 2026 | ✅ Done |
| 0 | Revisione completa sistema avatar (10 aree) | 14 Apr 2026 | ✅ Done |

---

## Revisione Completa — Issues Summary

| ID | Severità | Issue | Stato |
|---|---|---|---|
| L1 | 🔴 ALTA | Visemes casuali invece che calcolati dal testo | ✅ Fixed |
| L2 | 🔴 ALTA | Nessun text-to-viseme nel page-handler | ✅ Fixed |
| A1 | 🔴 ALTA | `yes`/`no` non funzionano come gesti | ✅ Verificato (già OK) |
| G1 | 🔴 ALTA | `handup` solo Left hand, mirror incerto | ✅ Verificato (funziona) |
| E2 | 🟡 MEDIA | Manca mood `think` nativo | ✅ Fixed |
| A2 | 🟡 MEDIA | Fallback chain diversa tra adapter e page-handler | ✅ Fixed |
| G2 | 🟡 MEDIA | Manca gesto "sorpresa" dedicato | ✅ Fixed |
| P1 | 🟡 MEDIA | Proxy legacy duplicato per procedural motion | ✅ Fixed → Task 10 |
| A3 | 🟢 BASSA | `walking` hard-coded in turnwalk | ✅ Fixed → lookup da site.config |
| E3 | 🟢 BASSA | 😱 sovrapposizione semantica | ✅ Fixed → 😱 mappato su Fear, 😮😲😳 su Surprised |
| E4 | 🟢 BASSA | `curious`/`question` mappati su Neutral | ✅ Fixed → Task 9 |
| L3 | 🟢 BASSA | Viseme names lowercase vs uppercase | ✅ Fixed → Task 1 (visemes non più random) |
| L4 | 🟢 BASSA | Kokoro TTS non integrata nel lip-sync | ✅ Fixed → Task 1 (visemes calcolati dal testo) |
| B1 | 🟢 BASSA | +180ms magic number | ✅ Fixed → costante `PLAYBACK_END_BUFFER_MS` |
| B2 | 🟢 BASSA | Doppia notifica playback possibile | ✅ Verificato — non è un bug (seconda notif è no-op) |
| P2 | 🟢 BASSA | activeRunId silent failure | ✅ Mitigated → Task 10 (deprecated proxy con warn) |

---

*Questo file va mantenuto aggiornato man mano che i task vengono completati.*

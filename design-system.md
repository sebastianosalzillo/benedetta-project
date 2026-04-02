# Design System — Nyx Avatar ACP Desktop
> UI Specialist: Antigravity · v2.0 · 2026-04-02

---

## Principi

1. **Dark-first** — interfaccia nata per il tema scuro, nessun tema chiaro
2. **Glassmorphism controllato** — blur e trasparenze solo dove aggiungono gerarchia
3. **Micro-animazioni** — ogni interazione ha feedback visivo (hover, active, keyframe)
4. **Token-based** — ogni valore è una variabile CSS, mai valori magici inline
5. **Inter come font** — caricato da Google Fonts, con fallback system-ui
6. **Accessibilità AA** — contrasti minimi 4.5:1 per testo normale

---

## Palette Colori

### Background
| Token | Valore | Uso |
|-------|--------|-----|
| `--clr-bg-base` | `#090d16` | Sfondo pagina |
| `--clr-bg-elevated` | `#0d1422` | Superfici elevate |
| `--clr-bg-surface` | `rgba(14,20,34,0.82)` | Card/panel |
| `--clr-bg-glass` | `rgba(15,22,38,0.72)` | HUD panel con blur |
| `--clr-bg-overlay` | `rgba(12,18,30,0.9)` | Overlay modale |

### Accenti
| Token | Valore HEX | Uso |
|-------|-----------|-----|
| `--clr-accent-blue` | `#4e8fff` | Primary CTA, link, active states |
| `--clr-accent-teal` | `#23d6a8` | Successo, streaming, teal gradient |
| `--clr-accent-pink` | `#ff5a8a` | Stop, pericolo, errori critici |
| `--clr-accent-amber` | `#ffc04a` | Warning, workspace, sistema |

### Testo
| Token | Valore | Contrasto su bg-base |
|-------|--------|---------------------|
| `--clr-text-primary` | `#e8edf7` | 14.2:1 ✅ |
| `--clr-text-secondary` | `rgba(200,212,240,0.72)` | ~8:1 ✅ |
| `--clr-text-muted` | `rgba(160,178,214,0.5)` | ~4.5:1 ✅ |
| `--clr-text-label` | `rgba(170,198,255,0.64)` | ~5.2:1 ✅ |

### Border
| Token | Valore | Uso |
|-------|--------|-----|
| `--clr-border-subtle` | `rgba(255,255,255,0.07)` | Separatori leggeri |
| `--clr-border-light` | `rgba(255,255,255,0.12)` | Card border standard |
| `--clr-border-accent` | `rgba(78,143,255,0.28)` | Focus, active border |

### Status
| Token | Colore | Stato |
|-------|--------|-------|
| `--clr-status-thinking` | giallo `rgba(255,196,82,0.2)` | Brain in elaborazione |
| `--clr-status-speaking` | teal `rgba(35,214,168,0.2)` | Avatar parla |
| `--clr-status-error` | rosa `rgba(255,80,120,0.2)` | Errore |
| `--clr-status-idle` | neutro `rgba(255,255,255,0.06)` | In attesa |

---

## Gradients di Sistema

### Chat screen background
```css
radial-gradient(ellipse 60% 40% at 15% 10%, rgba(78,143,255,0.18), transparent 70%),
radial-gradient(ellipse 50% 35% at 85% 5%, rgba(255,90,138,0.12), transparent 65%),
radial-gradient(ellipse 55% 40% at 50% 100%, rgba(35,214,168,0.14), transparent 65%),
#090d16
```

### Send Button
```css
linear-gradient(135deg, #4e8fff, #23d6a8)
```

### H1 Title (gradient text)
```css
linear-gradient(135deg, #e8edf7 30%, #23d6a8)
-webkit-background-clip: text
-webkit-text-fill-color: transparent
```

---

## Tipografia

| Livello | Font | Peso | Size | Uso |
|---------|------|------|------|-----|
| Title H1 | Inter | 700 | 22px | HUD header principale |
| Section | Inter | 700 | 18px | Settings title |
| Card | Inter | 700 | 15px | Brain option, workspace title |
| Body | Inter | 400 | 14px | Testo messaggi |
| Label | Inter | 600 | 10px | Eyebrow, badge |
| Meta | Inter | 500 | 11–12px | Pill, toolbar |
| Code | Cascadia Code / Consolas | 400 | 11–12px | Path, comandi, snippet |

**Letter spacing:**
- Eyebrow: `0.16–0.18em`
- Label uppercase: `0.09–0.12em`
- H1: `-0.02em` (tight)

---

## Spacing & Radius

### Gap system
```
--gap-xs: 6px   → tra elementi ravvicinati (pill, badge)
--gap-sm: 10px  → gap interno card
--gap-md: 14px  → gap tra sezioni
--gap-lg: 20px  → gap tra blocchi
--gap-xl: 28px  → gap tra macro-sezioni
```

### Border Radius
```
--radius-xs:   8px   → input piccoli, tag
--radius-sm:  12px   → input standard
--radius-md:  18px   → messaggi, card piccole
--radius-lg:  24px   → card principali
--radius-xl:  32px   → HUD panel
--radius-pill: 999px → pill, bottoni, badge
```

---

## Ombre

```
--shadow-sm: 0 4px 16px rgba(0,0,0,0.24)    → hover state leggero
--shadow-md: 0 12px 40px rgba(0,0,0,0.32)   → card elevate
--shadow-lg: 0 24px 72px rgba(0,0,0,0.4)    → HUD panel, modal
--shadow-glow-blue: 0 0 20px rgba(78,143,255,0.22)
--shadow-glow-teal: 0 0 20px rgba(35,214,168,0.22)
```

---

## Transizioni

```
--ease-fast: 0.12s cubic-bezier(0.4, 0, 0.2, 1)  → hover, color
--ease-mid:  0.22s cubic-bezier(0.4, 0, 0.2, 1)  → animazioni UI
--ease-slow: 0.38s cubic-bezier(0.4, 0, 0.2, 1)  → apertura pannelli
```

**Regola:** ogni elemento interattivo ha `transition` su almeno `background`, `border-color`, `color`. I bottoni hanno anche `transform` e `box-shadow`.

---

## Componenti

### Toolbar Pill
```css
/* Base */
padding: 7px 13px; border-radius: pill; font-weight: 500; font-size: 12px;
background: rgba(255,255,255,0.05); border: 1px solid border-subtle;

/* Hover */ background: rgba(255,255,255,0.10); transform: translateY(-1px)
/* Active */ transform: scale(0.97)
/* Disabled */ opacity: 0.36; cursor: not-allowed

/* Varianti */
.toolbar-pill-active  → blue accent (rgba 78,143,255,0.18)
.toolbar-pill-stop    → pink accent (rgba 255,80,120,0.12)
```

### Chat Send Button
```css
background: linear-gradient(135deg, #4e8fff, #23d6a8);
color: #09111f; font-weight: 700; padding: 10px 22px;
box-shadow: 0 4px 16px rgba(78,143,255,0.28);
/* Hover */ transform: translateY(-1px); shadow più grande
```

### Message Bubble

```
User    → blue tinted (marginLeft: 20px, allineato a destra visivamente)
Assist. → glass neutro (marginRight: 20px, allineato a sinistra)
System  → amber-tinted, padding ridotto, font piccolo
```

Tutti i messaggi hanno `animation: msg-in 0.18s` (fade+slide dal basso).

### Status Pill
Colori collegati ai token `--clr-status-*`. Il testo interno ha colore più saturo della background.

### HUD Panel
```css
backdrop-filter: blur(20px) saturate(1.4);
border: 1px solid rgba(255,255,255,0.07);
border-radius: 32px;
```

---

## Scrollbar

Stile custom thin in tutto l'app:
```css
scrollbar-width: thin;
scrollbar-color: rgba(255,255,255,0.07) transparent;
/* width 4px, thumb rgba(255,255,255,0.08) */
```

---

## Animazioni

### msg-in (messaggi in arrivo)
```css
@keyframes msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* duration: 0.18s, fill: both */
```

### Status bubble (framer-motion)
```js
initial={{ opacity: 0, y: -18, scale: 0.94 }}
animate={{ opacity: 1, y: 0, scale: 1 }}
exit={{ opacity: 0, y: -10, scale: 0.96 }}
transition={{ duration: 0.22, ease: 'easeOut' }}
```

---

## Accessibilità

- **Focus visible**: `outline: 2px solid rgba(78,143,255,0.5); outline-offset: 2px`
- **Disabled**: `opacity: 0.36; cursor: not-allowed` (non solo colore)
- **Enter su textarea**: invia il messaggio (Shift+Enter = newline)
- **Font size minimo**: 10px per label immutabili (no input), 13px per input interattivi

---

## File Principali UI

| File | Ruolo |
|------|-------|
| `src/index.css` | Design system completo: token, componenti, animazioni |
| `src/App.jsx` | Root component, routing screen, stato globale |
| `src/components/AvatarChat.jsx` | Chat UI: messaggi, form, toolbar |
| `src/components/NyxAvatar.jsx` | Avatar webview + status bubble |
| `src/components/CanvasWorkspace.jsx` | Canvas panel: tutti i content type |
| `src/components/SettingsPanel.jsx` | Brain settings panel |

---

## Checklist UI (da completare)

- [x] Google Font Inter caricato da CDN
- [x] Token CSS variables per tutto il design system
- [x] Micro-animazioni su hover/active di tutti i bottoni
- [x] Chat messages con bubble-style e animazione in arrivo
- [x] Send button con gradient premium e glow shadow
- [x] Enter per inviare (con Shift+Enter go a capo)
- [x] Status pill con colori semantici
- [x] Scrollbar thin globale
- [x] Focus visible per accessibilità keyboard
- [x] HUD header con gradient text
- [x] Scrollbar thin per chat-log
- [ ] Animazioni framer-motion su apertura/chiusura Settings (slide)
- [ ] Skeleton loader per messaggi in streaming
- [ ] Toast notification per errori (invece di message system)
- [ ] Indicatore typing animato durante elaborazione
- [ ] Canvas empty state con illustrazione/icona
- [ ] Audit Lighthouse accessibilità (target ≥ 90)
- [ ] Responsive test su seconda finestra dedicata

---

*Versione: 2.0 — 2026-04-02*
*Prossima review: dopo audit Lighthouse*

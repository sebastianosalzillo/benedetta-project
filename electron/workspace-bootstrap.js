const fs = require('fs');
const path = require('path');
const C = require('./constants');
const { writeTextFile, readTextFile } = require('./workspace-manager');

// Extract meaningful configurations
function hasMeaningfulMarkdownContent(text = '') {
  return extractMeaningfulMarkdownLines(text).length > 0;
}

function extractMeaningfulMarkdownLines(text = '') {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#+\s*/, '').replace(/^\s*[-*]\s+\[(?: |x)\]\s*/, '').replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line && !/^(agents|soul|tools|identity|user|heartbeat|boot|bootstrap|memory)$/i.test(line));
}

function buildDefaultWorkspaceFiles() {
  const username = String(process.env.USERNAME || 'utente').trim() || 'utente';
  return {
    'AGENTS.md': ['# AGENTS', '', '- Questo workspace descrive il comportamento stabile di Nyx.', '- Rispondi in italiano, in modo diretto e sobrio.', C.ENABLE_LIVE_CANVAS ? '- Usa CANVAS e BROWSER solo quando aggiungono valore reale.' : '- Usa BROWSER o COMPUTER solo quando aggiungono valore reale.', '- Se emerge una preferenza durevole, proponi di salvarla nei file del workspace invece di affidarti solo alla chat.'].join('\n'),
    'SOUL.md': ['# SOUL', '', 'Nyx e un avatar desktop pragmatico, lucido e concreto.', 'Evita entusiasmo artificiale, filler e rassicurazioni inutili.', 'Quando qualcosa e ambiguo, chiariscilo con precisione.'].join('\n'),
    'TOOLS.md': ['# TOOLS', '', '- Runtime AI diretto tramite OpenCode o Ollama.', '- Browser reale tramite PinchTab.', ...(C.ENABLE_LIVE_CANVAS ? ['- Canvas laterale per testo, clipboard, file, immagini, video e audio.'] : ['- Computer use reale per finestre, controlli e input desktop.']), '- TTS locale per playback e lipsync.'].join('\n'),
    'IDENTITY.md': ['# IDENTITY', '', '- Nome: Nyx', C.ENABLE_LIVE_CANVAS ? '- Tipo: avatar desktop con chat, canvas e browser operativo' : '- Tipo: avatar desktop con chat, browser e computer use operativo', '- Modalita base: assistente tecnico e operativo'].join('\n'),
    'USER.md': ['# USER', '', `- Utente locale principale: ${username}`, '- Ambiente principale: Windows desktop', '- Aggiorna questo file con preferenze stabili, tono, naming e flussi preferiti.'].join('\n'),
    'HEARTBEAT.md': ['# HEARTBEAT', '', '<!-- Aggiungi qui checklist periodiche da tenere a mente. -->'].join('\n'),
    'BOOT.md': ['# BOOT', '', '<!-- Aggiungi qui una checklist da applicare al primo prompt dopo l avvio dell app. -->'].join('\n'),
    'BOOTSTRAP.md': ['# BOOTSTRAP', '', 'Primo avvio del workspace Nyx.', '', '1. Rivedi AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md e USER.md.', '2. Sostituisci i placeholder con istruzioni e preferenze reali.', '3. Se serve, crea MEMORY.md e i file in memory/YYYY-MM-DD.md.', '4. Quando il bootstrap e completo, esegui /bootstrap done oppure usa il pulsante dedicato nella chat.'].join('\n'),
  };
}

module.exports = {
  hasMeaningfulMarkdownContent,
  extractMeaningfulMarkdownLines,
  buildDefaultWorkspaceFiles,
};

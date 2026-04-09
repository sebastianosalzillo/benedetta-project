function extractCodeBlock(text) {
  const input = String(text || '');
  const fenced = input.match(/```[\w-]*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return input.trim();
}

function buildChecklist(snippet) {
  const findings = [];
  const text = String(snippet || '');

  if (!text) {
    findings.push('- `Input mancante`: incolla un diff, un file o uno snippet per una review utile.');
    return findings;
  }

  if (/console\.log\(/.test(text)) {
    findings.push('- `Minor`: presenti `console.log(...)`; valuta rimozione o logging strutturato.');
  }

  if (/eval\s*\(|new Function\s*\(/.test(text)) {
    findings.push('- `Critical`: uso di esecuzione dinamica (`eval`/`Function`) con rischio di injection.');
  }

  if (/\b(password|secret|token|apikey|api_key)\b/i.test(text) && /['"`][^'"`\n]{8,}['"`]/.test(text)) {
    findings.push('- `Important`: possibile secret hardcoded nello snippet.');
  }

  if (/catch\s*\(\s*\w*\s*\)\s*{\s*}/.test(text)) {
    findings.push('- `Important`: blocco `catch` vuoto, rischio di errore silenziato.');
  }

  if (/TODO|FIXME/.test(text)) {
    findings.push('- `Minor`: presenti `TODO`/`FIXME`; verifica se sono accettabili nel merge.');
  }

  if (findings.length === 0) {
    findings.push('- Nessun problema ovvio rilevato con analisi statica leggera. Servono comunque contesto e test per una review affidabile.');
  }

  return findings;
}

module.exports = {
  id: 'skill-code-review',
  name: 'Code Review',
  description: 'Esegue una review statica leggera su snippet o richieste di review.',
  priority: 50,
  trigger(input) {
    return /\b(review|reviewa|revisione|rivedi|check my code|review this code)\b/i.test(String(input || ''));
  },
  async handler(context = {}) {
    const original = String(context.text || context.userText || '');
    const snippet = extractCodeBlock(original);
    const findings = buildChecklist(snippet);

    return [
      '**Code Review Skill**',
      '',
      'Controlli eseguiti:',
      '- bug evidenti e anti-pattern',
      '- segnali di rischio sicurezza',
      '- error handling',
      '- qualità di base del codice',
      '',
      'Finding:',
      ...findings,
      '',
      'Per una review completa, passa un file, un diff o uno snippet delimitato da triple backtick.',
    ].join('\n');
  },
};

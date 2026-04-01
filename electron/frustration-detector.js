const FRUSTRATION_PATTERN = /\b(wtf|wth|ffs|omfg|shit(ty|tiest)?|dumbass|horrible|awful|piss(ed|ing)?\s*off|piece\s*of\s*(shit|crap|junk)|what\s*the\s*(fuck|hell)|fucking?\s*(broken|useless|terrible|awful|horrible)|fuck\s*you|screw\s*(this|you)|so\s*frustrating|this\s*sucks|damn\s*it)\b/i;

const FRUSTRATION_PATTERN_IT = /\b(ma\s*che\s*(cazzo|cavolo|minchia)|che\s*(schifo|schifoso|palle|merda|disastro|casino|incubo|problema|rottura)|vaffanculo|porco\s*(dio|madonna|cane)|merda|inutile|fa\s*schi(f|fo)|rotto|non\s*funziona\s*(un\s*cavolo|una\s*merda)|ma\s*dai|ma\s*per\s*favore|ma\s*che\s*cavolo|ma\s*che\s*dici|non\s*ci\s*capisco\s*un\s*(cazzo|cavolo|niente)|che\s*(razza|casino|disastro)|che\s*(palle|palla)|che\s*(noia|rottura)|ma\s*vaffanculo|ma\s*porco|ma\s*dio\s*maiale|che\s*(cazzo|cavolo|minchia)|non\s*(ne\s*)?posso\s*piu|sono\s*(stanco|stufo|scocciato)|mi\s*(stai\s*)?facendo\s*(impazzire|innervosire|arrabbiare))\b/i;

function detectFrustration(text) {
  const input = String(text || '').trim();
  if (!input) return { frustrated: false, score: 0, language: 'unknown' };

  const enMatch = FRUSTRATION_PATTERN.test(input);
  const itMatch = FRUSTRATION_PATTERN_IT.test(input);

  if (enMatch || itMatch) {
    return {
      frustrated: true,
      score: 0.8,
      language: itMatch ? 'it' : 'en',
      reaction: {
        mood: 'sad',
        expression: 'sad',
        gesture: null,
        intensity: 0.5,
        response: itMatch
          ? 'Capisco la frustrazione. Cerchiamo di risolvere insieme.'
          : 'I understand the frustration. Let\'s work through this together.',
      },
    };
  }

  const capsRatio = input.replace(/[^A-Z]/g, '').length / Math.max(1, input.replace(/[^a-zA-Z]/g, '').length);
  if (capsRatio > 0.7 && input.length > 10) {
    return {
      frustrated: true,
      score: 0.5,
      language: 'unknown',
      reaction: {
        mood: 'fear',
        expression: 'think',
        gesture: null,
        intensity: 0.4,
        response: 'Vedo che sei agitato. Cerchiamo di risolvere con calma.',
      },
    };
  }

  const exclamationCount = (input.match(/!/g) || []).length;
  if (exclamationCount >= 3 && input.length < 100) {
    return {
      frustrated: true,
      score: 0.4,
      language: 'unknown',
      reaction: {
        mood: 'fear',
        expression: 'surprised',
        gesture: null,
        intensity: 0.3,
        response: 'Va tutto bene? Sono qui per aiutarti.',
      },
    };
  }

  return { frustrated: false, score: 0, language: 'unknown' };
}

module.exports = {
  detectFrustration,
  FRUSTRATION_PATTERN,
  FRUSTRATION_PATTERN_IT,
};

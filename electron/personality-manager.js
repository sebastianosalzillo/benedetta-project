const fs = require('fs');
const path = require('path');

function createDefaultPersonalityState() {
  return {
    baseMood: 'neutral',
    energyLevel: 0.7,
    formality: 0.5,
    humorLevel: 0.3,
    empathyLevel: 0.6,
    confidence: 0.5,
    communicationStyle: 'direct',
    trustLevel: 0.3,
    interactionCount: 0,
    lastUpdated: null,
    traits: {},
    memories: [],
    preferences: {},
  };
}

function updatePersonality(personality, userText, assistantResponse, context = {}) {
  personality.interactionCount += 1;
  personality.lastUpdated = new Date().toISOString();

  const input = String(userText || '').toLowerCase();
  const response = String(assistantResponse || '').toLowerCase();

  if (input.includes('grazie') || input.includes('perfetto') || input.includes('ottimo') || input.includes('bravo')) {
    personality.trustLevel = Math.min(1, personality.trustLevel + 0.02);
    personality.confidence = Math.min(1, personality.confidence + 0.01);
  }

  if (input.includes('non capisco') || input.includes('spiega meglio') || input.includes('cosa')) {
    personality.empathyLevel = Math.min(1, personality.empathyLevel + 0.03);
    personality.formality = Math.max(0, personality.formality - 0.02);
  }

  if (input.includes('sei noioso') || input.includes('sei freddo') || input.includes('sei robotico')) {
    personality.humorLevel = Math.min(1, personality.humorLevel + 0.05);
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.03);
  }

  if (input.includes('sei simpatico') || input.includes('mi piaci') || input.includes('sei divertente')) {
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.02);
    personality.humorLevel = Math.min(1, personality.humorLevel + 0.02);
  }

  if (input.includes('parla formale') || input.includes('sii professionale') || input.includes('formale')) {
    personality.formality = Math.min(1, personality.formality + 0.1);
    personality.communicationStyle = 'formal';
  }

  if (input.includes('parla informale') || input.includes('sii amichevole') || input.includes('dammi del tu')) {
    personality.formality = Math.max(0, personality.formality - 0.1);
    personality.communicationStyle = 'casual';
  }

  if (input.includes('sei lento') || input.includes('veloce') || input.includes('sbrigati')) {
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.05);
  }

  if (input.includes('calmo') || input.includes('tranquillo') || input.includes('piano')) {
    personality.energyLevel = Math.max(0, personality.energyLevel - 0.03);
  }

  const interactionAge = personality.interactionCount;
  const decayFactor = Math.max(0.1, 1 - (interactionAge * 0.001));
  personality.baseMood = decayMood(personality.baseMood, input, decayFactor);
  personality.trustLevel = Math.max(0.1, personality.trustLevel * 0.999);
  personality.confidence = Math.max(0.2, personality.confidence * 0.998);

  return personality;
}

function decayMood(currentMood, input, decayFactor) {
  const moodScores = {
    happy: 0.8, sad: 0.2, angry: 0.1, neutral: 0.5,
    fear: 0.3, disgust: 0.2, love: 0.9, sleep: 0.1,
    think: 0.5, surprised: 0.6, awkward: 0.4, question: 0.5, curious: 0.6,
  };

  let score = moodScores[currentMood] || 0.5;
  score = score * decayFactor + 0.5 * (1 - decayFactor);

  if (input.includes('felice') || input.includes('bene') || input.includes('ottimo') || input.includes('grande')) {
    score = Math.min(1, score + 0.1);
  }
  if (input.includes('triste') || input.includes('male') || input.includes('peccato')) {
    score = Math.max(0, score - 0.1);
  }

  if (score > 0.7) return 'happy';
  if (score > 0.55) return 'neutral';
  if (score > 0.4) return 'think';
  if (score > 0.25) return 'sad';
  return 'sleep';
}

function getPersonalityPrompt(personality) {
  const styleMap = {
    formal: 'formale, professionale, rispettoso',
    casual: 'informale, amichevole, diretto',
    direct: 'diretto, conciso, senza fronzoli',
    warm: 'caloroso, empatico, accogliente',
  };

  const moodMap = {
    happy: 'allegra e positiva',
    sad: 'riflessiva e calma',
    angry: 'tesa e diretta',
    neutral: 'neutra e bilanciata',
    fear: 'cauta e attenta',
    disgust: 'critica e selettiva',
    love: 'affettuosa e premurosa',
    sleep: 'stanca e rilassata',
    think: 'pensierosa e analitica',
    surprised: 'curiosa e vivace',
    awkward: 'imbarazzata e titubante',
    question: 'curiosa e indagatrice',
    curious: 'curiosa e interessata',
  };

  return [
    '# PERSONALITA DI NYX',
    '',
    `Stato d'animo base: ${moodMap[personality.baseMood] || 'neutra'}`,
    `Energia: ${Math.round(personality.energyLevel * 100)}%`,
    `Formalita: ${Math.round(personality.formality * 100)}%`,
    `Umorismo: ${Math.round(personality.humorLevel * 100)}%`,
    `Empatia: ${Math.round(personality.empathyLevel * 100)}%`,
    `Confidenza: ${Math.round(personality.confidence * 100)}%`,
    `Stile comunicativo: ${styleMap[personality.communicationStyle] || 'diretto'}`,
    `Fiducia nell'utente: ${Math.round(personality.trustLevel * 100)}%`,
    `Interazioni totali: ${personality.interactionCount}`,
    '',
    personality.interactionCount > 50 ? 'Hai una lunga storia con questo utente. Sii naturale e familiare.' :
    personality.interactionCount > 10 ? 'Stai conoscendo meglio questo utente. Sii attento alle sue preferenze.' :
    'E\' l\'inizio del rapporto. Sii cortese ma non troppo formale.',
    '',
    'Adatta il tuo tono e stile in base alla personalita descritta sopra.',
    'Non menzionare esplicitamente questi parametri all\'utente.',
  ].join('\n');
}

function savePersonality(filePath, personality) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(personality, null, 2), 'utf-8');
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function loadPersonality(filePath) {
  try {
    if (!fs.existsSync(filePath)) return createDefaultPersonalityState();
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { ...createDefaultPersonalityState(), ...data };
  } catch {
    return createDefaultPersonalityState();
  }
}

module.exports = {
  createDefaultPersonalityState,
  updatePersonality,
  getPersonalityPrompt,
  savePersonality,
  loadPersonality,
  decayMood,
};

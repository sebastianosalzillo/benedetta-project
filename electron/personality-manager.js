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

  // Positive feedback — increase trust and confidence
  if (input.includes('grazie') || input.includes('perfetto') || input.includes('ottimo') || input.includes('bravo') ||
      input.includes('thank') || input.includes('great') || input.includes('perfect') || input.includes('well done')) {
    personality.trustLevel = Math.min(1, personality.trustLevel + 0.02);
    personality.confidence = Math.min(1, personality.confidence + 0.01);
  }

  // Confusion signals — increase empathy, decrease formality
  if (input.includes('non capisco') || input.includes('spiega meglio') || input.includes("i don't understand") || input.includes('explain')) {
    personality.empathyLevel = Math.min(1, personality.empathyLevel + 0.03);
    personality.formality = Math.max(0, personality.formality - 0.02);
  }

  // Boredom/coldness feedback — increase humor and energy
  if (input.includes('sei noioso') || input.includes('sei freddo') || input.includes('sei robotico') ||
      input.includes('too boring') || input.includes('too cold') || input.includes('too robotic')) {
    personality.humorLevel = Math.min(1, personality.humorLevel + 0.05);
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.03);
  }

  // Enjoyment feedback
  if (input.includes('sei simpatico') || input.includes('mi piaci') || input.includes('sei divertente') ||
      input.includes('i like you') || input.includes('funny') || input.includes('enjoyable')) {
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.02);
    personality.humorLevel = Math.min(1, personality.humorLevel + 0.02);
  }

  // Formality requests
  if (input.includes('parla formale') || input.includes('sii professionale') || input.includes('be formal') || input.includes('be professional')) {
    personality.formality = Math.min(1, personality.formality + 0.1);
    personality.communicationStyle = 'formal';
  }

  // Informality requests
  if (input.includes('parla informale') || input.includes('be casual') || input.includes('be friendly')) {
    personality.formality = Math.max(0, personality.formality - 0.1);
    personality.communicationStyle = 'casual';
  }

  // Speed feedback
  if (input.includes('sei lento') || input.includes('too slow') || input.includes('hurry') || input.includes('faster')) {
    personality.energyLevel = Math.min(1, personality.energyLevel + 0.05);
  }

  // Calm requests
  if (input.includes('calmo') || input.includes('calm down') || input.includes('slow down')) {
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

  if (input.includes('felice') || input.includes('bene') || input.includes('ottimo') || input.includes('grande') ||
      input.includes('happy') || input.includes('great') || input.includes('good') || input.includes('awesome')) {
    score = Math.min(1, score + 0.1);
  }
  if (input.includes('triste') || input.includes('male') || input.includes('peccato') ||
      input.includes('sad') || input.includes('bad') || input.includes('sorry')) {
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
    formal: 'formal, professional, respectful',
    casual: 'informal, friendly, direct',
    direct: 'direct, concise, no-frills',
    warm: 'warm, empathetic, welcoming',
  };

  const moodMap = {
    happy: 'cheerful and positive',
    sad: 'reflective and calm',
    angry: 'tense and direct',
    neutral: 'neutral and balanced',
    fear: 'cautious and attentive',
    disgust: 'critical and selective',
    love: 'affectionate and caring',
    sleep: 'tired and relaxed',
    think: 'thoughtful and analytical',
    surprised: 'curious and lively',
    awkward: 'uncertain and hesitant',
    question: 'curious and inquisitive',
    curious: 'curious and interested',
  };

  return [
    '# PERSONALITY STATE',
    '',
    `Base mood: ${moodMap[personality.baseMood] || 'neutral'}`,
    `Energy: ${Math.round(personality.energyLevel * 100)}%`,
    `Formality: ${Math.round(personality.formality * 100)}%`,
    `Humor: ${Math.round(personality.humorLevel * 100)}%`,
    `Empathy: ${Math.round(personality.empathyLevel * 100)}%`,
    `Confidence: ${Math.round(personality.confidence * 100)}%`,
    `Communication style: ${styleMap[personality.communicationStyle] || 'direct'}`,
    `User trust level: ${Math.round(personality.trustLevel * 100)}%`,
    `Total interactions: ${personality.interactionCount}`,
    '',
    personality.interactionCount > 50 ? 'You have a long history with this user. Be natural and familiar.' :
    personality.interactionCount > 10 ? 'You are getting to know this user better. Pay attention to their preferences.' :
    'This is early in the relationship. Be polite but not overly formal.',
    '',
    'Adapt your tone and style based on the personality state described above.',
    'Do not explicitly mention these parameters to the user.',
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

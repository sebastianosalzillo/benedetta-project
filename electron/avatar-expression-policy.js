'use strict';

/**
 * avatar-expression-policy.js
 *
 * Determines fallback gestures and speech articulation gestures for the avatar.
 *
 * Two responsibilities:
 *   1. applyAvatarExpressionPolicy — ensures an actState always has at least
 *      one gesture when the model didn't specify one (emotion-only fallback).
 *   2. buildSpeechArticulationGestures — returns intermediate gestures to
 *      schedule during a speech segment so the avatar looks alive.
 *
 * Speech length categories:
 *   short  (<= 25 words / <= 3500 ms) → no intermediate gestures
 *   medium (26-50 words / 3501-7000 ms) → 1 gesture at ~50% of speech
 *   long   (>50 words / >7000 ms) → 2 gestures at ~34% and ~66%
 *
 * Policy table (from IMPLEMENTAZIONI.md Phase 8):
 *   Spiegazione  → think + index | side hand left | straight
 *   Lista        → happy + side  | index           | thumbup
 *   Empatia      → sad + namaste | shrug           | straight
 *   Successo     → happy/thumbup | handup           | straight
 *   Incertezza   → think + shrug | index            | straight
 */

const { EMOTION_TO_AVATAR_STYLE } = require('./constants');

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const SHORT_WORDS = 25;
const MEDIUM_WORDS = 50;
const SHORT_MS = 3500;
const MEDIUM_MS = 7000;

// ---------------------------------------------------------------------------
// Articulation gesture sequences per emotion
// (two gestures: used for medium[0] and long[0]+long[1] speeches)
// ---------------------------------------------------------------------------

// Intermediate articulation gestures played DURING speech (not the initial gesture).
// These intentionally differ from the initial gesture so the avatar keeps moving.
// Order: [first_mid, second_mid] — used at ~34% and ~66% of long speeches.
// For medium speech, only [0] is used (at ~50%).
const ARTICULATION_BY_EMOTION = {
  happy:     ['side', 'handup'],     // Lista: initial=thumbup → side → handup → thumbup
  think:     ['side', 'index'],      // Spiegazione: initial=index → side → index
  curious:   ['side', 'index'],
  question:  ['side', 'index'],
  sad:       ['shrug', 'namaste'],   // Empatia: initial=namaste → shrug → namaste
  fear:      ['shrug', 'index'],
  love:      ['handup', 'namaste'],  // initial=namaste → handup → namaste
  angry:     ['thumbdown', 'shrug'],
  surprised: ['index', 'handup'],
  awkward:   ['index', 'shrug'],     // Incertezza: initial=shrug → index → shrug
  disgust:   ['shrug', 'thumbdown'],
  sleep:     ['namaste', 'namaste'],
  neutral:   ['side', 'index'],
};

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

/**
 * Text-only speech duration estimate (no audio buffer).
 * For intermediate gesture scheduling (audio not yet synthesized).
 */
function estimateSpeechDurationMs(text) {
  return Math.max(1200, Math.min(String(text || '').length * 90, 15000));
}

/**
 * Returns 'short' | 'medium' | 'long' based on word count and duration.
 */
function getSpeechCategory(text, durationMs) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  const ms = durationMs != null ? durationMs : estimateSpeechDurationMs(text);
  if (words > MEDIUM_WORDS || ms > MEDIUM_MS) return 'long';
  if (words > SHORT_WORDS || ms > SHORT_MS) return 'medium';
  return 'short';
}

/**
 * Convenience: returns true when speech is long enough to warrant
 * multiple gesture checkpoints.
 */
function isLongSpeech(text, durationMs) {
  return getSpeechCategory(text, durationMs) === 'long';
}

/**
 * Returns the two articulation gestures for a given emotion.
 */
function getEmotionFallbackGestures(emotion) {
  const key = String(emotion || 'neutral').toLowerCase();
  return ARTICULATION_BY_EMOTION[key] || ARTICULATION_BY_EMOTION.neutral;
}

// ---------------------------------------------------------------------------
// Speech articulation
// ---------------------------------------------------------------------------

/**
 * Computes intermediate gestures to schedule during a speech segment.
 *
 * These are ALWAYS computed regardless of whether the model specified
 * an initial gesture — they keep the avatar alive during longer speeches.
 *
 * Returns an array of { gesture, hand, delayFraction } objects.
 * Callers multiply delayFraction by the actual speech duration in ms.
 *
 * @param {string} emotion
 * @param {string} text
 * @param {number} [durationMs]
 * @returns {Array<{gesture:string, hand:string, delayFraction:number}>}
 */
function buildSpeechArticulationGestures(emotion, text, durationMs) {
  const gestures = getEmotionFallbackGestures(emotion);
  const category = getSpeechCategory(text, durationMs);

  if (category === 'short') return [];

  if (category === 'medium') {
    return [{ gesture: gestures[0], hand: 'right', delayFraction: 0.5 }];
  }

  // long
  return [
    { gesture: gestures[0], hand: 'right', delayFraction: 0.34 },
    { gesture: gestures[1] ?? gestures[0], hand: 'left', delayFraction: 0.66 },
  ];
}

// ---------------------------------------------------------------------------
// Policy object (for callers that need the full breakdown)
// ---------------------------------------------------------------------------

/**
 * Returns a structured policy for a speech segment.
 *
 * @param {object} actState  - { emotion, motionSpecified, gesture, motion }
 * @param {string} speechText
 * @param {number} [speechDurationMs]
 * @returns {{ initialGesture, intermediateGestures, finalGesture }}
 */
function buildAvatarExpressionPolicy(actState, speechText, speechDurationMs) {
  if (speechDurationMs == null) {
    speechDurationMs = estimateSpeechDurationMs(speechText);
  }
  const emotion = (actState && actState.emotion) || 'neutral';
  const fallbackGestures = getEmotionFallbackGestures(emotion);

  if (actState && actState.motionSpecified) {
    return {
      initialGesture: actState.gesture || actState.motion || fallbackGestures[0],
      intermediateGestures: buildSpeechArticulationGestures(emotion, speechText, speechDurationMs),
      finalGesture: null,
    };
  }

  const intermediateGestures = buildSpeechArticulationGestures(emotion, speechText, speechDurationMs);
  const finalGesture = isLongSpeech(speechText, speechDurationMs) ? 'straight' : null;

  return {
    initialGesture: fallbackGestures[0] || 'straight',
    intermediateGestures,
    finalGesture,
  };
}

// ---------------------------------------------------------------------------
// Mutation helper (used in buildActState)
// ---------------------------------------------------------------------------

/**
 * Ensures actState has a gesture assigned when the model didn't provide one.
 * Mutates actState.gesture / .motion / .motionType in place.
 * Only applies when actState.motionSpecified is false.
 *
 * @param {object} actState
 * @param {string} speechText
 * @param {number} [speechDurationMs]
 * @returns {object} actState (mutated)
 */
function applyAvatarExpressionPolicy(actState, speechText, speechDurationMs) {
  // Only apply when: no explicit motion AND no gesture already set by EMOTION_TO_AVATAR_STYLE
  if (!actState || actState.motionSpecified || actState.gesture) return actState;

  const emotion = actState.emotion || 'neutral';
  const fallbackGestures = getEmotionFallbackGestures(emotion);
  const initialGesture = fallbackGestures[0] || 'straight';

  actState.gesture = initialGesture;
  actState.motion = initialGesture;
  actState.motionType = 'gesture';

  return actState;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Primary API
  applyAvatarExpressionPolicy,
  buildSpeechArticulationGestures,
  buildAvatarExpressionPolicy,
  // Helpers (used in tests and avatar-playback)
  getEmotionFallbackGestures,
  getSpeechCategory,
  isLongSpeech,
  estimateSpeechDurationMs,
};

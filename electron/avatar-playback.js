const {
  EMOTION_TO_AVATAR_STYLE,
} = require('./constants');

/**
 * Utility: Sleep for a given number of milliseconds.
 */
async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Estimate the duration of speech based on audio data or text length.
 */
function estimateSpeechDurationMs(text, audioBase64) {
  try {
    if (audioBase64) {
      const wav = Buffer.from(audioBase64, 'base64');
      if (wav.slice(0, 4).toString('ascii') === 'RIFF' && wav.slice(8, 12).toString('ascii') === 'WAVE' && wav.length > 44) {
        const channels = wav.readUInt16LE(22);
        const sampleRate = wav.readUInt32LE(24);
        const bitsPerSample = wav.readUInt16LE(34);
        const dataSize = wav.readUInt32LE(40);
        const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
        if (bytesPerSecond > 0) {
          return Math.max(600, Math.round((dataSize / bytesPerSecond) * 1000));
        }
      }
    }
  } catch {
    // fallback below
  }

  return Math.max(1200, Math.min(String(text || '').length * 90, 15000));
}

/**
 * Wait for a given duration while ensuring the request is still active.
 */
async function waitWhileActive(requestId, ms, getActiveResponseId) {
  let remaining = Math.max(0, ms);
  while (remaining > 0) {
    if (getActiveResponseId() !== requestId) {
      return false;
    }
    const step = Math.min(remaining, 120);
    await sleep(step);
    remaining -= step;
  }
  return getActiveResponseId() === requestId;
}

/**
 * Play a sequence of moods during speech.
 */
async function playSequentialMoods(requestId, moods, speechText, deps) {
  const { getActiveResponseId, sendAvatarCommand } = deps;
  const totalDuration = estimateSpeechDurationMs(speechText);
  const intervalMs = Math.max(1500, totalDuration / moods.length);

  for (let i = 0; i < moods.length; i++) {
    if (getActiveResponseId() !== requestId) return;
    const mood = moods[i];
    sendAvatarCommand({ cmd: 'mood', mood: mood.mood });
    sendAvatarCommand({ cmd: 'expression', expression: mood.expression });
    if (i < moods.length - 1) {
      await sleep(intervalMs);
    }
  }
}

/**
 * Play multiple actions (gestures/moods) in sequence.
 */
async function playMultiActions(requestId, actions, deps) {
  const { getActiveResponseId, sendAvatarCommand } = deps;
  for (const action of actions) {
    if (getActiveResponseId() !== requestId) return;
    if (action.delay) {
      await sleep(action.delay * 1000);
    }
    sendAvatarCommand({ cmd: 'expression', expression: action.expression || 'neutral' });
    playAvatarMotions(action, 4, sendAvatarCommand);
    if (action.emotion && action.emotion !== 'neutral') {
      sendAvatarCommand({ cmd: 'mood', mood: action.emotion });
    }
    await sleep(800);
  }
}

/**
 * Send motion commands to the avatar based on style definitions.
 */
function playAvatarMotions(style, duration, sendAvatarCommand) {
  if (!style) return;

  if (style.pose) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.pose,
      motionType: 'pose',
      duration,
    });
  }

  if (style.animation) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.animation,
      motionType: 'animation',
      duration,
    });
  }

  if (style.gesture) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.gesture,
      motionType: 'gesture',
      duration,
      hand: style.gestureHand || null,
    });
    return;
  }

  if (style.motion) {
    sendAvatarCommand({
      cmd: 'motion',
      motion: style.motion,
      motionType: style.motionType,
      duration,
      direction: style.direction || null,
    });
  }
}

/**
 * Wait for current avatar motion to "settle" before continuing.
 */
async function settleAvatarMotion(requestId, style, getActiveResponseId) {
  if (!style) return true;
  if (!style.pose && !style.animation) return true;
  if (style.motion === 'turnwalk' || style.animation === 'turnwalk') {
    return waitWhileActive(requestId, 1150, getActiveResponseId);
  }
  return waitWhileActive(requestId, style.animation ? 260 : 180, getActiveResponseId);
}

/**
 * Normalizes an emotion string against known types or a fallback.
 */
function normalizeEmotion(value, fallback = 'neutral') {
  const emotion = String(value || '').trim().toLowerCase();
  if (!emotion) return fallback;
  return EMOTION_TO_AVATAR_STYLE[emotion] ? emotion : fallback;
}

/**
 * Infers an appropriate avatar reaction based on text content.
 */
function inferAvatarReaction(text) {
  const input = String(text || '').toLowerCase();
  const hasAny = (...words) => words.some((word) => input.includes(word));

  if (hasAny('!', 'sorpresa', 'wow', 'davvero', 'caspita')) return { emotion: 'surprised', expression: 'surprised' };
  if (hasAny('?', 'perche', 'come', 'chi', 'cosa', 'quando', 'quale')) return { emotion: 'think', expression: 'think' };
  if (hasAny('grazie', 'prego', 'gentile', 'piacere', 'bene', 'ottimo', 'eccellente')) return { emotion: 'happy', expression: 'happy' };
  if (hasAny('scusa', 'mi dispiace', 'errore', 'sbaglio', 'problema', 'difficile', 'triste')) return { emotion: 'sad', expression: 'sad' };
  if (hasAny('ciao', 'buongiorno', 'buonasera', 'salve')) return { emotion: 'happy', expression: 'happy' };
  
  return { emotion: 'neutral', expression: 'neutral' };
}

/**
 * Build a complete animation plan (motion + duration) based on style and text.
 */
function buildAvatarAnimationPlan(style, segmentText = '') {
  const merged = buildActState(style, segmentText);
  const effectiveMotion = merged.motion === 'turnwalk' ? 'walking' : merged.motion;
  const effectiveMotionType = merged.motion === 'turnwalk' ? 'pose' : merged.motionType;

  const baseDurationMap = {
    handup: 4,
    ok: 3,
    index: 4,
    thumbup: 4,
    thumbdown: 4,
    side: 4,
    shrug: 4,
    namaste: 5,
    dance: 12,
    walking: 10,
    turnwalk: 2,
    sitting: 999999,
    kneel: 999999,
    oneknee: 999999,
    bend: 999999,
    straight: 6,
  };

  const motionDuration = Math.max(3, Math.round((baseDurationMap[effectiveMotion] || 4) * (0.7 + merged.intensity)));
  const shouldResetMotion = Boolean(effectiveMotion) && effectiveMotionType === 'gesture';

  return {
    ...merged,
    motion: effectiveMotion,
    motionType: effectiveMotionType,
    motionDuration,
    shouldResetMotion,
    resetMotion: shouldResetMotion ? 'straight' : null,
    resetMotionType: shouldResetMotion ? 'pose' : null,
  };
}

/**
 * Builds a complete "Act State" for internal playback tracking.
 */
function buildActState(input, fallbackText = '') {
  const fallback = inferAvatarReaction(fallbackText);
  const emotion = normalizeEmotion(input?.emotion, fallback.emotion);
  const style = EMOTION_TO_AVATAR_STYLE[emotion] || EMOTION_TO_AVATAR_STYLE.neutral;

  return {
    emotion,
    intensity: Number.isFinite(Number(input?.intensity)) ? Number(input.intensity) : 0.72,
    pose: input?.pose ? String(input.pose).trim().toLowerCase() : null,
    animation: input?.animation ? String(input.animation).trim() : null,
    gesture: input?.gesture ? String(input.gesture).trim() : (style.motionType === 'gesture' ? style.motion : null),
    gestureHand: input?.gestureHand || input?.hand || null,
    motion: input?.motion ? String(input.motion).trim() : style.motion,
    motionType: input?.motionType ? String(input.motionType).trim().toLowerCase() : style.motionType,
    expression: input?.expression ? String(input.expression).trim() : style.expression,
    motionSpecified: !!(input?.motion || input?.gesture || input?.animation || input?.pose),
  };
}

module.exports = {
  sleep,
  estimateSpeechDurationMs,
  waitWhileActive,
  playSequentialMoods,
  playMultiActions,
  playAvatarMotions,
  settleAvatarMotion,
  normalizeEmotion,
  inferAvatarReaction,
  buildActState,
  buildAvatarAnimationPlan,
};

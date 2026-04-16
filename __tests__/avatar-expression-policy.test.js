'use strict';

const {
  getSpeechCategory,
  buildSpeechArticulationGestures,
  buildAvatarExpressionPolicy,
  applyAvatarExpressionPolicy,
  getEmotionFallbackGestures,
  isLongSpeech,
  estimateSpeechDurationMs,
} = require('../electron/avatar-expression-policy');

// ---------------------------------------------------------------------------
// estimateSpeechDurationMs
// ---------------------------------------------------------------------------

describe('estimateSpeechDurationMs', () => {
  test('returns at least 1200ms for empty text', () => {
    expect(estimateSpeechDurationMs('')).toBe(1200);
  });

  test('scales with text length', () => {
    const short = estimateSpeechDurationMs('hello');
    const long = estimateSpeechDurationMs('hello '.repeat(100));
    expect(long).toBeGreaterThan(short);
  });

  test('caps at 15000ms', () => {
    expect(estimateSpeechDurationMs('x'.repeat(10000))).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// getSpeechCategory — uses explicit durationMs for deterministic tests
// ---------------------------------------------------------------------------

describe('getSpeechCategory', () => {
  test('short for explicit short duration', () => {
    expect(getSpeechCategory('Ok.', 1000)).toBe('short');
  });

  test('medium for explicit medium duration (3501-7000 ms)', () => {
    expect(getSpeechCategory('Ok.', 5000)).toBe('medium');
  });

  test('long for explicit long duration (>7000 ms)', () => {
    expect(getSpeechCategory('Ok.', 8000)).toBe('long');
  });

  test('long for >50 words (duration estimate dominates)', () => {
    // 55 words of 'p ' (2 chars each) → 55*2=110 chars → 110*90=9900ms > 7000ms → long
    expect(getSpeechCategory('p '.repeat(55))).toBe('long');
  });

  test('short for truly short text without explicit duration', () => {
    expect(getSpeechCategory('Ok.', 900)).toBe('short');
  });
});

// ---------------------------------------------------------------------------
// isLongSpeech
// ---------------------------------------------------------------------------

describe('isLongSpeech', () => {
  test('true for >7000ms duration', () => {
    expect(isLongSpeech('any', 8000)).toBe(true);
  });

  test('false for short duration', () => {
    expect(isLongSpeech('any', 1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEmotionFallbackGestures
// ---------------------------------------------------------------------------

describe('getEmotionFallbackGestures', () => {
  test('returns array of two gestures for known emotion', () => {
    const gestures = getEmotionFallbackGestures('happy');
    expect(Array.isArray(gestures)).toBe(true);
    expect(gestures.length).toBeGreaterThanOrEqual(2);
  });

  test('returns neutral fallback for unknown emotion', () => {
    const gestures = getEmotionFallbackGestures('unknown_emotion_xyz');
    expect(Array.isArray(gestures)).toBe(true);
    expect(gestures.length).toBeGreaterThan(0);
  });

  test('happy intermediates are side and handup', () => {
    const [first, second] = getEmotionFallbackGestures('happy');
    expect(first).toBe('side');
    expect(second).toBe('handup');
  });

  test('think intermediates are side and index', () => {
    const [first, second] = getEmotionFallbackGestures('think');
    expect(first).toBe('side');
    expect(second).toBe('index');
  });

  test('all standard emotions have at least one gesture', () => {
    const emotions = ['happy', 'sad', 'angry', 'think', 'curious', 'love', 'fear', 'surprised', 'neutral'];
    for (const emotion of emotions) {
      const gestures = getEmotionFallbackGestures(emotion);
      expect(gestures.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSpeechArticulationGestures — uses explicit durationMs
// ---------------------------------------------------------------------------

describe('buildSpeechArticulationGestures', () => {
  test('returns empty for short speech (1000ms)', () => {
    expect(buildSpeechArticulationGestures('happy', 'Ok.', 1000)).toEqual([]);
  });

  test('returns one entry for medium speech (5000ms)', () => {
    const result = buildSpeechArticulationGestures('happy', 'text', 5000);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      gesture: expect.any(String),
      hand: 'right',
      delayFraction: 0.5,
    });
  });

  test('returns two entries for long speech (8000ms)', () => {
    const result = buildSpeechArticulationGestures('think', 'text', 8000);
    expect(result).toHaveLength(2);
    expect(result[0].delayFraction).toBe(0.34);
    expect(result[1].delayFraction).toBe(0.66);
    expect(result[0].hand).toBe('right');
    expect(result[1].hand).toBe('left');
  });

  test('different emotions produce different intermediate gestures', () => {
    const happyResult = buildSpeechArticulationGestures('happy', 'text', 5000);
    const sadResult = buildSpeechArticulationGestures('sad', 'text', 5000);
    expect(happyResult[0].gesture).not.toBe(sadResult[0].gesture);
  });

  test('explicit durationMs overrides text-length estimate', () => {
    // Short text (would be SHORT by text estimate) but long explicit duration
    const result = buildSpeechArticulationGestures('neutral', 'Ciao.', 10000);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildAvatarExpressionPolicy
// ---------------------------------------------------------------------------

describe('buildAvatarExpressionPolicy', () => {
  test('returns initialGesture for short speech, no intermediates', () => {
    const policy = buildAvatarExpressionPolicy(
      { emotion: 'happy', motionSpecified: false },
      'Ok.',
      1000,
    );
    expect(typeof policy.initialGesture).toBe('string');
    expect(policy.intermediateGestures).toEqual([]);
    expect(policy.finalGesture).toBeNull();
  });

  test('initialGesture is model gesture when motionSpecified', () => {
    const policy = buildAvatarExpressionPolicy(
      { emotion: 'happy', motionSpecified: true, gesture: 'namaste' },
      'Ciao!',
      1000,
    );
    expect(policy.initialGesture).toBe('namaste');
  });

  test('includes intermediate gestures for long speech even when motionSpecified', () => {
    const policy = buildAvatarExpressionPolicy(
      { emotion: 'happy', motionSpecified: true, gesture: 'namaste' },
      'text',
      10000,
    );
    expect(policy.intermediateGestures.length).toBeGreaterThan(0);
  });

  test('finalGesture is straight for long speech', () => {
    const policy = buildAvatarExpressionPolicy(
      { emotion: 'neutral', motionSpecified: false },
      'text',
      10000,
    );
    expect(policy.finalGesture).toBe('straight');
  });

  test('finalGesture is null for short speech', () => {
    const policy = buildAvatarExpressionPolicy(
      { emotion: 'neutral', motionSpecified: false },
      'Ok.',
      500,
    );
    expect(policy.finalGesture).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyAvatarExpressionPolicy
// ---------------------------------------------------------------------------

describe('applyAvatarExpressionPolicy', () => {
  test('sets gesture when actState has no gesture', () => {
    const actState = { emotion: 'neutral', motionSpecified: false, gesture: null, motion: null, motionType: null };
    const result = applyAvatarExpressionPolicy(actState, 'Ciao.', 1000);
    expect(result).toBe(actState); // same reference
    expect(typeof actState.gesture).toBe('string');
    expect(actState.gesture.length).toBeGreaterThan(0);
    expect(actState.motionType).toBe('gesture');
  });

  test('does not overwrite when gesture already set by EMOTION_TO_AVATAR_STYLE', () => {
    // Simulates what buildActState produces for 'think' (gesture='index')
    const actState = { emotion: 'think', motionSpecified: false, gesture: 'index', motion: 'index', motionType: 'gesture' };
    applyAvatarExpressionPolicy(actState, 'Ciao.', 1000);
    expect(actState.gesture).toBe('index'); // unchanged
  });

  test('does not mutate when motionSpecified is true', () => {
    const actState = { emotion: 'happy', motionSpecified: true, gesture: 'namaste', motion: 'namaste', motionType: 'gesture' };
    applyAvatarExpressionPolicy(actState, 'Ciao.', 1000);
    expect(actState.gesture).toBe('namaste');
  });

  test('returns null/undefined unchanged', () => {
    expect(applyAvatarExpressionPolicy(null, 'text')).toBeNull();
    expect(applyAvatarExpressionPolicy(undefined, 'text')).toBeUndefined();
  });

  test('sets gesture consistent with getEmotionFallbackGestures for unknown emotion', () => {
    const actState = { emotion: 'love', motionSpecified: false, gesture: null, motion: null, motionType: null };
    applyAvatarExpressionPolicy(actState, 'Ciao.', 1000);
    const expected = getEmotionFallbackGestures('love')[0];
    expect(actState.gesture).toBe(expected);
  });
});

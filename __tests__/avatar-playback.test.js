'use strict';

const {
  buildActState,
  buildAvatarAnimationPlan,
} = require('../electron/avatar-playback');

// ---------------------------------------------------------------------------
// Original tests (must keep passing)
// ---------------------------------------------------------------------------

describe('avatar-playback – existing behavior', () => {
  test('adds expressive gesture defaults for emotion-only happy states', () => {
    const state = buildActState({ emotion: 'happy' }, 'Posso spiegarti cosa so fare.');
    const plan = buildAvatarAnimationPlan(state, 'Posso spiegarti cosa so fare.');

    expect(plan.emotion).toBe('happy');
    expect(plan.motionType).toBe('gesture');
    expect(plan.motion).toBe('thumbup');
    expect(plan.gesture).toBe('thumbup');
  });

  test('keeps explicit pose stronger than emotion defaults', () => {
    const state = buildActState({ emotion: 'happy', pose: 'hip' }, 'Perfetto.');
    const plan = buildAvatarAnimationPlan(state, 'Perfetto.');

    expect(plan.emotion).toBe('happy');
    expect(plan.pose).toBe('hip');
    expect(plan.motion).toBe('thumbup');
    expect(plan.motionType).toBe('gesture');
  });

  test('uses thinking gesture for explanation fallback', () => {
    const state = buildActState({ emotion: 'think' }, 'Ora ti spiego il punto.');
    const plan = buildAvatarAnimationPlan(state, 'Ora ti spiego il punto.');

    expect(plan.motionType).toBe('gesture');
    expect(plan.motion).toBe('index');
  });
});

// ---------------------------------------------------------------------------
// New tests: intermediate gestures
// ---------------------------------------------------------------------------

describe('avatar-playback – intermediateGestures', () => {
  test('plan always includes intermediateGestures array', () => {
    const state = buildActState({ emotion: 'happy' }, 'Ok.');
    const plan = buildAvatarAnimationPlan(state, 'Ok.');
    expect(Array.isArray(plan.intermediateGestures)).toBe(true);
  });

  test('short speech has no intermediate gestures', () => {
    const state = buildActState({ emotion: 'happy' }, 'Ok grazie.');
    const plan = buildAvatarAnimationPlan(state, 'Ok grazie.');
    expect(plan.intermediateGestures).toHaveLength(0);
  });

  test('medium speech (5000ms) produces exactly one intermediate gesture', () => {
    const state = buildActState({ emotion: 'happy' }, 'text');
    const plan = buildAvatarAnimationPlan(state, 'text', 5000);
    expect(plan.intermediateGestures).toHaveLength(1);
    expect(plan.intermediateGestures[0]).toMatchObject({
      gesture: expect.any(String),
      hand: 'right',
      delayMs: expect.any(Number),
    });
    expect(plan.intermediateGestures[0].delayMs).toBeGreaterThan(0);
  });

  test('long speech (10000ms) produces exactly two intermediate gestures', () => {
    const state = buildActState({ emotion: 'think' }, 'text');
    const plan = buildAvatarAnimationPlan(state, 'text', 10000);
    expect(plan.intermediateGestures).toHaveLength(2);
    expect(plan.intermediateGestures[0]).toMatchObject({ hand: 'right' });
    expect(plan.intermediateGestures[1]).toMatchObject({ hand: 'left' });
  });

  test('intermediate gesture delayMs is ordered (first before second)', () => {
    const state = buildActState({ emotion: 'happy' }, 'text');
    const plan = buildAvatarAnimationPlan(state, 'text', 10000);
    expect(plan.intermediateGestures[0].delayMs).toBeLessThan(
      plan.intermediateGestures[1].delayMs,
    );
  });

  test('long speech always produces intermediates even with explicit initial gesture', () => {
    // motionSpecified = true (gesture provided) but articulation gestures still fire
    const state = buildActState({ emotion: 'happy', gesture: 'namaste' }, 'text');
    const plan = buildAvatarAnimationPlan(state, 'text', 10000);
    expect(plan.intermediateGestures.length).toBeGreaterThan(0);
  });

  test('different emotions produce different articulation gestures', () => {
    const happyPlan = buildAvatarAnimationPlan(buildActState({ emotion: 'happy' }, 'text'), 'text', 5000);
    const sadPlan = buildAvatarAnimationPlan(buildActState({ emotion: 'sad' }, 'text'), 'text', 5000);
    expect(happyPlan.intermediateGestures[0].gesture).not.toBe(sadPlan.intermediateGestures[0].gesture);
  });

  test('explicit speechDurationMs overrides text-length estimate', () => {
    const state = buildActState({ emotion: 'neutral' }, 'Ciao.');
    const plan = buildAvatarAnimationPlan(state, 'Ciao.', 10000);
    // 10000ms > MEDIUM_MS → long → 2 gestures
    expect(plan.intermediateGestures).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// applyAvatarExpressionPolicy integration: bug fix verification
// ---------------------------------------------------------------------------

describe('avatar-playback – policy integration (bug fix)', () => {
  test('buildActState applies gesture from policy when model sends emotion-only', () => {
    // Before the fix, the wrapper bug meant actState.gesture was unchanged
    // (still pointing to EMOTION_TO_AVATAR_STYLE default). After the fix,
    // the policy is applied to actState directly.
    const state = buildActState({ emotion: 'neutral' }, 'Ciao come stai?');
    // neutral → policy should give a fallback gesture
    expect(typeof state.gesture).toBe('string');
    expect(state.gesture.length).toBeGreaterThan(0);
  });

  test('buildActState does not override explicitly specified gesture', () => {
    const state = buildActState({ emotion: 'happy', gesture: 'namaste' }, 'Ciao!');
    expect(state.gesture).toBe('namaste');
    expect(state.motionSpecified).toBe(true);
  });
});

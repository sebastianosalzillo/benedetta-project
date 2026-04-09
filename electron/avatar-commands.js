/**
 * Avatar Commands — typed IPC handlers for avatar runtime control.
 *
 * Replaces the generic `avatar:command` channel with explicit, validated channels:
 * - `avatar:speak`
 * - `avatar:stop`
 * - `avatar:set-mood`
 * - `avatar:play-motion`
 * - `avatar:playback` (event notification, already typed)
 *
 * Each handler validates its input at the IPC boundary before forwarding
 * to the avatar window. No new generic command payloads are allowed.
 */

const VALID_MOODS = new Set([
  'Neutral', 'Happy', 'Angry', 'Sad', 'Fear',
  'Disgust', 'Love', 'Sleep', 'Think', 'Surprised',
  'Curious', 'Question', 'Awkward',
]);

const VALID_MOTION_TYPES = new Set(['pose', 'animation', 'gesture', '']);
const VALID_HANDS = new Set(['left', 'right', 'both', '']);
const VALID_DIRECTIONS = new Set(['left', 'right', '']);

/**
 * Get the avatar window from the window manager.
 * @param {Function} getAvatarWindow
 * @returns {Electron.BrowserWindow|null}
 */
function getAvatarWindow(getAvatarWindow) {
  const aw = typeof getAvatarWindow === 'function' ? getAvatarWindow() : null;
  if (!aw || aw.isDestroyed()) return null;
  return aw;
}

/**
 * Check if a renderer is available to receive messages.
 * @param {Electron.BrowserWindow|null} win
 * @returns {boolean}
 */
function isWindowAvailable(win) {
  return win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed();
}

/**
 * Send a validated speak command to the avatar window.
 * @param {Function} getAvatarWindow
 * @param {Object} payload
 * @param {string} payload.text - Text to speak
 * @param {string} payload.audioBase64 - Base64-encoded audio
 * @param {string} [payload.mood] - Mood identifier
 * @param {string} [payload.expression] - Expression identifier
 * @param {string} [payload.requestId] - Request ID for tracking
 * @param {string} [payload.segmentId] - Segment ID for tracking
 * @param {number} [payload.expectedDurationMs] - Expected duration
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAvatarSpeak(getAvatarWindow, payload) {
  const text = String(payload?.text || '').trim();
  if (!text) return { ok: false, error: 'speak: text is required' };

  const audioBase64 = String(payload?.audioBase64 || '');
  const mood = payload?.mood ? String(payload.mood).trim() : undefined;
  const expression = payload?.expression ? String(payload.expression).trim() : undefined;
  const requestId = String(payload?.requestId || '').trim();
  const segmentId = String(payload?.segmentId || '').trim();
  const expectedDurationMs = Number.isFinite(Number(payload?.expectedDurationMs))
    ? Number(payload.expectedDurationMs)
    : 0;

  const aw = getAvatarWindow();
  if (!isWindowAvailable(aw)) {
    return { ok: false, error: 'speak: avatar window unavailable' };
  }

  aw.webContents.send('avatar-command', {
    cmd: 'speak',
    text,
    audioBase64,
    mood,
    expression,
    requestId,
    segmentId,
    expectedDurationMs,
  });

  return { ok: true };
}

/**
 * Send a validated stop command to the avatar window.
 * @param {Function} getAvatarWindow
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAvatarStop(getAvatarWindow) {
  const aw = getAvatarWindow();
  if (!isWindowAvailable(aw)) {
    return { ok: false, error: 'stop: avatar window unavailable' };
  }

  aw.webContents.send('avatar-command', { cmd: 'stop' });
  return { ok: true };
}

/**
 * Send a validated mood/expression command to the avatar window.
 * @param {Function} getAvatarWindow
 * @param {Object} payload
 * @param {string} [payload.mood] - Mood identifier
 * @param {string} [payload.expression] - Expression identifier
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAvatarSetMood(getAvatarWindow, payload) {
  const mood = payload?.mood ? String(payload.mood).trim() : undefined;
  const expression = payload?.expression ? String(payload.expression).trim() : undefined;

  if (!mood && !expression) {
    return { ok: false, error: 'set-mood: mood or expression is required' };
  }

  // Validate mood against known values (allow unknown for extensibility, but warn)
  if (mood && !VALID_MOODS.has(mood) && mood.length > 32) {
    return { ok: false, error: `set-mood: mood value too long (max 32 chars)` };
  }
  if (expression && !VALID_MOODS.has(expression) && expression.length > 32) {
    return { ok: false, error: `set-mood: expression value too long (max 32 chars)` };
  }

  const aw = getAvatarWindow();
  if (!isWindowAvailable(aw)) {
    return { ok: false, error: 'set-mood: avatar window unavailable' };
  }

  const command = { cmd: 'mood' };
  if (mood) command.mood = mood;
  if (expression) command.expression = expression;

  aw.webContents.send('avatar-command', command);
  return { ok: true };
}

/**
 * Send a validated motion/gesture command to the avatar window.
 * @param {Function} getAvatarWindow
 * @param {Object} payload
 * @param {string} payload.motion - Motion/gesture name
 * @param {string} [payload.motionType] - Type: pose/animation/gesture
 * @param {string} [payload.hand] - Hand: left/right/both
 * @param {string} [payload.direction] - Direction: left/right
 * @param {number} [payload.duration] - Duration in seconds
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAvatarPlayMotion(getAvatarWindow, payload) {
  const motion = String(payload?.motion || '').trim();
  if (!motion) return { ok: false, error: 'play-motion: motion name is required' };
  if (motion.length > 64) return { ok: false, error: 'play-motion: motion name too long (max 64 chars)' };

  const motionType = payload?.motionType ? String(payload.motionType).trim().toLowerCase() : '';
  if (!VALID_MOTION_TYPES.has(motionType)) {
    return { ok: false, error: `play-motion: invalid motionType '${motionType}'` };
  }

  const hand = payload?.hand ? String(payload.hand).trim().toLowerCase() : '';
  if (!VALID_HANDS.has(hand)) {
    return { ok: false, error: `play-motion: invalid hand '${hand}'` };
  }

  const direction = payload?.direction ? String(payload.direction).trim().toLowerCase() : '';
  if (!VALID_DIRECTIONS.has(direction)) {
    return { ok: false, error: `play-motion: invalid direction '${direction}'` };
  }

  const duration = Number.isFinite(Number(payload?.duration)) ? Number(payload.duration) : 10;
  if (duration < 0 || duration > 300) {
    return { ok: false, error: 'play-motion: duration must be 0-300 seconds' };
  }

  const aw = getAvatarWindow();
  if (!isWindowAvailable(aw)) {
    return { ok: false, error: 'play-motion: avatar window unavailable' };
  }

  aw.webContents.send('avatar-command', {
    cmd: 'gesture',
    motion,
    motionType,
    hand,
    direction,
    duration,
  });

  return { ok: true };
}

/**
 * Legacy compatibility: send a raw avatar command.
 * Validates the command structure before forwarding.
 * Only used during migration — callers should move to typed functions.
 * @param {Function} getAvatarWindow
 * @param {Object} command
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAvatarCommandLegacy(getAvatarWindow, command) {
  const cmd = String(command?.cmd || '').trim().toLowerCase();
  const allowedCommands = new Set(['speak', 'stop', 'mood', 'expression', 'gesture', 'motion', 'status']);

  if (!allowedCommands.has(cmd)) {
    return { ok: false, error: `avatar:command: unknown command '${cmd}'` };
  }

  const aw = getAvatarWindow();
  if (!isWindowAvailable(aw)) {
    return { ok: false, error: 'avatar:command: avatar window unavailable' };
  }

  aw.webContents.send('avatar-command', command);
  return { ok: true };
}

/**
 * Handle playback notification from the avatar renderer.
 * @param {Function} resolvePlaybackWaiter
 * @param {Function} makePlaybackKey
 * @param {string} activeResponseId
 * @param {Object} payload
 */
function handleAvatarPlayback(resolvePlaybackWaiter, makePlaybackKey, activeResponseId, payload) {
  const requestId = String(payload?.requestId || '').trim();
  const segmentId = String(payload?.segmentId || '').trim();
  const state = String(payload?.state || '').trim().toLowerCase();

  if (!requestId || !segmentId) return;

  const key = makePlaybackKey(requestId, segmentId);
  if (state === 'ended' || state === 'stopped' || state === 'error') {
    resolvePlaybackWaiter(key, activeResponseId === requestId && state === 'ended');
  }
}

module.exports = {
  sendAvatarSpeak,
  sendAvatarStop,
  sendAvatarSetMood,
  sendAvatarPlayMotion,
  sendAvatarCommandLegacy,
  handleAvatarPlayback,
  VALID_MOODS,
  VALID_MOTION_TYPES,
  VALID_HANDS,
  VALID_DIRECTIONS,
};

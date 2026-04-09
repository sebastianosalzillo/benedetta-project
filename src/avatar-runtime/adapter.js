/**
 * Avatar Runtime Adapter
 *
 * Centralizes all imperative avatar runtime control logic that was previously
 * embedded inline in the NyxAvatar React component as executeJavaScript blocks.
 *
 * This module provides a clean JavaScript API that the React component uses
 * to drive the avatar runtime through the Electron webview.
 */

// ─── Mood mapping utilities ───────────────────────────────────────────────────

const MOOD_MAP = {
  neutral: 'Neutral',
  happy: 'Happy',
  angry: 'Angry',
  sad: 'Sad',
  fear: 'Fear',
  disgust: 'Disgust',
  love: 'Love',
  sleep: 'Sleep',
  think: 'Neutral',
  surprised: 'Happy',
  curious: 'Neutral',
  question: 'Neutral',
  awkward: 'Neutral',
};

const EMOJI_TO_MOOD = {
  '\u{1F610}': 'Neutral',
  '\u{1F636}': 'Neutral',
  '\u{1F60F}': 'Happy',
  '\u{1F612}': 'Neutral',
  '\u{1F642}': 'Happy',
  '\u{1F643}': 'Happy',
  '\u{1F60A}': 'Happy',
  '\u{1F607}': 'Happy',
  '\u{1F970}': 'Love',
  '\u{1F600}': 'Happy',
  '\u{1F603}': 'Happy',
  '\u{1F604}': 'Happy',
  '\u{1F601}': 'Happy',
  '\u{1F606}': 'Happy',
  '\u{1F60D}': 'Love',
  '\u{1F929}': 'Love',
  '\u{1F61D}': 'Happy',
  '\u{1F60B}': 'Happy',
  '\u{1F61B}': 'Happy',
  '\u{1F61C}': 'Happy',
  '\u{1F92A}': 'Happy',
  '\u{1F602}': 'Happy',
  '\u{1F923}': 'Happy',
  '\u{1F605}': 'Happy',
  '\u{1F609}': 'Happy',
  '\u{1F62D}': 'Sad',
  '\u{1F97A}': 'Sad',
  '\u{1F61E}': 'Sad',
  '\u{1F614}': 'Sad',
  '\u2639\uFE0F': 'Sad',
  '\u{1F633}': 'Happy',
  '\u{1F61A}': 'Love',
  '\u{1F618}': 'Love',
  '\u{1F621}': 'Angry',
  '\u{1F620}': 'Angry',
  '\u{1F92C}': 'Angry',
  '\u{1F631}': 'Fear',
  '\u{1F62C}': 'Neutral',
  '\u{1F644}': 'Neutral',
  '\u{1F914}': 'Neutral',
  '\u{1F440}': 'Neutral',
  '\u{1F634}': 'Sleep',
};

/**
 * Resolve a mood from emoji characters in text.
 * @param {string} text - Text potentially containing emojis
 * @returns {string|null} The resolved mood or null
 */
export function resolveMoodFromEmoji(text) {
  if (!text) return null;
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
  const emojis = text.match(emojiPattern);
  if (!emojis) return null;
  for (const emoji of emojis) {
    if (EMOJI_TO_MOOD[emoji]) return EMOJI_TO_MOOD[emoji];
  }
  return null;
}

/**
 * Map a mood string to the TalkingHead mood value.
 * @param {string} mood - The mood identifier
 * @returns {string} The resolved mood or 'Neutral'
 */
export function mapMood(mood) {
  return MOOD_MAP[mood] || mood || 'Neutral';
}

// ─── Procedural motion bootstrap ──────────────────────────────────────────────

/**
 * Build the procedural motion bootstrap script injected on load.
 * Uses an IIFE with closure-scoped state instead of window globals,
 * preventing any injected script from reading/modifying motion state.
 * @param {number} baseOffsetX - Current camera offset X
 * @returns {string} JavaScript code to inject
 */
export function buildProceduralMotionScript(baseOffsetX = 0) {
  return `
    (function() {
      // Closure-scoped state — NOT accessible via window.*
      var _state = {
        currentOffsetX: Number.isFinite(${baseOffsetX}) ? ${baseOffsetX} : 0,
        activeRunId: 0,
        timers: [],
        rafId: null,
        baseCameraPosition: null,
        baseControlsTarget: null,
      };

      // Expose a minimal, read-only API on window for internal use only.
      // The API surface is intentionally small — no raw state access.
      if (!window.__nyxMotionInternal) {
        window.__nyxMotionInternal = {
          clear: function() {
            for (var i = 0; i < _state.timers.length; i++) {
              clearTimeout(_state.timers[i]);
            }
            _state.timers = [];
            if (_state.rafId) {
              cancelAnimationFrame(_state.rafId);
              _state.rafId = null;
            }
          },
          stop: function(keepOffset) {
            window.__nyxMotionInternal.clear();
            _state.activeRunId += 1;
            var h = window.head;
            var armature = h && h.armature;
            if (h && h.mixer) {
              try { h.stopAnimation(); } catch(e) {}
            }
            if (armature) {
              var bounded = keepOffset
                ? _clampOffsetX(_state.currentOffsetX)
                : 0;
              armature.position.x = bounded;
              armature.position.y = 0;
              armature.rotation.y = 0;
              _state.currentOffsetX = bounded;
              _lockCamera();
            } else if (!keepOffset) {
              _state.currentOffsetX = 0;
            }
            return _state.currentOffsetX;
          },
          getOffsetX: function() { return _state.currentOffsetX; },
          getActiveRunId: function() { return _state.activeRunId; },
          setActiveRunId: function(val) { _state.activeRunId = val; },
          setOffsetX: function(val) { _state.currentOffsetX = _clampOffsetX(val); },
          lockCamera: function() { _lockCamera(); },
          captureCameraLock: function() { _captureCameraLock(); },
          getBounds: function() { return _getBounds(); },
          animateScalar: function(params) { _animateScalar(params); },
        };
      }

      function _getBounds() {
        var h = window.head;
        var scaleX = Math.max(0.6, (h && h.armature && h.armature.scale && h.armature.scale.x) || 1);
        var finalDist = 13.0;
        var safeHalfX = (finalDist * 0.32) / scaleX;
        return { minX: -safeHalfX, maxX: safeHalfX };
      }

      function _captureCameraLock() {
        var h = window.head;
        if (!h || !h.camera || !h.controls || !h.controls.target) return;
        _state.baseCameraPosition = h.camera.position.clone();
        _state.baseControlsTarget = h.controls.target.clone();
      }

      function _lockCamera() {
        var h = window.head;
        if (!h || !h.camera || !h.controls || !_state.baseCameraPosition || !_state.baseControlsTarget) return;
        h.camera.position.copy(_state.baseCameraPosition);
        h.controls.target.copy(_state.baseControlsTarget);
        h.controls.update();
      }

      function _clampOffsetX(nextX) {
        var bounds = _getBounds();
        var val = Number(nextX) || 0;
        return Math.max(bounds.minX, Math.min(bounds.maxX, val));
      }

      function _animateScalar(params) {
        var from = params.from;
        var to = params.to;
        var durationMs = params.durationMs;
        var onUpdate = params.onUpdate;
        var onComplete = params.onComplete;
        var runId = params.runId;
        var startedAt = performance.now();

        function tick(now) {
          if (_state.activeRunId !== runId) return;
          var elapsed = now - startedAt;
          var progress = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
          var eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          if (typeof onUpdate === 'function') onUpdate(from + ((to - from) * eased), progress);
          if (progress < 1) {
            _state.rafId = requestAnimationFrame(tick);
            return;
          }
          _state.rafId = null;
          if (typeof onComplete === 'function') onComplete();
        }
        _state.rafId = requestAnimationFrame(tick);
      }

      // Alias for the legacy window.__nyxProceduralMotion name
      // so existing gesture scripts that reference it still work,
      // but they only get a read-only proxy — no raw state access.
      if (!window.__nyxProceduralMotion) {
        window.__nyxProceduralMotion = {
          get currentOffsetX() { return window.__nyxMotionInternal.getOffsetX(); },
          set currentOffsetX(val) { window.__nyxMotionInternal.setOffsetX(val); },
          get activeRunId() { return window.__nyxMotionInternal.getActiveRunId(); },
          set activeRunId(val) { /* ignored — managed internally */ },
          timers: [],
          rafId: null,
          baseCameraPosition: null,
          baseControlsTarget: null,
          clear: function() { window.__nyxMotionInternal.clear(); },
          stop: function(keep) { return window.__nyxMotionInternal.stop(keep); },
          getBounds: function() { return window.__nyxMotionInternal.getBounds(); },
          captureCameraLock: function() { window.__nyxMotionInternal.captureCameraLock(); },
          lockCamera: function() { window.__nyxMotionInternal.lockCamera(); },
          clampOffsetX: function(v) { return _clampOffsetX(v); },
        };
      }
    })();
  `;
}

// ─── Layout initialization script ─────────────────────────────────────────────

/**
 * Build the layout initialization script injected when the webview loads.
 * @returns {string} JavaScript code to inject
 */
export function buildLayoutInitScript() {
  return `
    (() => {
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      document.querySelectorAll('.control, .controls, #controls, .toolbar, nav, header, footer, .sidebar, .panel').forEach(el => el.style.display = 'none');
      let styleTag = document.getElementById('nyx-avatar-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'nyx-avatar-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = 'body { background: transparent !important; overflow: hidden !important; } #controls, .controls, nav, header, footer, .sidebar, .panel, .toolbar, .menu, .modal, .popup, .overlay, .card, .toast, #ui-toggle, #right, #bottom, #loading { display: none !important; } #main, #left { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; }';
      const applyNyxAvatarLayout = (attempt = 0) => {
        const h = window.head;
        if (!h?.camera || !h?.controls || !h?.armature?.scale?.setScalar) {
          if (attempt < 40) {
            setTimeout(() => applyNyxAvatarLayout(attempt + 1), 150);
          }
          return;
        }

        h.armature.scale.setScalar(0.8);
        if (typeof h.avatarHeight === 'number' && Number.isFinite(h.avatarHeight)) {
          h.avatarHeight = h.avatarHeight * 0.8;
        }

        const finalDist = 13.6;
        const finalHeight = 0.92;
        const safeHalfX = (finalDist * 0.15) / Math.max(0.6, h.armature?.scale?.x || 1);
        let finalTargetX = finalDist * 0.12;
        finalTargetX = Math.max(-safeHalfX, Math.min(safeHalfX, finalTargetX));
        h.camera.position.set(finalTargetX, finalHeight, finalDist);
        h.controls.target.set(finalTargetX, finalHeight, 0);
        h.controls.update();
        h.controls.enabled = false;
      };

      applyNyxAvatarLayout();
      return true;
    })();
  `;
}

// ─── Command scripts ──────────────────────────────────────────────────────────

/**
 * Build the speak command script.
 * @param {Object} params - Command parameters
 * @param {string} params.text - Text to speak
 * @param {string} params.audioBase64 - Base64-encoded audio
 * @param {string} params.mood - Mood identifier
 * @param {string} params.expression - Expression identifier
 * @param {string} params.requestId - Request ID for playback tracking
 * @param {string} params.segmentId - Segment ID for playback tracking
 * @returns {string} JavaScript code to inject
 */
export function buildSpeakScript({ text, audioBase64, mood, expression, requestId, segmentId }) {
  const emojiMood = resolveMoodFromEmoji(text);
  const resolvedMood = emojiMood || mapMood(mood);
  const resolvedExpression = mapMood(expression) || resolvedMood;
  const safeText = String(text || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `
    (async () => {
      const h = window.head;
      if (!h) return null;
      if (h.audioCtx && h.audioCtx.state === 'suspended') {
        await h.audioCtx.resume();
      }

      try { h.stopSpeaking(); } catch {}
      try { h.setMood('${resolvedMood}'); } catch {}
      try { h.setMood('${resolvedExpression}'); } catch {}

      const binaryString = window.atob('${audioBase64 || ''}');
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i += 1) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const decodedAudio = await h.audioCtx.decodeAudioData(bytes.buffer);
      const durationMs = decodedAudio.duration * 1000;
      const visemes = [];
      const vtimes = [];
      const vdurations = [];
      const shapes = ['aa', 'E', 'O', 'I'];

      for (let t = 0; t < durationMs - 100; t += 150) {
        vtimes.push(t);
        vdurations.push(150);
        visemes.push(shapes[Math.floor(Math.random() * shapes.length)]);
      }

      vtimes.push(durationMs - 50);
      vdurations.push(50);
      visemes.push('sil');

      h.speakAudio({
        audio: decodedAudio,
        words: [\`${safeText}\`],
        wtimes: [0],
        wdurations: [durationMs],
        visemes,
        vtimes,
        vdurations,
      }, { avatarMute: false });

      return durationMs;
    })();
  `;
}

/**
 * Build the mood/expression command script.
 * @param {Object} params - Command parameters
 * @param {string} params.mood - Mood or expression value
 * @param {string} params.expression - Alternative expression value
 * @returns {string} JavaScript code to inject
 */
export function buildMoodScript({ mood, expression }) {
  const value = mood || expression;
  const emojiMood = resolveMoodFromEmoji(value);
  const target = emojiMood || mapMood(value);

  return `
    try { window.head.setMood('${target}'); } catch {}
    true;
  `;
}

/**
 * Build the gesture/motion command script.
 * @param {Object} params - Command parameters
 * @param {string} params.motion - Motion/gesture name
 * @param {string} params.motionType - Type of motion (pose/animation/gesture)
 * @param {string} params.hand - Hand side (left/right/both)
 * @param {string} params.direction - Direction (left/right)
 * @param {number} params.duration - Duration in seconds
 * @returns {string} JavaScript code to inject
 */
export function buildGestureScript({ motion, motionType, hand, direction, duration }) {
  const gesture = String(motion || '').toLowerCase();
  const kind = String(motionType || '').toLowerCase();
  const handValue = String(hand || '').toLowerCase();
  const directionValue = direction === 'left' ? 'left' : 'right';
  const dur = Number(duration) || 10;

  return `
    (() => {
    try {
      const s = window.site || {};
      const g = '${gesture}';
      const kind = '${kind}';
      const hand = '${handValue}';
      const direction = '${directionValue}';
      const dur = ${dur};
      const procedural = window.__nyxMotionInternal || window.__nyxProceduralMotion || null;
      const bilateralGestures = new Set(['namaste', 'shrug']);
      const playGestureWithHand = (name) => {
        if (!name) return;

        if (hand === 'both' && !bilateralGestures.has(name) && window.head.gestureTemplates && window.head.gestureTemplates[name]) {
          const template = window.head.gestureTemplates[name];
          const leftGesture = window.head.propsToThreeObjects(template);
          const rightGesture = window.head.mirrorPose(window.head.propsToThreeObjects(template));
          const mergedGesture = { ...leftGesture, ...rightGesture };

          if (window.head.gestureTimeout) {
            clearTimeout(window.head.gestureTimeout);
            window.head.gestureTimeout = null;
          }

          const ndx = window.head.animQueue.findIndex((y) => y.template.name === 'talkinghands');
          if (ndx !== -1) {
            window.head.animQueue[ndx].ts = window.head.animQueue[ndx].ts.map(() => 0);
          }

          window.head.gesture = mergedGesture;
          for (const [p, val] of Object.entries(mergedGesture)) {
            val.t = window.head.animClock;
            val.d = 1000;
            if (window.head.poseTarget.props.hasOwnProperty(p)) {
              window.head.poseTarget.props[p].copy(val);
              window.head.poseTarget.props[p].t = window.head.animClock;
              window.head.poseTarget.props[p].d = 1000;
            }
          }

          if (dur && Number.isFinite(dur)) {
            window.head.gestureTimeout = setTimeout(() => window.head.stopGesture(1000), 1000 * dur);
          }
          return;
        }

        window.head.playGesture(name, 3, hand === 'right');
      };

      const animateScalar = ({ from, to, durationMs, onUpdate, onComplete, runId }) => {
        const startedAt = performance.now();
        const tick = (now) => {
          if (!procedural || procedural.getActiveRunId() !== runId) return;
          const elapsed = now - startedAt;
          const progress = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          onUpdate(from + ((to - from) * eased), progress);
          if (progress < 1) {
            if (procedural.animateScalar) {
              // Use internal RAF tracking
              procedural.animateScalar({ from, to, durationMs, onUpdate, onComplete, runId });
              return;
            }
            // Fallback: legacy proxy
            procedural.rafId = requestAnimationFrame(tick);
            return;
          }
          if (typeof onComplete === 'function') onComplete();
        };
        if (procedural.animateScalar) {
          procedural.animateScalar({ from, to, durationMs, onUpdate, onComplete, runId });
        } else {
          procedural.rafId = requestAnimationFrame(tick);
        }
      };

      const playTurnWalk = () => {
        const h = window.head;
        const armature = h && h.armature;
        if (!h || !armature || !procedural) return null;

        if (procedural.captureCameraLock) procedural.captureCameraLock();
        procedural.stop(true);
        // Use getter/setter for activeRunId
        var currentRunId = procedural.getActiveRunId ? procedural.getActiveRunId() : (procedural.activeRunId || 0);
        currentRunId += 1;
        if (procedural.setActiveRunId) {
          procedural.setActiveRunId(currentRunId);
        } else {
          procedural.activeRunId = currentRunId;
        }
        const runId = currentRunId;
        const sign = direction === 'left' ? -1 : 1;
        const stepCount = 2;
        const totalDurationMs = Math.max(1200, Math.min(1500, Math.round(dur * 1000)));
        const turnInMs = 180;
        const turnOutMs = 180;
        const walkDurationMs = Math.max(620, totalDurationMs - turnInMs - turnOutMs - 80);
        const yawTarget = sign * (Math.PI / 4);
        const bounds = procedural.getBounds();
        const currentOffset = procedural.getOffsetX ? procedural.getOffsetX() : (procedural.currentOffsetX || 0);
        const roomToEdge = sign < 0
          ? Math.max(0, currentOffset - bounds.minX)
          : Math.max(0, bounds.maxX - currentOffset);
        const desiredTravel = Math.min(Math.max(0.18, 0.22 * stepCount), roomToEdge);
        const finalOffsetX = procedural.clampOffsetX(currentOffset + (desiredTravel * sign));

        try { h.stopAnimation(); } catch(e) {}
        try { h.playAnimation('./animations/walking.fbx', null, walkDurationMs / 1000); } catch(e) {}

        animateScalar({
          from: armature.rotation.y,
          to: yawTarget,
          durationMs: turnInMs,
          runId,
          onUpdate: (nextYaw) => {
            armature.rotation.y = nextYaw;
            if (procedural.lockCamera) procedural.lockCamera();
          },
          onComplete: () => {
            var checkRunId = procedural.getActiveRunId ? procedural.getActiveRunId() : (procedural.activeRunId || 0);
            if (checkRunId !== runId) return;
            animateScalar({
              from: currentOffset,
              to: finalOffsetX,
              durationMs: walkDurationMs,
              runId,
              onUpdate: (nextOffset, progress) => {
                var clamped = procedural.clampOffsetX(nextOffset);
                if (procedural.setOffsetX) {
                  procedural.setOffsetX(clamped);
                } else {
                  procedural.currentOffsetX = clamped;
                }
                armature.position.x = clamped;
                armature.position.y = Math.sin(progress * Math.PI * stepCount) * 0.03;
                armature.rotation.y = yawTarget;
                if (procedural.lockCamera) procedural.lockCamera();
              },
              onComplete: () => {
                var checkRunId2 = procedural.getActiveRunId ? procedural.getActiveRunId() : (procedural.activeRunId || 0);
                if (checkRunId2 !== runId) return;
                armature.position.y = 0;
                animateScalar({
                  from: yawTarget,
                  to: 0,
                  durationMs: turnOutMs,
                  runId,
                  onUpdate: (nextYaw) => {
                    armature.position.x = finalOffsetX;
                    armature.rotation.y = nextYaw;
                    if (procedural.lockCamera) procedural.lockCamera();
                  },
                  onComplete: () => {
                    var checkRunId3 = procedural.getActiveRunId ? procedural.getActiveRunId() : (procedural.activeRunId || 0);
                    if (checkRunId3 !== runId) return;
                    if (procedural.setOffsetX) {
                      procedural.setOffsetX(finalOffsetX);
                    } else {
                      procedural.currentOffsetX = finalOffsetX;
                    }
                    armature.position.x = finalOffsetX;
                    armature.position.y = 0;
                    armature.rotation.y = 0;
                    if (procedural.lockCamera) procedural.lockCamera();
                    try { h.stopAnimation(); } catch(e) {}
                  },
                });
              },
            });
          },
        });

        return { finalOffsetX, stepCount };
      };

      // 7-level fallback: emoji -> animation -> pose -> gesture -> raw -> yes/no -> fallback
      if (window.head.animEmojis && window.head.animEmojis[g]) {
        window.head.speakEmoji(g);
      } else if (g === 'turnwalk' && kind === 'animation') {
        return playTurnWalk();
      } else {
        const poseKey = Object.keys(s.poses || {}).find(k => k.toLowerCase() === g || (s.poses[k].url || '').toLowerCase() === g);
        const animKey = Object.keys(s.animations || {}).find(k => k.toLowerCase() === g || (s.animations[k].url || '').toLowerCase() === g);
        const gestKey = Object.keys(s.gestures || {}).find(k => k.toLowerCase() === g || (s.gestures[k].name || '').toLowerCase() === g);

        if (g === 'yes' || g === 'nod') { playGestureWithHand('yes'); }
        else if (g === 'no' || g === 'shake') { playGestureWithHand('no'); }
        else if (kind === 'pose' && poseKey) { window.head.playPose(s.poses[poseKey].url, null, dur); }
        else if (kind === 'animation' && animKey) { window.head.playAnimation(s.animations[animKey].url, null, dur); }
        else if (kind === 'gesture' && gestKey) { playGestureWithHand(s.gestures[gestKey].name); }
        else if (animKey) { window.head.playAnimation(s.animations[animKey].url, null, dur); }
        else if (poseKey) { window.head.playPose(s.poses[poseKey].url, null, dur); }
        else if (gestKey) { playGestureWithHand(s.gestures[gestKey].name); }
        else { playGestureWithHand(g); }
      }
    } catch {}
    return true;
    })();
  `;
}

/**
 * Build the stop command script.
 * @returns {string} JavaScript code to inject
 */
export function buildStopScript() {
  return `
    (() => {
    try { window.head.stopSpeaking(); } catch {}
    try {
      if (window.__nyxProceduralMotion) {
        return window.__nyxProceduralMotion.stop(true);
      }
    } catch {}
    return true;
    })();
  `;
}

/**
 * Build the cleanup script for component unmount.
 * @returns {string} JavaScript code to inject
 */
export function buildCleanupScript() {
  return `
    try {
      if (window.__nyxProceduralMotion) {
        window.__nyxProceduralMotion.stop(true);
      }
    } catch {}
    true;
  `;
}

// ─── Avatar Runtime Adapter class ─────────────────────────────────────────────

/**
 * Avatar runtime adapter that drives the webview through executeJavaScript.
 *
 * Usage:
 *   const adapter = new AvatarRuntimeAdapter(webviewRef);
 *   adapter.onLoad(); // called when webview finishes loading
 *   adapter.speak({ text, audioBase64, mood, ... });
 *   adapter.stop();
 */
export class AvatarRuntimeAdapter {
  /**
   * @param {Object} options
   * @param {React.RefObject} options.webviewRef - Ref to the <webview> element
   * @param {Function} [options.onMotionResult] - Callback for motion results (e.g., turnwalk offset)
   */
  constructor({ webviewRef, onMotionResult }) {
    this.webviewRef = webviewRef;
    this.onMotionResult = onMotionResult || (() => {});
    this.isLoaded = false;
    this.motionState = { currentOffsetX: 0 };
  }

  /**
   * Execute JavaScript in the webview.
   * @param {string} code - JavaScript code to execute
   * @returns {Promise<any>} Result of execution
   */
  async exec(code) {
    const wv = this.webviewRef.current;
    if (!wv || !this.isLoaded) return null;
    return wv.executeJavaScript(code);
  }

  /**
   * Called when the webview finishes loading.
   * Injects layout initialization and procedural motion scripts.
   */
  onWebviewLoad() {
    this.isLoaded = true;

    this.exec(buildLayoutInitScript()).catch(() => {});
    this.exec(buildProceduralMotionScript(this.motionState.currentOffsetX)).catch(() => {});
  }

  /**
   * Speak text with audio.
   * @param {Object} params
   * @param {string} params.text - Text to speak
   * @param {string} params.audioBase64 - Base64 audio data
   * @param {string} params.mood - Mood identifier
   * @param {string} params.expression - Expression identifier
   * @param {string} params.requestId - Request ID for tracking
   * @param {string} params.segmentId - Segment ID for tracking
   * @param {number} params.expectedDurationMs - Expected duration in ms
   * @returns {Promise<number|null>} Actual duration in ms
   */
  async speak({ text, audioBase64, mood, expression, requestId, segmentId, expectedDurationMs }) {
    const code = buildSpeakScript({ text, audioBase64, mood, expression, requestId, segmentId });
    const result = await this.exec(code);
    return result ? Number(result) : null;
  }

  /**
   * Set the avatar mood/expression.
   * @param {Object} params
   * @param {string} params.mood - Mood value
   * @param {string} params.expression - Expression value (alternative)
   */
  async setMood({ mood, expression }) {
    const code = buildMoodScript({ mood, expression });
    return this.exec(code);
  }

  /**
   * Play a gesture or motion.
   * @param {Object} params
   * @param {string} params.motion - Motion/gesture name
   * @param {string} params.motionType - Type (pose/animation/gesture)
   * @param {string} params.hand - Hand side
   * @param {string} params.direction - Direction
   * @param {number} params.duration - Duration in seconds
   */
  async playGesture({ motion, motionType, hand, direction, duration }) {
    const code = buildGestureScript({ motion, motionType, hand, direction, duration });
    const result = await this.exec(code);

    // Track turnwalk offset
    if (motion === 'turnwalk' && result && Number.isFinite(result.finalOffsetX)) {
      this.motionState.currentOffsetX = result.finalOffsetX;
      this.onMotionResult(result);
    }
  }

  /**
   * Stop all avatar activity.
   */
  async stop() {
    const result = await this.exec(buildStopScript());
    if (Number.isFinite(result)) {
      this.motionState.currentOffsetX = result;
    }
  }

  /**
   * Cleanup on unmount.
   */
  cleanup() {
    this.isLoaded = false;
    try {
      this.exec(buildCleanupScript()).catch(() => {});
    } catch {
      // ignore cleanup failures
    }
  }
}

export { MOOD_MAP, EMOJI_TO_MOOD };

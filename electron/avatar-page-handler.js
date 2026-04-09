/**
 * Avatar page-side handler.
 *
 * This file is loaded via webContents.executeJavaScript() so it runs in the
 * PAGE's JS world, where window.head is accessible.
 *
 * It is NOT a preload — it must not use require() or Electron APIs.
 * It communicates back to the main process via window.__nyxBridge (exposed
 * by the contextBridge in avatar-window-bridge.js).
 */
(function () {
  'use strict';
  if (window.__nyxAvatarHandlerInstalled) return;
  window.__nyxAvatarHandlerInstalled = true;

  // ── Mood mapping ────────────────────────────────────────────────────────────
  var MOOD_MAP = {
    neutral: 'Neutral', happy: 'Happy', angry: 'Angry', sad: 'Sad',
    fear: 'Fear', disgust: 'Disgust', love: 'Love', sleep: 'Sleep',
    think: 'Neutral', surprised: 'Happy', curious: 'Neutral',
    question: 'Neutral', awkward: 'Neutral',
  };

  var EMOJI_TO_MOOD = {
    '\u{1F610}': 'Neutral', '\u{1F636}': 'Neutral', '\u{1F60F}': 'Happy',
    '\u{1F612}': 'Neutral', '\u{1F642}': 'Happy', '\u{1F643}': 'Happy',
    '\u{1F60A}': 'Happy', '\u{1F607}': 'Happy', '\u{1F970}': 'Love',
    '\u{1F600}': 'Happy', '\u{1F603}': 'Happy', '\u{1F604}': 'Happy',
    '\u{1F601}': 'Happy', '\u{1F606}': 'Happy', '\u{1F60D}': 'Love',
    '\u{1F929}': 'Love', '\u{1F61D}': 'Happy', '\u{1F60B}': 'Happy',
    '\u{1F61B}': 'Happy', '\u{1F61C}': 'Happy', '\u{1F92A}': 'Happy',
    '\u{1F602}': 'Happy', '\u{1F923}': 'Happy', '\u{1F605}': 'Happy',
    '\u{1F609}': 'Happy', '\u{1F62D}': 'Sad', '\u{1F97A}': 'Sad',
    '\u{1F61E}': 'Sad', '\u{1F614}': 'Sad', '\u2639\uFE0F': 'Sad',
    '\u{1F633}': 'Happy', '\u{1F61A}': 'Love', '\u{1F618}': 'Love',
    '\u{1F621}': 'Angry', '\u{1F620}': 'Angry', '\u{1F92C}': 'Angry',
    '\u{1F631}': 'Fear', '\u{1F62C}': 'Neutral', '\u{1F644}': 'Neutral',
    '\u{1F914}': 'Neutral', '\u{1F440}': 'Neutral', '\u{1F634}': 'Sleep',
  };

  function resolveMoodFromEmoji(text) {
    if (!text) return null;
    var emojiRe = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
    var emojis = text.match(emojiRe);
    if (!emojis) return null;
    for (var i = 0; i < emojis.length; i++) {
      if (EMOJI_TO_MOOD[emojis[i]]) return EMOJI_TO_MOOD[emojis[i]];
    }
    return null;
  }

  function mapMood(mood) { return MOOD_MAP[mood] || mood || 'Neutral'; }

  // ── Layout (camera/scale) — retries until window.head is ready ──────────────
  var _layoutApplied = false;

  function canApplyLayout(h) {
    return Boolean(
      h &&
      h.camera &&
      h.controls &&
      h.armature &&
      h.armature.scale &&
      typeof h.armature.scale.setScalar === 'function'
    );
  }

  function applyLayout(attempt) {
    if (_layoutApplied) return true;
    attempt = attempt || 0;
    var h = window.head;
    if (!h) {
      if (attempt < 80) setTimeout(function () { applyLayout(attempt + 1); }, 200);
      else console.error('[nyx-page] window.head not ready after 80 attempts');
      return false;
    }
    if (!canApplyLayout(h)) return false;
    try {
      h.armature.scale.setScalar(0.8);
      if (typeof h.avatarHeight === 'number' && isFinite(h.avatarHeight)) h.avatarHeight *= 0.8;
      var dist = 13.6, height = 0.92;
      h.camera.position.set(0, height, dist);
      if (h.controls.target && h.controls.target.set) h.controls.target.set(0, height, 0);
      if (h.controls.update) h.controls.update();
      if (h.controls.enabled !== undefined) h.controls.enabled = false;
      _layoutApplied = true;
      console.log('[nyx-page] layout applied');
      return true;
    } catch (e) {
      console.error('[nyx-page] layout error', e);
      return false;
    }
  }

  function handleAvatarReady() {
    if (applyLayout(0) && typeof window.removeEventListener === 'function') {
      window.removeEventListener('nyx:avatar-ready', handleAvatarReady);
    }
  }

  // Inject extra UI-hide + transparency styles once DOM is ready
  var styleTag = document.createElement('style');
  styleTag.id = 'nyx-avatar-style';
  styleTag.textContent = [
    'html,body{background:transparent!important;background-color:transparent!important;overflow:hidden!important;}',
    ':root{--colorBackground:transparent!important;}',
    '#view,#avatar,#main,canvas{background:transparent!important;background-color:transparent!important;}',
    '#controls,.controls,nav,header,footer,.sidebar,.panel,',
    '.toolbar,.menu,.modal,.popup,.overlay,.card,.toast,',
    '#ui-toggle,#right,#bottom,#loading{display:none!important;}',
    '#main,#left{position:fixed!important;top:0!important;left:0!important;',
    'width:100%!important;height:100%!important;margin:0!important;}',
  ].join('');
  (document.head || document.documentElement).appendChild(styleTag);

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('nyx:avatar-ready', handleAvatarReady);
  }
  applyLayout();

  // ── Command handlers ─────────────────────────────────────────────────────────
  function handleSpeak(data) {
    var h = window.head;
    if (!h) { console.error('[nyx-page] speak: window.head not available'); return; }
    var emojiMood = resolveMoodFromEmoji(data.text);
    var mood = emojiMood || mapMood(data.mood);
    var expression = mapMood(data.expression) || mood;
    if (h.audioCtx && h.audioCtx.state === 'suspended') h.audioCtx.resume();
    try { h.stopSpeaking(); } catch (e) {}
    try { h.setMood(mood); } catch (e) {}
    try { h.setMood(expression); } catch (e) {}
    var bin = window.atob(data.audioBase64 || '');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    h.audioCtx.decodeAudioData(bytes.buffer).then(function (decoded) {
      var dur = decoded.duration * 1000;
      var vis = [], vt = [], vd = [], shapes = ['aa', 'E', 'O', 'I'];
      for (var t = 0; t < dur - 100; t += 150) { vt.push(t); vd.push(150); vis.push(shapes[Math.floor(Math.random() * 4)]); }
      vt.push(dur - 50); vd.push(50); vis.push('sil');
      var safe = String(data.text || '');
      h.speakAudio({ audio: decoded, words: [safe], wtimes: [0], wdurations: [dur], visemes: vis, vtimes: vt, vdurations: vd }, { avatarMute: false });
      if (data.requestId && data.segmentId) {
        setTimeout(function () {
          if (window.__nyxBridge) window.__nyxBridge.notifyPlayback({ requestId: data.requestId, segmentId: data.segmentId, state: 'ended' });
        }, dur);
      }
    }).catch(function (err) {
      console.error('[nyx-page] decodeAudioData error', err);
      if (data.requestId && data.segmentId && window.__nyxBridge) {
        window.__nyxBridge.notifyPlayback({ requestId: data.requestId, segmentId: data.segmentId, state: 'error' });
      }
    });
  }

  function handleMood(data) {
    var h = window.head;
    if (!h) return;
    var v = data.mood || data.expression;
    var target = resolveMoodFromEmoji(v) || mapMood(v);
    try { h.setMood(target); } catch (e) {}
  }

  function handleGesture(data) {
    var h = window.head;
    if (!h) return;
    var motion = String(data.motion || '').toLowerCase();
    var motionType = String(data.motionType || '').toLowerCase();
    var hand = String(data.hand || '').toLowerCase();
    if (h.animEmojis && h.animEmojis[motion]) { h.speakEmoji(motion); }
    else if (motion === 'yes' || motion === 'nod') { try { h.playGesture('yes', 3, hand === 'right'); } catch (e) {} }
    else if (motion === 'no' || motion === 'shake') { try { h.playGesture('no', 3, hand === 'right'); } catch (e) {} }
    else if (motionType === 'pose') {
      var s = window.site || {};
      var pk = Object.keys(s.poses || {}).find(function (k) { return k.toLowerCase() === motion || String((s.poses[k] && s.poses[k].url) || '').toLowerCase() === motion; });
      if (pk) try { h.playPose(s.poses[pk].url, null, data.duration); } catch (e) {}
    } else if (motionType === 'animation') {
      var s2 = window.site || {};
      var animationKey = motion === 'turnwalk' ? 'walking' : motion;
      var ak = Object.keys(s2.animations || {}).find(function (k) {
        return k.toLowerCase() === animationKey
          || String((s2.animations[k] && s2.animations[k].url) || '').toLowerCase() === animationKey;
      });
      if (h.armature && data.direction) {
        try {
          if (String(data.direction).toLowerCase() === 'left') h.armature.rotation.y = Math.PI / 2;
          else if (String(data.direction).toLowerCase() === 'right') h.armature.rotation.y = -Math.PI / 2;
        } catch (e) {}
      }
      if (ak) try { h.playAnimation(s2.animations[ak].url, null, data.duration); } catch (e) {}
    } else { try { h.playGesture(motion, 3, hand === 'right'); } catch (e) {} }
  }

  function handleStop() {
    try { if (window.head) window.head.stopSpeaking(); } catch (e) {}
    try { if (window.__nyxProceduralMotion) window.__nyxProceduralMotion.stop(true); } catch (e) {}
  }

  // ── Status bubble ─────────────────────────────────────────────────────────────
  var _bubble = null, _bubbleTimer = null;

  function showBubble(text) {
    if (!text) { hideBubble(); return; }
    if (!_bubble) {
      _bubble = document.createElement('div');
      _bubble.id = 'nyx-status-bubble';
      _bubble.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(15,20,30,0.92);color:#c8d6e5;font-family:system-ui,-apple-system,sans-serif;font-size:14px;padding:8px 16px;border-radius:12px;max-width:80%;word-wrap:break-word;box-shadow:0 4px 20px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s ease-out,transform 0.2s ease-out;pointer-events:none;';
      _bubble.textContent = text;
      (document.body || document.documentElement).appendChild(_bubble);
      requestAnimationFrame(function () { _bubble.style.opacity = '1'; _bubble.style.transform = 'translateX(-50%) translateY(0)'; });
    } else { _bubble.textContent = text; }
  }

  function hideBubble() {
    if (!_bubble) return;
    _bubble.style.opacity = '0';
    _bubble.style.transform = 'translateX(-50%) translateY(-10px)';
    var b = _bubble; _bubble = null;
    setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 250);
  }

  function handleStatus(data) {
    if (_bubbleTimer) { clearTimeout(_bubbleTimer); _bubbleTimer = null; }
    if (data.text) { showBubble(data.text); _bubbleTimer = setTimeout(function () { hideBubble(); _bubbleTimer = null; }, 3500); }
    else { hideBubble(); }
  }

  // ── Command dispatcher ───────────────────────────────────────────────────────
  window.addEventListener('__nyx_cmd__', function (e) {
    var data = e.detail;
    if (!data || !data.cmd) return;
    switch (data.cmd) {
      case 'speak': handleSpeak(data); break;
      case 'mood': case 'expression': handleMood(data); break;
      case 'gesture': case 'motion': handleGesture(data); break;
      case 'stop': handleStop(); break;
      case 'status': handleStatus(data); break;
    }
  });

  console.log('[nyx-page] avatar command handler installed');
})();

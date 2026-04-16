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
    think: 'Think', surprised: 'Surprised', curious: 'Curious',
    question: 'Curious', awkward: 'Neutral',
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
    '\u{1F633}': 'Surprised', '\u{1F61A}': 'Love', '\u{1F618}': 'Love',
    '\u{1F621}': 'Angry', '\u{1F620}': 'Angry', '\u{1F92C}': 'Angry',
    '\u{1F631}': 'Fear', '\u{1F633}': 'Surprised', '\u{1F62C}': 'Neutral', '\u{1F644}': 'Neutral',
    '\u{1F914}': 'Neutral', '\u{1F440}': 'Neutral', '\u{1F634}': 'Sleep',
    '\u{1F62E}': 'Surprised', '\u{1F632}': 'Surprised',
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
    /* Status Bubble — centrato in alto, per idle / pensando / rispondendo */
    '#nyx-status-bubble{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(30,36,54,0.82);color:#c8d4f0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:400;padding:8px 16px;border-radius:20px;max-width:260px;word-wrap:break-word;box-shadow:0 4px 24px rgba(0,0,0,0.35);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.10);opacity:0;transition:opacity 0.22s ease-out;pointer-events:none;}',
    '#nyx-status-bubble.nyxb-visible{opacity:1!important;}',
    /* Speech Bubble — a destra, altezza testa avatar */
    '#nyx-speech-bubble{position:fixed;top:22%;right:4%;z-index:10002;background:rgba(255,255,255,0.97);color:#131824;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:500;line-height:1.5;padding:14px 18px;border-radius:18px 18px 18px 4px;max-width:220px;word-wrap:break-word;box-shadow:0 12px 40px rgba(0,0,0,0.38);backdrop-filter:blur(18px);opacity:0;transition:opacity 0.2s ease-out,transform 0.2s ease-out;transform:translateX(10px);pointer-events:none;}',
    '#nyx-speech-bubble.nyxb-visible{opacity:1!important;transform:translateX(0)!important;}',
    '#nyx-speech-bubble::before{content:"";position:absolute;right:100%;top:18px;border:8px solid transparent;border-right-color:rgba(255,255,255,0.97);}',
    /* Response Popup */
    '#nyx-response-popup{position:fixed;bottom:12%;left:50%;transform:translateX(-50%);z-index:10001;width:85%;max-width:500px;background:rgba(13,20,34,0.88);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:16px 20px;box-shadow:0 12px 40px rgba(0,0,0,0.32),0 0 20px rgba(78,143,255,0.22);backdrop-filter:blur(20px);opacity:0;transition:opacity 0.3s ease-out,transform 0.3s ease-out;pointer-events:none;}',
    '#nyx-response-popup.nyxb-visible{opacity:1!important;transform:translateX(-50%) translateY(0)!important;}',
    '#nyx-response-popup p{margin:0;line-height:1.6;font-size:15px;font-weight:400;color:#e8edf7;word-wrap:break-word;overflow-wrap:break-word;}',
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

    // Show speech bubble (side, head height) with current text fragment
    showSpeechBubble(data.text || '');

    // Accumulate response text in popup
    var requestId = String(data.requestId || '').trim();
    var textPart = data.text || '';
    if (requestId && requestId !== _currentRequestId) {
      _responseParts = [textPart];
      _currentRequestId = requestId;
    } else {
      _responseParts.push(textPart);
    }
    showPopupText(_responseParts.join(' '));

    var bin = window.atob(data.audioBase64 || '');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    h.audioCtx.decodeAudioData(bytes.buffer).then(function (decoded) {
      var dur = decoded.duration * 1000;
      var safe = String(data.text || '');
      // Do NOT pass visemes/vtimes/vdurations — let talkinghead.mjs calculate them
      // automatically from the text using lipsyncPreProcessText + lipsyncWordsToVisemes
      // for the correct language (see talkinghead.mjs lines 3157-3158).
      h.speakAudio({ audio: decoded, words: [safe], wtimes: [0], wdurations: [dur] }, { avatarMute: false });
      beginSpeechTracking(h, data, dur);
    }).catch(function (err) {
      console.error('[nyx-page] decodeAudioData error', err);
      hideSpeechBubble();
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
    var s = window.site || {};
    var dur = Number.isFinite(Number(data.duration)) ? data.duration : 10;

    // Pre-compute lookups for all categories
    var pk = Object.keys(s.poses || {}).find(function (k) {
      return k.toLowerCase() === motion || String((s.poses[k] && s.poses[k].url) || '').toLowerCase() === motion;
    });
    var ak = Object.keys(s.animations || {}).find(function (k) {
      return k.toLowerCase() === motion || String((s.animations[k] && s.animations[k].url) || '').toLowerCase() === motion;
    });
    var gk = Object.keys(s.gestures || {}).find(function (k) {
      return k.toLowerCase() === motion || String((s.gestures[k] && s.gestures[k].name) || '').toLowerCase() === motion;
    });

    // 1. animEmojis → speakEmoji
    if (h.animEmojis && h.animEmojis[motion]) { h.speakEmoji(motion); }
    // 2. turnwalk → look up walking animation from site config, fallback to relative path
    else if (motion === 'turnwalk' || motionType === 'turnwalk') {
      var direction = String(data.direction || '').toLowerCase();
      var walkKey = Object.keys(s.animations || {}).find(function (k) {
        return k.toLowerCase() === 'walking' || String((s.animations[k] && s.animations[k].url) || '').toLowerCase().indexOf('walking') !== -1;
      });
      try {
        if (walkKey && s.animations[walkKey] && s.animations[walkKey].url) {
          h.playAnimation(s.animations[walkKey].url, null, dur);
        } else {
          h.playAnimation('./animations/walking.fbx', null, dur);
        }
        if (h.armature) {
          h.armature.rotation.y = direction === 'left' ? Math.PI / 2 : -Math.PI / 2;
        }
      } catch (e) {}
    }
    // 3. yes/no → head nod/shake via animEmojis (already handled above, fallback here)
    else if (motion === 'yes' || motion === 'nod') { h.playGesture('yes', 3, hand === 'right'); }
    else if (motion === 'no' || motion === 'shake') { h.playGesture('no', 3, hand === 'right'); }
    // 4. motionType=pose → site.poses → playPose
    else if (motionType === 'pose') {
      if (pk) { try { h.playPose(s.poses[pk].url, null, dur); } catch (e) {} }
      else { try { h.playGesture(motion, 3, hand === 'right'); } catch (e) {} }
    }
    // 5. motionType=animation → site.animations → playAnimation
    else if (motionType === 'animation') {
      if (ak) { try { h.playAnimation(s.animations[ak].url, null, dur); } catch (e) {} }
      else { try { h.playGesture(motion, 3, hand === 'right'); } catch (e) {} }
    }
    // 6. motionType=gesture → site.gestures → playGesture
    else if (motionType === 'gesture') {
      if (gk) { try { h.playGesture(s.gestures[gk].name, 3, hand === 'right'); } catch (e) {} }
      else { try { h.playGesture(motion, 3, hand === 'right'); } catch (e) {} }
    }
    // 7. No motionType → try all categories in order, then raw fallback
    else {
      if (ak) { try { h.playAnimation(s.animations[ak].url, null, dur); } catch (e) {} }
      else if (pk) { try { h.playPose(s.poses[pk].url, null, dur); } catch (e) {} }
      else if (gk) { try { h.playGesture(s.gestures[gk].name, 3, hand === 'right'); } catch (e) {} }
      else { try { h.playGesture(motion, 3, hand === 'right'); } catch (e) {} }
    }
  }

  function handleStop() {
    try { if (window.head) window.head.stopSpeaking(); } catch (e) {}
    try {
      var m = window.__nyxMotionInternal || window.__nyxProceduralMotion;
      if (m && m.stop) m.stop(true);
    } catch (e) {}
    hideBubble();
    hideSpeechBubble();
    hidePopup();
    if (_speechEndTimer) { clearTimeout(_speechEndTimer); _speechEndTimer = null; }
    _activeSpeechKey = null;
    _responseParts = [];
    _currentRequestId = null;
  }

  // ── Status bubble ─────────────────────────────────────────────────────────────
  var _bubbleTimer = null;
  var _speechEndTimer = null, _activeSpeechKey = null, _speechCompletedKeys = {};

  // ── Response popup ────────────────────────────────────────────────────────────
  var _responseParts = [], _currentRequestId = null;

  function getOrCreatePopup(className, tag, innerHTML) {
    var el = document.getElementById(className);
    if (!el) {
      el = document.createElement(tag || 'div');
      el.id = className;
      if (innerHTML) el.innerHTML = innerHTML;
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function showPopupText(text) {
    var popup = getOrCreatePopup('nyx-response-popup', 'div', '<p></p>');
    var pEl = popup.querySelector && popup.querySelector('p');
    if (!pEl) {
      pEl = document.createElement('p');
      popup.appendChild(pEl);
    }
    if (pEl) pEl.textContent = text;
    popup.classList.add('nyxb-visible');
  }

  function hidePopup() {
    var popup = document.getElementById('nyx-response-popup');
    if (popup) popup.classList.remove('nyxb-visible');
  }

  function showBubble(text) {
    if (!text) { hideBubble(); return; }
    var bubble = document.getElementById('nyx-status-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'nyx-status-bubble';
      bubble.textContent = text;
      (document.body || document.documentElement).appendChild(bubble);
      requestAnimationFrame(function () { bubble.classList.add('nyxb-visible'); });
    } else {
      bubble.textContent = text;
      bubble.classList.add('nyxb-visible');
    }
    if (_bubbleTimer) { clearTimeout(_bubbleTimer); _bubbleTimer = null; }
  }

  function scheduleBubbleHide(durationMs) {
    if (_bubbleTimer) { clearTimeout(_bubbleTimer); _bubbleTimer = null; }
    var safeDuration = Math.max(500, Number(durationMs) || 0);
    _bubbleTimer = setTimeout(function () {
      _bubbleTimer = null;
      hideBubble();
    }, safeDuration + 180);
  }

  function makeSpeechKey(data) {
    var requestId = String(data && data.requestId || '').trim();
    var segmentId = String(data && data.segmentId || '').trim();
    return requestId && segmentId ? requestId + '::' + segmentId : '';
  }

  function completeSpeechSegment(data, state) {
    var key = makeSpeechKey(data);
    if (key && _speechCompletedKeys[key]) return;
    if (key) _speechCompletedKeys[key] = true;
    if (!key || key === _activeSpeechKey) {
      hideSpeechBubble();
    }
    if (_speechEndTimer) { clearTimeout(_speechEndTimer); _speechEndTimer = null; }
    if (data && data.requestId && data.segmentId && window.__nyxBridge) {
      window.__nyxBridge.notifyPlayback({ requestId: data.requestId, segmentId: data.segmentId, state: state || 'ended' });
    }
  }

  function beginSpeechTracking(h, data, durationMs) {
    var key = makeSpeechKey(data);
    _activeSpeechKey = key;
    if (key) delete _speechCompletedKeys[key];
    if (_speechEndTimer) { clearTimeout(_speechEndTimer); _speechEndTimer = null; }

    var fallbackMs = Math.max(1000, Number(durationMs) || Number(data && data.expectedDurationMs) || 0) + 2500;
    _speechEndTimer = setTimeout(function () {
      completeSpeechSegment(data, 'ended');
    }, fallbackMs);

    var attempts = 0;
    function attachWhenReady() {
      if (key && _activeSpeechKey !== key) return;
      var source = h && h.audioSpeechSource;
      if (source && source.buffer && !source.__nyxTrackedEnd) {
        source.__nyxTrackedEnd = true;
        var originalOnEnded = source.onended;
        source.onended = function () {
          try {
            if (typeof originalOnEnded === 'function') originalOnEnded.apply(this, arguments);
          } finally {
            completeSpeechSegment(data, 'ended');
          }
        };
        return;
      }
      attempts += 1;
      if (attempts < 80) setTimeout(attachWhenReady, 50);
    }
    attachWhenReady();
  }

  function hideBubble() {
    if (_bubbleTimer) { clearTimeout(_bubbleTimer); _bubbleTimer = null; }
    var bubble = document.getElementById('nyx-status-bubble');
    if (!bubble) return;
    bubble.classList.remove('nyxb-visible');
    var b = bubble;
    setTimeout(function () {
      if (b && b.parentNode && !b.classList.contains('nyxb-visible')) {
        b.parentNode.removeChild(b);
      }
    }, 250);
  }

  // ── Speech bubble (a lato, altezza testa) ────────────────────────────────────
  var _speechBubbleTimer = null;

  function showSpeechBubble(text) {
    if (!text) { hideSpeechBubble(); return; }
    var bubble = document.getElementById('nyx-speech-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'nyx-speech-bubble';
      bubble.textContent = text;
      (document.body || document.documentElement).appendChild(bubble);
      requestAnimationFrame(function () { bubble.classList.add('nyxb-visible'); });
    } else {
      bubble.textContent = text;
      bubble.classList.add('nyxb-visible');
    }
    if (_speechBubbleTimer) { clearTimeout(_speechBubbleTimer); _speechBubbleTimer = null; }
  }

  function hideSpeechBubble() {
    if (_speechBubbleTimer) { clearTimeout(_speechBubbleTimer); _speechBubbleTimer = null; }
    var bubble = document.getElementById('nyx-speech-bubble');
    if (!bubble) return;
    bubble.classList.remove('nyxb-visible');
    var b = bubble;
    setTimeout(function () {
      if (b && b.parentNode && !b.classList.contains('nyxb-visible')) {
        b.parentNode.removeChild(b);
      }
    }, 220);
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

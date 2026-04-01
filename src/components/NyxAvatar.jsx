import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

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

function resolveMoodFromEmoji(text) {
  if (!text) return null;
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
  const emojis = text.match(emojiPattern);
  if (!emojis) return null;
  for (const emoji of emojis) {
    if (EMOJI_TO_MOOD[emoji]) return EMOJI_TO_MOOD[emoji];
  }
  return null;
}

function NyxAvatar() {
  const webviewRef = useRef(null);
  const playbackRef = useRef({
    requestId: null,
    segmentId: null,
    timerId: null,
  });
  const statusClearTimerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [statusText, setStatusText] = useState('');
  const avatarSrc = new URL('./talkinghead/index.html', window.location.href).toString();

  function clearStatusTimer() {
    if (statusClearTimerRef.current) {
      clearTimeout(statusClearTimerRef.current);
      statusClearTimerRef.current = null;
    }
  }

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;

    function onDidFinishLoad() {
      setIsLoaded(true);

      wv.executeJavaScript(`
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
          if (window.head?.camera && window.head?.controls) {
            const h = window.head;
            const finalDist = 13.0;
            const finalHeight = 1.0;
            const safeHalfX = (finalDist * 0.15) / Math.max(0.6, h.armature?.scale?.x || 1);
            let finalTargetX = finalDist * 0.12;
            finalTargetX = Math.max(-safeHalfX, Math.min(safeHalfX, finalTargetX));
            h.camera.position.set(finalTargetX, finalHeight, finalDist);
            h.controls.target.set(finalTargetX, finalHeight, 0);
            h.controls.update();
            h.controls.enabled = false;
          }
          return true;
        })();
      `).catch(() => {});
    }

    function onRenderProcessGone() {
      setIsLoaded(false);
      setTimeout(() => {
        try {
          wv.reload();
        } catch {
          // ignore reload failures
        }
      }, 1500);
    }

    function onDidFailLoad() {
      setTimeout(() => {
        try {
          wv.reload();
        } catch {
          // ignore reload failures
        }
      }, 2000);
    }

    wv.addEventListener('did-finish-load', onDidFinishLoad);
    wv.addEventListener('render-process-gone', onRenderProcessGone);
    wv.addEventListener('did-fail-load', onDidFailLoad);

    return () => {
      wv.removeEventListener('did-finish-load', onDidFinishLoad);
      wv.removeEventListener('render-process-gone', onRenderProcessGone);
      wv.removeEventListener('did-fail-load', onDidFailLoad);
    };
  }, []);

  function notifyPlayback(state, requestId, segmentId) {
    if (!requestId || !segmentId) return;
    window.electronAPI?.notifyAvatarPlayback?.({
      state,
      requestId,
      segmentId,
    });
  }

  function clearPlaybackTimer(notifyState = null) {
    const current = playbackRef.current;
    if (current.timerId) {
      clearTimeout(current.timerId);
      current.timerId = null;
    }

    if (notifyState && current.requestId && current.segmentId) {
      notifyPlayback(notifyState, current.requestId, current.segmentId);
    }

    current.requestId = null;
    current.segmentId = null;
  }

  useEffect(() => {
    if (!window.electronAPI?.onAvatarCommand) return undefined;

    const unsubscribe = window.electronAPI.onAvatarCommand((data) => {
      const wv = webviewRef.current;
      if (!wv || !isLoaded) return;

      switch (data.cmd) {
        case 'speak': {
          clearPlaybackTimer('stopped');
          clearStatusTimer();
          const emojiMood = resolveMoodFromEmoji(data.text);
          const mood = emojiMood || MOOD_MAP[data.mood] || data.mood || 'Neutral';
          const expression = MOOD_MAP[data.expression] || data.expression || mood;
          const safeText = String(data.text || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
          const requestId = String(data.requestId || '').trim();
          const segmentId = String(data.segmentId || '').trim();
          const expectedDurationMs = Math.max(500, Number(data.expectedDurationMs) || 0);
          setStatusText(data.text || '');

          wv.executeJavaScript(`
            (async () => {
              const h = window.head;
              if (!h) return null;
              if (h.audioCtx && h.audioCtx.state === 'suspended') {
                await h.audioCtx.resume();
              }

              try { h.stopSpeaking(); } catch {}
              try { h.setMood('${mood}'); } catch {}
              try { h.setMood('${expression}'); } catch {}

              const binaryString = window.atob('${data.audioBase64 || ''}');
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
          `).then((actualDurationMs) => {
            const playbackDurationMs = Math.max(500, Number(actualDurationMs) || expectedDurationMs);
            playbackRef.current.requestId = requestId;
            playbackRef.current.segmentId = segmentId;
            playbackRef.current.timerId = setTimeout(() => {
              setStatusText('');
              notifyPlayback('ended', requestId, segmentId);
              playbackRef.current.timerId = null;
              playbackRef.current.requestId = null;
              playbackRef.current.segmentId = null;
            }, playbackDurationMs + 180);
          }).catch(() => {
            notifyPlayback('error', requestId, segmentId);
          });
          break;
        }

        case 'mood':
        case 'expression': {
          const emojiMood = resolveMoodFromEmoji(data.mood || data.expression);
          const target = emojiMood || MOOD_MAP[data.mood || data.expression] || data.mood || data.expression || 'Neutral';
          wv.executeJavaScript(`
            try { window.head.setMood('${target}'); } catch {}
            true;
          `).catch(() => {});
          break;
        }

        case 'motion':
        case 'gesture': {
          const motion = String(data.motion || data.gesture || '').toLowerCase();
          const motionType = String(data.motionType || '').toLowerCase();
          const duration = Number(data.duration) || 10;
          wv.executeJavaScript(`
            try {
              const s = window.site || {};
              const g = '${motion}';
              const kind = '${motionType}';
              const dur = ${duration};

              // 7-level fallback: emoji -> animation -> pose -> gesture -> raw -> yes/no -> fallback
              if (window.head.animEmojis && window.head.animEmojis[g]) {
                window.head.speakEmoji(g);
              } else {
                const poseKey = Object.keys(s.poses || {}).find(k => k.toLowerCase() === g || (s.poses[k].url || '').toLowerCase() === g);
                const animKey = Object.keys(s.animations || {}).find(k => k.toLowerCase() === g || (s.animations[k].url || '').toLowerCase() === g);
                const gestKey = Object.keys(s.gestures || {}).find(k => k.toLowerCase() === g || (s.gestures[k].name || '').toLowerCase() === g);

                if (g === 'yes' || g === 'nod') { window.head.playGesture('yes', 3); }
                else if (g === 'no' || g === 'shake') { window.head.playGesture('no', 3); }
                else if (kind === 'pose' && poseKey) { window.head.playPose(s.poses[poseKey].url, null, dur); }
                else if (kind === 'animation' && animKey) { window.head.playAnimation(s.animations[animKey].url, null, dur); }
                else if (kind === 'gesture' && gestKey) { window.head.playGesture(s.gestures[gestKey].name, 3); }
                else if (animKey) { window.head.playAnimation(s.animations[animKey].url, null, dur); }
                else if (poseKey) { window.head.playPose(s.poses[poseKey].url, null, dur); }
                else if (gestKey) { window.head.playGesture(s.gestures[gestKey].name, 3); }
                else { window.head.playGesture(g, 3); }
              }
            } catch {}
            true;
          `).catch(() => {});
          break;
        }

        case 'status': {
          clearStatusTimer();
          setStatusText(data.text || '');
          if (data.text) {
            statusClearTimerRef.current = setTimeout(() => {
              setStatusText('');
              statusClearTimerRef.current = null;
            }, 3500);
          }
          break;
        }

        case 'stop': {
          setStatusText('');
          clearStatusTimer();
          clearPlaybackTimer('stopped');
          wv.executeJavaScript(`
            try { window.head.stopSpeaking(); } catch {}
            true;
          `).catch(() => {});
          break;
        }

        default:
          break;
      }
    });

    return () => {
      clearStatusTimer();
      clearPlaybackTimer('stopped');
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isLoaded]);

  return (
    <>
      <webview
        ref={webviewRef}
        src={avatarSrc}
        className="avatar-webview"
        style={{ background: 'transparent', pointerEvents: 'none' }}
        allowpopups="false"
        nodeintegration="false"
      />

      {statusText && (
        <motion.div
          initial={{ opacity: 0, y: -18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="avatar-status-bubble"
        >
          <p>{statusText}</p>
          <div className="avatar-status-caret" />
        </motion.div>
      )}
    </>
  );
}

export default NyxAvatar;

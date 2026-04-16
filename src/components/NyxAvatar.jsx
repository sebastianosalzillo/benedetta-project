import React, { useEffect, useRef, useState } from 'react';
import { AvatarRuntimeAdapter } from '../avatar-runtime/adapter';

/** Extra buffer after audio ends to ensure playback settles before notifying. */
const PLAYBACK_END_BUFFER_MS = 180;

function NyxAvatar() {
  const webviewRef = useRef(null);
  const playbackRef = useRef({
    requestId: null,
    segmentId: null,
    timerId: null,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const avatarSrc = new URL('./talkinghead/index.html', window.location.href).toString();

  // Create the adapter instance once per component lifecycle
  const adapterRef = useRef(null);
  if (!adapterRef.current) {
    adapterRef.current = new AvatarRuntimeAdapter({
      webviewRef,
      onMotionResult: (result) => {
        // Track motion state (e.g., turnwalk offset) if needed by other parts
        if (result?.finalOffsetX != null) {
          // Motion state is tracked internally by the adapter
        }
      },
    });
  }

  // ─── Webview lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;

    function onDidFinishLoad() {
      setIsLoaded(true);
      adapterRef.current.onWebviewLoad();
    }

    function onRenderProcessGone() {
      setIsLoaded(false);
      setTimeout(() => {
        try { wv.reload(); } catch { /* ignore */ }
      }, 1500);
    }

    function onDidFailLoad() {
      setTimeout(() => {
        try { wv.reload(); } catch { /* ignore */ }
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

  // ─── Playback helpers ─────────────────────────────────────────────────────
  function notifyPlayback(state, requestId, segmentId) {
    if (!requestId || !segmentId) return;
    window.electronAPI?.notifyAvatarPlayback?.({ state, requestId, segmentId });
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

  // ─── Avatar command handler ───────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onAvatarCommand) return undefined;

    const unsubscribe = window.electronAPI.onAvatarCommand(async (data) => {
      const adapter = adapterRef.current;
      if (!adapter || !isLoaded) return;

      switch (data.cmd) {
        case 'speak': {
          clearPlaybackTimer('stopped');
          const requestId = String(data.requestId || '').trim();
          const segmentId = String(data.segmentId || '').trim();
          const expectedDurationMs = Math.max(500, Number(data.expectedDurationMs) || 0);

          const actualDurationMs = await adapter.speak({
            text: data.text,
            audioBase64: data.audioBase64 || '',
            mood: data.mood,
            expression: data.expression,
            requestId,
            segmentId,
          });

          const playbackDurationMs = Math.max(500, Number(actualDurationMs) || expectedDurationMs);
          playbackRef.current.requestId = requestId;
          playbackRef.current.segmentId = segmentId;
          playbackRef.current.timerId = setTimeout(() => {
            notifyPlayback('ended', requestId, segmentId);
            playbackRef.current.timerId = null;
            playbackRef.current.requestId = null;
            playbackRef.current.segmentId = null;
          }, playbackDurationMs + PLAYBACK_END_BUFFER_MS);
          break;
        }

        case 'mood':
        case 'expression': {
          await adapter.setMood({ mood: data.mood, expression: data.expression });
          break;
        }

        case 'motion':
        case 'gesture': {
          await adapter.playGesture({
            motion: data.motion || data.gesture,
            motionType: data.motionType,
            hand: data.hand || data.side,
            direction: data.direction,
            duration: data.duration,
          });
          break;
        }

        case 'status': {
          break;
        }

        case 'stop': {
          clearPlaybackTimer('stopped');
          await adapter.stop();
          break;
        }

        default:
          break;
      }
    });

    return () => {
      clearPlaybackTimer('stopped');
      adapterRef.current?.cleanup();
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isLoaded]);

  return (
    <webview
      ref={webviewRef}
      src={avatarSrc}
      className="avatar-webview"
      style={{ background: 'transparent', pointerEvents: 'none' }}
      allowpopups="false"
      nodeintegration="false"
    />
  );
}

export default NyxAvatar;

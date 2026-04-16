import React, { useEffect, useRef } from 'react';

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function AvatarChat({
  messages,
  onSend,
  onStop,
  onOpenWorkspace,
  onCompleteBootstrap,
  onOpenSettings,
  canStop,
  isBusy,
  isThinking,
  streamStatus,
  ttsStatus,
  ttsLatencyMs,
  ttsLastError,
  workspace,
  windowPrefs,
  onToggleAlwaysOnTop,
}) {
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 130) + 'px';
  });

  function submit() {
    const ta = inputRef.current;
    if (!ta) return;
    const text = ta.value.trim();
    if (!text || isBusy) return;
    ta.value = '';
    ta.style.height = 'auto';
    ta.focus();
    onSend(text);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const showWorkspaceCard = Boolean(
    workspace && (workspace.bootstrapPending || workspace.bootstrapActive),
  );

  // Status dot
  const dotClass = streamStatus === 'streaming' ? 'toolbar-status-dot-streaming'
    : streamStatus === 'speaking'  ? 'toolbar-status-dot-speaking'
    : streamStatus === 'connected' ? 'toolbar-status-dot-connected'
    : streamStatus === 'error'     ? 'toolbar-status-dot-error'
    : 'toolbar-status-dot-off';

  const statusLabel = streamStatus === 'streaming' ? 'streaming'
    : streamStatus === 'speaking'  ? 'speaking'
    : streamStatus === 'connected' ? 'ready'
    : streamStatus === 'error'     ? 'error'
    : streamStatus === 'wait'      ? 'wait'
    : 'offline';

  const ttsLabel = ttsStatus && ttsStatus !== 'idle'
    ? `${ttsStatus}${Number.isFinite(ttsLatencyMs) ? ` ${ttsLatencyMs}ms` : ''}`
    : null;

  return (
    <div className="chat-shell">

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="chat-toolbar" role="group" aria-label="Chat controls">
        <div className={`toolbar-status-dot ${dotClass}`} role="status" aria-label={`Status: ${statusLabel}`} />
        <span className="toolbar-status-label">{statusLabel}{ttsLabel ? ` · ${ttsLabel}` : ''}</span>

        {canStop && (
          <button type="button" className="toolbar-stop-btn" onClick={onStop} aria-label="Stop">
            ✕ stop
          </button>
        )}

        <div className="toolbar-spacer" />

        <button
          type="button"
          className={`toolbar-pin-btn${windowPrefs.avatarAlwaysOnTop ? ' toolbar-pin-btn-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('avatar')}
          aria-pressed={windowPrefs.avatarAlwaysOnTop}
          title="Toggle avatar always-on-top"
        >
          avatar {windowPrefs.avatarAlwaysOnTop ? '📌' : '·'}
        </button>

        <button
          type="button"
          className={`toolbar-pin-btn${windowPrefs.chatAlwaysOnTop ? ' toolbar-pin-btn-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('chat')}
          aria-pressed={windowPrefs.chatAlwaysOnTop}
          title="Toggle chat always-on-top"
        >
          chat {windowPrefs.chatAlwaysOnTop ? '📌' : '·'}
        </button>

        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {/* ── Workspace bootstrap card ──────────────────────────── */}
      {showWorkspaceCard && (
        <div
          className={`workspace-card ${workspace.bootstrapPending ? 'workspace-card-pending' : ''}`}
          role="region"
          aria-label="Workspace bootstrap status"
        >
          <div className="workspace-header">
            <div>
              <div className="workspace-eyebrow">Workspace</div>
              <div className="workspace-title">Bootstrap in progress</div>
            </div>
            <div className="workspace-pills">
              <span className="workspace-pill">{workspace.bootstrapPending ? 'pending' : 'ready'}</span>
              {workspace.bootstrapActive && (
                <span className="workspace-pill">step {workspace.bootstrapStepIndex || 1}</span>
              )}
              {workspace.startupBootPending && <span className="workspace-pill">boot pending</span>}
            </div>
          </div>

          {workspace.path && (
            <div className="workspace-line">
              <span className="workspace-label">Path</span>
              <span className="workspace-path">{workspace.path}</span>
            </div>
          )}

          {workspace.missingRequiredFiles?.length > 0 && (
            <div className="workspace-line">
              <span className="workspace-label">Missing</span>
              <span>{workspace.missingRequiredFiles.join(', ')}</span>
            </div>
          )}

          {workspace.bootstrapQuestion && (
            <div className="workspace-line">
              <span className="workspace-label">Question</span>
              <span>{workspace.bootstrapQuestion}</span>
            </div>
          )}

          {workspace.files?.length > 0 && (
            <div className="workspace-file-list">
              {workspace.files.map((file) => (
                <span
                  key={file.name}
                  className={`workspace-file-pill ${file.exists ? 'workspace-file-pill-live' : 'workspace-file-pill-missing'}`}
                >
                  {file.name}
                </span>
              ))}
            </div>
          )}

          <div className="workspace-actions">
            <button type="button" className="toolbar-pill" onClick={onOpenWorkspace}>
              Open workspace
            </button>
            <button
              type="button"
              className="toolbar-pill"
              onClick={onCompleteBootstrap}
              disabled={!workspace.bootstrapPending}
            >
              Bootstrap done
            </button>
          </div>
        </div>
      )}

      {/* ── TTS error ─────────────────────────────────────────── */}
      {ttsStatus === 'error' && ttsLastError && (
        <div className="message message-system" role="alert">
          <div className="msg-bubble">
            <div className="msg-text">TTS error: {ttsLastError}</div>
          </div>
        </div>
      )}

      {/* ── Chat log ──────────────────────────────────────────── */}
      <div
        ref={listRef}
        className="chat-log"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Conversation"
      >
        {messages.length === 0 && (
          <div className="message message-system">
            <div className="msg-bubble">
              <div className="msg-text">Scrivi qualcosa per iniziare.</div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="message message-system" role="status">
                <div className="msg-bubble">
                  <div className="msg-text">{msg.text || ''}</div>
                </div>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          const isStreaming = Boolean(msg.streaming);
          const metaStr = msg.meta ? [
            msg.meta.emotion && `${msg.meta.emotion}`,
            msg.meta.gesture && `${msg.meta.gesture}`,
            msg.meta.pose && `pose:${msg.meta.pose}`,
          ].filter(Boolean).join(' · ') : null;

          return (
            <div
              key={msg.id}
              className={`message message-${msg.role}`}
            >
              {/* Avatar icon */}
              <div className={`msg-avatar msg-avatar-${isUser ? 'user' : 'nyx'}`} aria-hidden="true">
                {isUser ? 'Tu' : 'N'}
              </div>

              <div className="msg-content">
                {isStreaming && (
                  <div className="msg-streaming-label" aria-live="polite">
                    {msg.interrupted ? 'interrotto' : 'scrive…'}
                  </div>
                )}
                <div className="msg-bubble">
                  <div className="msg-text">
                    {msg.text || (isStreaming ? '' : '')}
                    {isStreaming && <span className="stream-cursor" aria-hidden="true" />}
                  </div>
                </div>
                <div className="msg-time">{formatTime(msg.ts)}</div>
                {metaStr && <div className="msg-meta">{metaStr}</div>}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isThinking && !messages.some((m) => m.streaming) && (
          <div className="message message-assistant" role="status" aria-live="polite" aria-label="Assistant is thinking">
            <div className="msg-avatar msg-avatar-nyx" aria-hidden="true">N</div>
            <div className="msg-content">
              <div className="msg-bubble">
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input row (inline) ────────────────────────────────── */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input-textarea"
          rows={1}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          placeholder={isBusy ? 'Attendere…' : 'Scrivi… (Enter invia, Shift+Enter a capo)'}
          aria-label="Messaggio per Nyx"
        />
        <button
          type="button"
          className="chat-send-icon-btn"
          onClick={submit}
          disabled={isBusy}
          aria-label={isBusy ? 'Attendere' : 'Invia'}
          title="Invia"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

export default AvatarChat;

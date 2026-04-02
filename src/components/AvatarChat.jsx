import React, { useEffect, useRef, useState } from 'react';

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
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function submit(event) {
    event?.preventDefault?.();
    const text = input.trim();
    if (!text || isBusy) return;
    setInput('');
    textareaRef.current?.focus();
    await onSend(text);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const showWorkspaceCard = Boolean(
    workspace
    && (
      workspace.bootstrapPending
      || workspace.bootstrapActive
    ),
  );

  const streamBadge = streamStatus === 'streaming' ? 'streaming'
    : streamStatus === 'connected' ? 'connected'
    : streamStatus === 'wait' ? 'wait'
    : streamStatus === 'speaking' ? 'speaking'
    : streamStatus === 'error' ? 'error'
    : 'off';

  return (
    <div className="chat-shell">

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="chat-toolbar">
        <button
          type="button"
          className={`toolbar-pill ${windowPrefs.avatarAlwaysOnTop ? 'toolbar-pill-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('avatar')}
          title="Toggle avatar always-on-top"
        >
          Avatar {windowPrefs.avatarAlwaysOnTop ? '📌' : '·'}
        </button>
        <button
          type="button"
          className={`toolbar-pill ${windowPrefs.chatAlwaysOnTop ? 'toolbar-pill-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('chat')}
          title="Toggle chat always-on-top"
        >
          Chat {windowPrefs.chatAlwaysOnTop ? '📌' : '·'}
        </button>
        <div className="toolbar-pill">
          {streamBadge === 'streaming' ? '⚡' : streamBadge === 'error' ? '✗' : '·'} {streamBadge}
        </div>
        {ttsStatus && ttsStatus !== 'idle' && (
          <div className="toolbar-pill">
            🔊 {ttsStatus}{Number.isFinite(ttsLatencyMs) ? ` ${ttsLatencyMs}ms` : ''}
          </div>
        )}
        <button
          type="button"
          className="toolbar-pill"
          onClick={onOpenSettings}
        >
          ⚙ Impostazioni
        </button>
      </div>

      {/* ── Workspace bootstrap card ──────────────────────────── */}
      {showWorkspaceCard && (
        <div className={`workspace-card ${workspace.bootstrapPending ? 'workspace-card-pending' : ''}`}>
          <div className="workspace-header">
            <div>
              <div className="workspace-eyebrow">Workspace</div>
              <div className="workspace-title">Bootstrap in corso</div>
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
              <span className="workspace-label">Domanda</span>
              <span>{workspace.bootstrapQuestion}</span>
            </div>
          )}

          {workspace.files?.length > 0 && (
            <div className="workspace-file-list">
              {workspace.files.map((file) => (
                <span key={file.name} className={`workspace-file-pill ${file.exists ? 'workspace-file-pill-live' : 'workspace-file-pill-missing'}`}>
                  {file.name}
                </span>
              ))}
            </div>
          )}

          <div className="workspace-actions">
            <button type="button" className="toolbar-pill" onClick={onOpenWorkspace}>
              Apri workspace
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
      {ttsLastError && (
        <div className="message message-system">
          <div className="message-role">tts error</div>
          <div className="message-text">{ttsLastError}</div>
        </div>
      )}

      {/* ── Chat log ──────────────────────────────────────────── */}
      <div ref={listRef} className="chat-log">
        {messages.length === 0 && (
          <div className="message message-system">
            <div className="message-role">sistema</div>
            <div className="message-text">
              Nyx è un agente autonomo — usa browser, desktop o risponde direttamente in base alla tua richiesta. Scrivi per iniziare.
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`message message-${message.role}${message.streaming ? ' message-streaming-active' : ''}`}
          >
            <div className="message-role">
              {message.role}
              {message.streaming ? ' · streaming' : ''}
              {message.interrupted ? ' · interrotto' : ''}
            </div>
            <div className="message-text">{message.text || (message.streaming ? '…' : '')}</div>
            {message.meta && (
              <div className="message-meta">
                {[
                  message.meta.emotion && `emotion: ${message.meta.emotion}`,
                  message.meta.mood && `mood: ${message.meta.mood}`,
                  message.meta.motion && `motion: ${message.meta.motion}`,
                  message.meta.motionType && `type: ${message.meta.motionType}`,
                ].filter(Boolean).join('  ·  ')}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator — visibile quando brain elabora ma non c'è ancora streaming */}
        {isThinking && !messages.some((m) => m.streaming) && (
          <div className="typing-indicator">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}
      </div>

      {/* ── Input form ────────────────────────────────────────── */}
      <form className="chat-form" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio… (Enter invia · Shift+Enter va a capo)"
          rows={3}
          disabled={isBusy}
        />
        <div className="chat-form-actions">
          {canStop && (
            <button type="button" className="secondary-button" onClick={onStop}>
              ✕ Stop
            </button>
          )}
          <button
            type="submit"
            className="chat-send-btn"
            disabled={isBusy || !input.trim()}
          >
            {isBusy ? 'In elaborazione…' : 'Invia →'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AvatarChat;

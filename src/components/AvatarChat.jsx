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

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function submit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;

    setInput('');
    await onSend(text);
  }

  const showWorkspaceCard = Boolean(
    workspace
    && (
      workspace.bootstrapPending
      || workspace.bootstrapActive
    ),
  );

  return (
    <div className="chat-shell">
      <div className="chat-toolbar">
        <button
          type="button"
          className={`toolbar-pill ${windowPrefs.avatarAlwaysOnTop ? 'toolbar-pill-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('avatar')}
        >
          Avatar top {windowPrefs.avatarAlwaysOnTop ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className={`toolbar-pill ${windowPrefs.chatAlwaysOnTop ? 'toolbar-pill-active' : ''}`}
          onClick={() => onToggleAlwaysOnTop('chat')}
        >
          Chat top {windowPrefs.chatAlwaysOnTop ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className="toolbar-pill toolbar-pill-stop"
          onClick={onStop}
          disabled={!canStop}
        >
          Stop
        </button>
        <div className="toolbar-pill">
          Stream {streamStatus || 'disconnected'}
        </div>
        <div className="toolbar-pill">
          TTS {ttsStatus || 'idle'}{Number.isFinite(ttsLatencyMs) ? ` ${ttsLatencyMs}ms` : ''}
        </div>
        <button
          type="button"
          className="toolbar-pill"
          onClick={onOpenSettings}
        >
          Impostazioni
        </button>
      </div>

      {showWorkspaceCard && (
        <div className={`workspace-card ${workspace.bootstrapPending ? 'workspace-card-pending' : ''}`}>
          <div className="workspace-header">
            <div>
              <div className="workspace-eyebrow">Workspace</div>
              <div className="workspace-title">OpenClaw-style bootstrap</div>
            </div>
            <div className="workspace-pills">
              <span className="workspace-pill">{workspace.bootstrapPending ? 'bootstrap pending' : 'bootstrap ready'}</span>
              {workspace.bootstrapActive && (
                <span className="workspace-pill">
                  round {workspace.bootstrapStepIndex || 1}
                </span>
              )}
              {workspace.startupBootPending && <span className="workspace-pill">boot pending</span>}
              {workspace.memoryFile && <span className="workspace-pill">{workspace.memoryFile}</span>}
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

          {workspace.dailyNotes?.length > 0 && (
            <div className="workspace-line">
              <span className="workspace-label">Daily</span>
              <span>{workspace.dailyNotes.map((note) => note.relativePath).join(', ')}</span>
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

      {ttsLastError && (
        <div className="message message-system">
          <div className="message-role">tts</div>
          <div className="message-text">{ttsLastError}</div>
        </div>
      )}

      <div ref={listRef} className="chat-log">
        {messages.length === 0 && (
          <div className="message message-system">
            <div className="message-role">system</div>
            <div className="message-text">
              Nyx e un agente autonomo: decide da solo quando usare browser, desktop o rispondere direttamente. Scrivi un messaggio per iniziare.
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <div className="message-role">
              {message.role}
              {message.streaming ? ' | streaming' : ''}
              {message.interrupted ? ' | interrupted' : ''}
            </div>
            <div className="message-text">{message.text || (message.streaming ? '...' : '')}</div>
            {message.meta && (
              <div className="message-meta">
                emotion: {message.meta.emotion || '-'} | mood: {message.meta.mood || '-'} | motion: {message.meta.motion || '-'} | motionType: {message.meta.motionType || '-'} | expression: {message.meta.expression || '-'}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Scrivi qui..."
          rows={3}
        />
        <div className="chat-form-actions">
          <button type="button" className="secondary-button" onClick={onStop} disabled={!canStop}>
            Stop
          </button>
          <button type="submit" disabled={isBusy}>
            {isBusy ? 'Busy...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AvatarChat;

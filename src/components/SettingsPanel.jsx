import React from 'react';
import DebugPanel from './DebugPanel';

function SettingsPanel({
  brain,
  onBack,
  onSelectBrain,
  onSaveOllama,
  onTestBrain,
  testResult,
  testPending,
  isBusy,
  userSettings,
  onSaveUserSettings,
  onSaveSoulSettings,
  onSaveIdentitySettings,
  debugLogs,
  onRefreshDebugLogs,
  onClearDebugLogs,
}) {
  const options = Array.isArray(brain?.options) ? brain.options : [];
  const ollamaHostInputId = 'ollama-host-input';
  const ollamaModelInputId = 'ollama-model-input';
  const [ollamaHost, setOllamaHost] = React.useState(brain?.ollama?.host || 'http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = React.useState(brain?.ollama?.model || 'llama3.2:1b');

  const [userName, setUserName] = React.useState(userSettings?.name || '');
  const [preferredName, setPreferredName] = React.useState(userSettings?.preferredName || '');
  const [timezone, setTimezone] = React.useState(userSettings?.timezone || 'Europe/Rome');
  const [privacy, setPrivacy] = React.useState(userSettings?.privacy || '');

  const [avatarName, setAvatarName] = React.useState(userSettings?.avatarName || 'Nyx');
  const [toneStyle, setToneStyle] = React.useState(userSettings?.toneStyle || 'pragmatic');
  const [voiceStyle, setVoiceStyle] = React.useState(userSettings?.voiceStyle || 'neutral');
  const [boundaries, setBoundaries] = React.useState(userSettings?.boundaries || '');

  const [role, setRole] = React.useState(userSettings?.role || '');
  const [focusContext, setFocusContext] = React.useState(userSettings?.focusContext || '');

  React.useEffect(() => {
    setOllamaHost(brain?.ollama?.host || 'http://127.0.0.1:11434');
    setOllamaModel(brain?.ollama?.model || 'llama3.2:1b');
  }, [brain?.ollama?.host, brain?.ollama?.model]);

  return (
    <div className="settings-shell">
      <div className="settings-header">
        <div>
          <div className="settings-eyebrow">Settings</div>
          <div className="settings-title">Brain API</div>
        </div>
        <div className="settings-actions settings-actions-header">
          <button
            type="button"
            className="toolbar-pill"
            onClick={() => onTestBrain(brain?.selectedId)}
            disabled={isBusy || testPending}
            aria-busy={testPending}
            aria-label={testPending ? 'Test del brain in corso' : 'Esegui test del brain selezionato'}
          >
            {testPending ? 'Test in corso...' : 'Test brain'}
          </button>
          <button type="button" className="toolbar-pill" onClick={onBack} aria-label="Back to chat">
            Back to chat
          </button>
        </div>
      </div>

      {brain?.sourcePath && (
        <div className="settings-line">
          <span className="settings-label">Source</span>
          <span className="settings-value">{brain.sourcePath}</span>
        </div>
      )}

      {testResult && (
        <div className={`brain-test-card ${testResult.ok ? 'brain-test-card-ok' : 'brain-test-card-error'}`} role="status" aria-live="polite">
          <div className="brain-test-title">Test {testResult.brainId || brain?.selectedId}</div>
          <div className="brain-test-text">{testResult.message}</div>
        </div>
      )}

      <div className="settings-section">
        {options.map((option) => {
          const isSelected = option.id === brain?.selectedId;
          return (
            <button
              key={option.id}
              type="button"
              className={`brain-option ${isSelected ? 'brain-option-selected' : ''}`}
              onClick={() => onSelectBrain(option.id)}
              disabled={isBusy}
              aria-pressed={isSelected}
              aria-label={`${option.label} ${option.available ? 'disponibile' : 'non disponibile'}${isSelected ? ', selezionato' : ''}`}
            >
              <div className="brain-option-header">
                <div>
                  <div className="brain-option-title">{option.label}</div>
                  <div className="brain-option-subtitle">{option.description}</div>
                </div>
                <div className="brain-option-pills">
                  <span className={`brain-option-pill ${option.available ? 'brain-option-pill-live' : 'brain-option-pill-missing'}`}>
                    {option.available ? 'available' : 'missing'}
                  </span>
                  {option.supportsSessionResume && (
                    <span className="brain-option-pill">resume</span>
                  )}
                </div>
              </div>

              <div className="brain-option-command">{option.commandPath}</div>
              {option.statusReason && (
                <div className="brain-option-status-note">{option.statusReason}</div>
              )}
            </button>
          );
        })}

        <div className="settings-section">
          <div className="settings-header">
            <div className="settings-eyebrow">User Settings</div>
            <div className="settings-title">Identity & Preferences</div>
          </div>

          <label className="settings-field">
            <span className="settings-label">Your Name</span>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">How to Call You</span>
            <input
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="Preferred name or nickname"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Rome"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Privacy Preferences</span>
            <input
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              placeholder="Memory sharing preferences"
            />
          </label>

          <div className="settings-actions">
            <button
              type="button"
              className="toolbar-pill"
              onClick={() => onSaveUserSettings({ name: userName, preferredName, timezone, privacy })}
              disabled={isBusy}
            >
              Save User Settings
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-header">
            <div className="settings-eyebrow">Avatar Settings</div>
            <div className="settings-title">Soul & Identity</div>
          </div>

          <label className="settings-field">
            <span className="settings-label">Avatar Name</span>
            <input
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              placeholder="Nyx"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Tone Style</span>
            <input
              value={toneStyle}
              onChange={(e) => setToneStyle(e.target.value)}
              placeholder="pragmatic, clear-headed"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Voice Style</span>
            <input
              value={voiceStyle}
              onChange={(e) => setVoiceStyle(e.target.value)}
              placeholder="neutral"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Boundaries</span>
            <input
              value={boundaries}
              onChange={(e) => setBoundaries(e.target.value)}
              placeholder="Hard constraints"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Role</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Operational role"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Focus Context</span>
            <input
              value={focusContext}
              onChange={(e) => setFocusContext(e.target.value)}
              placeholder="Default context"
            />
          </label>

          <div className="settings-actions">
            <button
              type="button"
              className="toolbar-pill"
              onClick={() => onSaveSoulSettings({ avatarName, toneStyle, voiceStyle, boundaries })}
              disabled={isBusy}
            >
              Save Soul Settings
            </button>
            <button
              type="button"
              className="toolbar-pill"
              onClick={() => onSaveIdentitySettings({ role, focusContext })}
              disabled={isBusy}
            >
              Save Identity Settings
            </button>
          </div>
        </div>

        <div className="ollama-card">
          <div className="brain-option-header">
            <div>
              <div className="brain-option-title">Configure Ollama</div>
              <div className="brain-option-subtitle">Used only when Ollama is selected as brain.</div>
            </div>
          </div>

          <label className="settings-field" htmlFor={ollamaHostInputId}>
            <span className="settings-label">Host</span>
            <input
              id={ollamaHostInputId}
              value={ollamaHost}
              onChange={(event) => setOllamaHost(event.target.value)}
              placeholder="http://127.0.0.1:11434"
            />
          </label>

          <label className="settings-field" htmlFor={ollamaModelInputId}>
            <span className="settings-label">Model</span>
            <input
              id={ollamaModelInputId}
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
              placeholder="llama3.2:1b"
            />
          </label>

          {Array.isArray(brain?.ollamaStatus?.availableModels) && brain.ollamaStatus.availableModels.length > 0 && (
            <div className="brain-option-status-note">
              Modelli trovati: {brain.ollamaStatus.availableModels.slice(0, 8).join(', ')}
            </div>
          )}

          <div className="settings-actions">
            <button
              type="button"
              className="toolbar-pill"
              onClick={() => onSaveOllama({ host: ollamaHost, model: ollamaModel })}
              disabled={isBusy}
              aria-label="Save Ollama configuration"
            >
              Save Ollama
            </button>
          </div>
        </div>
      </div>

      <DebugPanel
        debugLogs={debugLogs || []}
        onRefreshLogs={onRefreshDebugLogs}
        onClearLogs={onClearDebugLogs}
      />
    </div>
  );
}

export default SettingsPanel;

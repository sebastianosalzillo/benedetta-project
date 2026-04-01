import React from 'react';

function SettingsPanel({
  brain,
  onBack,
  onSelectBrain,
  onSaveOllama,
  onTestBrain,
  testResult,
  testPending,
  isBusy,
}) {
  const options = Array.isArray(brain?.options) ? brain.options : [];
  const [ollamaHost, setOllamaHost] = React.useState(brain?.ollama?.host || 'http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = React.useState(brain?.ollama?.model || 'qwen3.5:0.8b');

  React.useEffect(() => {
    setOllamaHost(brain?.ollama?.host || 'http://127.0.0.1:11434');
    setOllamaModel(brain?.ollama?.model || 'qwen3.5:0.8b');
  }, [brain?.ollama?.host, brain?.ollama?.model]);

  return (
    <div className="settings-shell">
      <div className="settings-header">
        <div>
          <div className="settings-eyebrow">Impostazioni</div>
          <div className="settings-title">Brain ACP</div>
        </div>
        <div className="settings-actions settings-actions-header">
          <button
            type="button"
            className="toolbar-pill"
            onClick={() => onTestBrain(brain?.selectedId)}
            disabled={isBusy || testPending}
          >
            {testPending ? 'Test in corso...' : 'Test brain'}
          </button>
          <button type="button" className="toolbar-pill" onClick={onBack}>
            Torna alla chat
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
        <div className={`brain-test-card ${testResult.ok ? 'brain-test-card-ok' : 'brain-test-card-error'}`}>
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

        <div className="ollama-card">
          <div className="brain-option-header">
            <div>
              <div className="brain-option-title">Configura Ollama</div>
              <div className="brain-option-subtitle">Usato solo quando selezioni Ollama come brain.</div>
            </div>
          </div>

          <label className="settings-field">
            <span className="settings-label">Host</span>
            <input
              value={ollamaHost}
              onChange={(event) => setOllamaHost(event.target.value)}
              placeholder="http://127.0.0.1:11434"
            />
          </label>

          <label className="settings-field">
            <span className="settings-label">Model</span>
            <input
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
              placeholder="qwen3.5:0.8b"
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
            >
              Salva Ollama
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;

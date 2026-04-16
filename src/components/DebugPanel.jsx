import React from 'react';

function DebugPanel({
  debugLogs,
  onRefreshLogs,
  onClearLogs,
}) {
  return (
    <div className="settings-section">
      <div className="settings-header">
        <div className="settings-eyebrow">Debug</div>
        <div className="settings-title">Timeline Logs</div>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="toolbar-pill"
          onClick={onRefreshLogs}
        >
          Refresh Logs
        </button>
        <button
          type="button"
          className="toolbar-pill"
          onClick={onClearLogs}
        >
          Clear Logs
        </button>
      </div>

      <div className="debug-logs">
        {debugLogs.map((log, index) => (
          <div key={index} className="debug-log-entry">
            <div className="debug-log-header">
              <span className="debug-log-type">{log.eventType}</span>
              <span className="debug-log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <pre className="debug-log-data">{JSON.stringify(log.data, null, 2)}</pre>
          </div>
        ))}
      </div>

      <style jsx>{`
        .debug-logs {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid #ccc;
          padding: 10px;
          background: #f9f9f9;
        }
        .debug-log-entry {
          margin-bottom: 10px;
          padding: 5px;
          border: 1px solid #ddd;
          background: white;
        }
        .debug-log-header {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
        }
        .debug-log-type {
          color: #007acc;
        }
        .debug-log-time {
          color: #666;
          font-size: 0.8em;
        }
        .debug-log-data {
          font-size: 0.8em;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}

export default DebugPanel;

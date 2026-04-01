import React, { useEffect, useMemo, useState } from 'react';

function renderFileSizeLabel(entry) {
  if (entry.type === 'dir') return 'folder';
  return 'file';
}

function CanvasWorkspace({ canvasState, onClose, onLayoutChange }) {
  const content = canvasState?.content || { type: 'empty', title: 'Canvas', value: '' };
  const [draft, setDraft] = useState(content.value || '');
  const [browserUrl, setBrowserUrl] = useState(content.currentUrl || content.url || '');
  const [browserRef, setBrowserRef] = useState('');
  const [browserInput, setBrowserInput] = useState('');
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState('');

  useEffect(() => {
    setDraft(content.value || '');
  }, [content.value, content.path, content.type]);

  useEffect(() => {
    setBrowserUrl(content.currentUrl || content.url || '');
    setBrowserError(content.message || '');
  }, [content.currentUrl, content.message, content.type, content.url]);

  const title = useMemo(() => content.title || 'Canvas', [content.title]);

  async function handlePasteFromClipboard() {
    const result = await window.electronAPI?.readClipboardText?.();
    if (result?.ok) {
      setDraft(result.text || '');
    }
  }

  async function handleCopyToClipboard() {
    await window.electronAPI?.writeClipboardText?.(draft);
  }

  async function runBrowserCall(action) {
    setBrowserBusy(true);
    setBrowserError('');

    try {
      const result = await action();
      if (!result?.ok) {
        setBrowserError(result?.error || 'Browser action failed.');
      }
    } catch (error) {
      setBrowserError(error?.message || 'Browser action failed.');
    } finally {
      setBrowserBusy(false);
    }
  }

  async function handleBrowserNavigate() {
    await runBrowserCall(() => window.electronAPI?.browserNavigate?.({
      url: browserUrl,
      title: title || 'Browser',
    }));
  }

  async function handleBrowserRefresh() {
    await runBrowserCall(() => window.electronAPI?.browserRefresh?.({
      url: browserUrl || content.currentUrl || content.url || '',
    }));
  }

  async function handleBrowserClick(ref) {
    setBrowserRef(ref);
    await runBrowserCall(() => window.electronAPI?.browserAction?.({
      kind: 'click',
      ref,
      waitNav: true,
    }));
  }

  async function handleBrowserType() {
    if (!browserRef.trim()) {
      setBrowserError('Choose or type a ref first.');
      return;
    }

    await runBrowserCall(() => window.electronAPI?.browserAction?.({
      kind: 'type',
      ref: browserRef.trim(),
      text: browserInput,
    }));
  }

  async function handleBrowserPressEnter() {
    await runBrowserCall(() => window.electronAPI?.browserAction?.({
      kind: 'press',
      key: 'Enter',
      waitAfterMs: 900,
    }));
  }

  return (
    <div className="canvas-shell">
      <div className="canvas-toolbar">
        <div className="canvas-title-block">
          <div className="eyebrow">Nyx Canvas</div>
          <h1>{title}</h1>
        </div>
        <div className="canvas-actions">
          <button type="button" className="toolbar-pill" onClick={() => onLayoutChange('right-docked')}>
            Docked
          </button>
          <button type="button" className="toolbar-pill" onClick={() => onLayoutChange('split-50')}>
            Split 50
          </button>
          <button type="button" className="toolbar-pill toolbar-pill-stop" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="canvas-meta">
        <span>Layout: {canvasState?.layout || 'right-docked'}</span>
        <span>Type: {content.type || 'empty'}</span>
        {content.path ? <span>Path: {content.path}</span> : null}
        {content.currentUrl ? <span>URL: {content.currentUrl}</span> : null}
      </div>

      <div className="canvas-body">
        {content.type === 'text' && (
          <div className="canvas-card">
            <div className="canvas-card-actions">
              <button type="button" className="toolbar-pill" onClick={handleCopyToClipboard}>Copy</button>
            </div>
            <textarea
              className="canvas-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              readOnly={!content.editable}
            />
          </div>
        )}

        {content.type === 'clipboard' && (
          <div className="canvas-card">
            <div className="canvas-card-actions">
              <button type="button" className="toolbar-pill" onClick={handlePasteFromClipboard}>Paste</button>
              <button type="button" className="toolbar-pill" onClick={handleCopyToClipboard}>Copy</button>
            </div>
            <textarea
              className="canvas-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
        )}

        {content.type === 'files' && (
          <div className="canvas-card canvas-files">
            {content.entries?.length ? content.entries.map((entry) => (
              <div key={entry.path} className="canvas-file-row">
                <span className={`canvas-file-badge canvas-file-badge-${entry.type}`}>{renderFileSizeLabel(entry)}</span>
                <span className="canvas-file-name">{entry.name}</span>
              </div>
            )) : (
              <div className="canvas-empty">Cartella vuota o non accessibile.</div>
            )}
          </div>
        )}

        {content.type === 'image' && (
          <div className="canvas-card canvas-media-card">
            <img className="canvas-image" src={content.src} alt={title} />
          </div>
        )}

        {content.type === 'video' && (
          <div className="canvas-card canvas-media-card">
            <video className="canvas-video" src={content.src} controls autoPlay />
          </div>
        )}

        {content.type === 'audio' && (
          <div className="canvas-card canvas-media-card">
            <audio className="canvas-audio" src={content.src} controls autoPlay />
          </div>
        )}

        {content.type === 'browser' && (
          <div className="canvas-card canvas-browser-card">
            <div className="canvas-browser-toolbar">
              <input
                className="canvas-browser-input"
                type="text"
                value={browserUrl}
                onChange={(event) => setBrowserUrl(event.target.value)}
                placeholder="https://example.com"
                disabled={browserBusy}
              />
              <button type="button" className="toolbar-pill" onClick={handleBrowserNavigate} disabled={browserBusy}>
                Go
              </button>
              <button type="button" className="toolbar-pill" onClick={handleBrowserRefresh} disabled={browserBusy}>
                Refresh
              </button>
              <button type="button" className="toolbar-pill" onClick={handleBrowserPressEnter} disabled={browserBusy}>
                Enter
              </button>
            </div>

            <div className="canvas-browser-meta">
              <span>Status: {content.status || 'idle'}</span>
              <span>Page: {content.pageTitle || title}</span>
              <span>Refs: {content.snapshotItems?.length || 0}</span>
              <span>Tabs: {content.tabs?.length || 0}</span>
            </div>

            {browserError ? <div className="canvas-browser-error">{browserError}</div> : null}

            <div className="canvas-browser-grid">
              <div className="canvas-browser-panel canvas-browser-visual">
                <div className="canvas-browser-panel-title">Screenshot</div>
                {content.screenshotSrc ? (
                  <img className="canvas-browser-screenshot" src={content.screenshotSrc} alt={content.pageTitle || title} />
                ) : (
                  <div className="canvas-empty">No screenshot available.</div>
                )}
              </div>

              <div className="canvas-browser-panel">
                <div className="canvas-browser-panel-title">Readable text</div>
                <textarea className="canvas-browser-text" value={content.text || ''} readOnly />
              </div>

              <div className="canvas-browser-panel">
                <div className="canvas-browser-panel-title">Interactive refs</div>
                <div className="canvas-browser-ref-bar">
                  <input
                    className="canvas-browser-ref-input"
                    type="text"
                    value={browserRef}
                    onChange={(event) => setBrowserRef(event.target.value)}
                    placeholder="e0"
                    disabled={browserBusy}
                  />
                  <input
                    className="canvas-browser-ref-input canvas-browser-ref-text"
                    type="text"
                    value={browserInput}
                    onChange={(event) => setBrowserInput(event.target.value)}
                    placeholder="Text to type"
                    disabled={browserBusy}
                  />
                  <button type="button" className="toolbar-pill" onClick={handleBrowserType} disabled={browserBusy}>
                    Type
                  </button>
                </div>

                <div className="canvas-browser-ref-list">
                  {content.snapshotItems?.length ? content.snapshotItems.map((item, index) => (
                    <div
                      key={`${item.ref || 'node'}-${index}`}
                      className={`canvas-browser-ref-row ${browserRef === item.ref ? 'canvas-browser-ref-row-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="canvas-browser-ref-tag"
                        onClick={() => setBrowserRef(item.ref || '')}
                        disabled={!item.ref}
                      >
                        {item.ref || 'node'}
                      </button>
                      <div className="canvas-browser-ref-copy">
                        <div className="canvas-browser-ref-role">{item.role || 'node'}</div>
                        <div className="canvas-browser-ref-label">{item.label || 'Untitled node'}</div>
                      </div>
                      <button
                        type="button"
                        className="toolbar-pill"
                        onClick={() => handleBrowserClick(item.ref)}
                        disabled={!item.ref || browserBusy}
                      >
                        Click
                      </button>
                    </div>
                  )) : (
                    <div className="canvas-empty">No interactive refs found yet.</div>
                  )}
                </div>

                {content.snapshotText ? (
                  <pre className="canvas-browser-snapshot">{content.snapshotText}</pre>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {(content.type === 'empty' || !content.type) && (
          <div className="canvas-empty">
            Nyx puo aprire qui testo, clipboard, file, immagini, video, audio e browser.
          </div>
        )}
      </div>
    </div>
  );
}

export default CanvasWorkspace;

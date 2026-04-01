function safeClose(targetWindow) {
  if (!targetWindow || isRendererUnavailable(targetWindow)) {
    return false;
  }

  targetWindow.close();
  return true;
}

function isRendererUnavailable(targetWindow) {
  return Boolean(
    !targetWindow
      || targetWindow.isDestroyed()
      || targetWindow.webContents?.isDestroyed()
      || targetWindow.webContents?.isCrashed(),
  );
}

function shouldStopForRendererError(error) {
  return error instanceof Error && error.message.includes('Render frame was disposed');
}

function stopLoopWhenRendererIsGone(targetWindow, stop) {
  targetWindow.on('closed', stop);
  targetWindow.webContents.on('destroyed', stop);
  targetWindow.webContents.on('render-process-gone', stop);
}

function createRendererLoop(params) {
  const interval = params.interval ?? 1000;
  let timer = null;
  let running = false;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = async () => {
    if (running || isRendererUnavailable(params.window)) {
      if (isRendererUnavailable(params.window)) {
        stop();
      }
      return;
    }

    running = true;
    try {
      await params.run();
    } catch (error) {
      if (shouldStopForRendererError(error)) {
        stop();
      } else {
        throw error;
      }
    } finally {
      running = false;
    }
  };

  stopLoopWhenRendererIsGone(params.window, stop);

  const start = () => {
    if (timer || isRendererUnavailable(params.window)) {
      return;
    }

    timer = setInterval(() => {
      void tick();
    }, interval);
  };

  if (params.autoStart !== false) {
    start();
  }

  return { start, stop };
}

module.exports = {
  safeClose,
  isRendererUnavailable,
  shouldStopForRendererError,
  stopLoopWhenRendererIsGone,
  createRendererLoop,
};

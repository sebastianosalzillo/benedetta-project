const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMutationObserverFactory() {
  const instances = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      instances.push(this);
    }
  }

  return {
    MutationObserver: FakeMutationObserver,
    instances,
  };
}

function createContext({ withHead = false, withRoot = false, withBody = false } = {}) {
  const electron = {
    ipcRenderer: {
      send: jest.fn(),
      on: jest.fn(),
    },
    contextBridge: {
      exposeInMainWorld: jest.fn(),
    },
  };
  const mutation = createMutationObserverFactory();

  const rootNode = withRoot ? { firstChild: null, insertBefore: jest.fn(), style: { setProperty: jest.fn() } } : null;
  const headNode = withHead ? { firstChild: null, insertBefore: jest.fn() } : null;
  const bodyNode = withBody ? { style: { setProperty: jest.fn() } } : null;

  const document = {
    documentElement: rootNode,
    head: headNode,
    body: bodyNode,
    createElement: jest.fn(() => ({
      id: '',
      textContent: '',
      parentNode: null,
    })),
  };

  const window = {
    dispatchEvent: jest.fn(),
  };

  const context = vm.createContext({
    document,
    window,
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    MutationObserver: mutation.MutationObserver,
    require: (name) => {
      if (name === 'electron') return electron;
      throw new Error(`Unexpected require: ${name}`);
    },
  });

  return { context, document, window, electron, mutation };
}

describe('avatar-window-bridge preload', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'electron', 'avatar-window-bridge.js'), 'utf8');

  test('does not crash when head and documentElement are not available yet', () => {
    const fixture = createContext();

    expect(() => vm.runInContext(script, fixture.context)).not.toThrow();
    expect(fixture.mutation.instances).toHaveLength(1);
    expect(fixture.mutation.instances[0].observe).toHaveBeenCalledWith(fixture.context.document, { childList: true, subtree: true });
    expect(fixture.electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('__nyxBridge', expect.any(Object));
  });

  test('injects the early style into head when available immediately', () => {
    const fixture = createContext({ withHead: true, withRoot: true, withBody: true });

    vm.runInContext(script, fixture.context);

    expect(fixture.document.head.insertBefore).toHaveBeenCalledTimes(1);
    expect(fixture.document.body.style.setProperty).toHaveBeenCalledWith('background', 'transparent', 'important');
    expect(fixture.electron.ipcRenderer.on).toHaveBeenCalledWith('avatar-command', expect.any(Function));
    expect(fixture.electron.ipcRenderer.on).toHaveBeenCalledWith('avatar-status', expect.any(Function));
  });
});

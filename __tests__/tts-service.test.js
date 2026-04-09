jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const childProcess = require('child_process');
const fs = require('fs');
const { resolvePythonLaunch } = require('../electron/tts-service');

describe('resolvePythonLaunch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
  });

  test('skips py -3 when kokoro is missing and falls back to python with kokoro installed', () => {
    childProcess.spawnSync.mockImplementation((command, args) => {
      const joined = `${command} ${args.join(' ')}`;
      if (joined.includes("py -3 -c import kokoro")) {
        return { status: 1, error: null };
      }
      if (joined.includes("python -c import kokoro")) {
        return { status: 0, error: null };
      }
      return { status: 1, error: null };
    });

    expect(resolvePythonLaunch('')).toEqual({
      command: 'python',
      args: [],
      displayValue: 'python',
    });
  });

  test('accepts an explicit launcher spec when it can import kokoro', () => {
    childProcess.spawnSync.mockImplementation((command, args) => {
      const joined = `${command} ${args.join(' ')}`;
      if (joined.includes("python -c import kokoro")) {
        return { status: 0, error: null };
      }
      return { status: 1, error: null };
    });

    expect(resolvePythonLaunch('python')).toEqual({
      command: 'python',
      args: [],
      displayValue: 'python',
    });
  });
});

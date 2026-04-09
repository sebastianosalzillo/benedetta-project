const path = require('path');
const { resolveAppAssetPath } = require('../electron/app-protocol');

describe('app protocol resolver', () => {
  const distRoot = path.resolve('C:/tmp/dist');

  test('maps the root app URL to index.html', () => {
    expect(resolveAppAssetPath('app://app/index.html', distRoot)).toBe(path.join(distRoot, 'index.html'));
  });

  test('maps nested asset URLs under dist root', () => {
    expect(resolveAppAssetPath('app://app/talkinghead/index.html', distRoot)).toBe(path.join(distRoot, 'talkinghead', 'index.html'));
  });

  test('rejects path traversal outside dist root', () => {
    expect(() => resolveAppAssetPath('app://../secret.txt', distRoot)).toThrow(/outside dist root/);
  });
});

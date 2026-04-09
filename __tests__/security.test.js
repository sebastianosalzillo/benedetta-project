const {
  assertTrustedIpcSender,
  buildRendererCsp,
  isAllowedWebviewSource,
  isTrustedAppUrl,
} = require('../electron/security');

describe('security helpers', () => {
  test('accepts app protocol URLs as trusted renderer origins', () => {
    expect(isTrustedAppUrl('app://app/index.html?screen=chat')).toBe(true);
  });

  test('accepts default local dev server URLs as trusted renderer origins', () => {
    expect(isTrustedAppUrl('http://localhost:5174/?screen=chat')).toBe(true);
  });

  test('rejects arbitrary remote origins', () => {
    expect(isTrustedAppUrl('https://evil.example.com')).toBe(false);
  });

  test('allows only talkinghead webview sources', () => {
    expect(isAllowedWebviewSource('app://app/talkinghead/index.html')).toBe(true);
    expect(isAllowedWebviewSource('app://app/index.html')).toBe(false);
  });

  test('throws on untrusted IPC sender', () => {
    expect(() => assertTrustedIpcSender({ senderFrame: { url: 'https://evil.example.com' } }, 'chat:send')).toThrow(
      /Blocked IPC channel/,
    );
  });

  test('builds a restrictive renderer CSP', () => {
    const csp = buildRendererCsp();
    expect(csp).toContain("default-src 'self' app: data: blob:");
    expect(csp).toContain("connect-src 'self' app: blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

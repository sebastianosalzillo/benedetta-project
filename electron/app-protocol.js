const path = require('path');
const { pathToFileURL } = require('url');
const { APP_PROTOCOL_SCHEME } = require('./security');

function registerAppProtocolSchemes(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL_SCHEME.replace(':', ''),
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

function resolveAppAssetPath(requestUrl, distRoot) {
  const parsed = new URL(requestUrl);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  const hostPrefix = parsed.hostname && parsed.hostname !== 'app' ? `/${parsed.hostname}` : '';
  const target = pathname === '/' ? `${hostPrefix || ''}/index.html` : `${hostPrefix}${pathname}`;
  const resolvedPath = path.resolve(distRoot, `.${target}`);
  const normalizedRoot = path.resolve(distRoot);

  if (!(resolvedPath === normalizedRoot || resolvedPath.startsWith(`${normalizedRoot}${path.sep}`))) {
    throw new Error(`Refusing to serve path outside dist root: ${requestUrl}`);
  }

  return resolvedPath;
}

function installAppProtocol(protocol, net, options = {}) {
  const distRoot = options.distRoot || path.join(__dirname, '..', 'dist');

  protocol.handle(APP_PROTOCOL_SCHEME.replace(':', ''), (request) => {
    const filePath = resolveAppAssetPath(request.url, distRoot);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

module.exports = {
  installAppProtocol,
  registerAppProtocolSchemes,
  resolveAppAssetPath,
};

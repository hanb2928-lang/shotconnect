const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

delete config.watcher?.unstable_workerThreads;

config.watcher = {
  ...config.watcher,
  watchFolders: config.watcher?.watchFolders,
  healthCheck: { enabled: false },
};

config.server = {
  ...config.server,
  hmrEnabled: false,
};

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    ...(config.transformer.minifierConfig || {}),
    keep_classnames: true,
    keep_fnames: true,
  },
  // Raise the inline-bytes threshold so small assets (icons, tiny
  // images) are embedded as base64 instead of emitting separate
  // HTTP requests that block first paint on web preview.
  maxWorkerSize: 512 * 1024 * 1024,
};

const projectRoot = __dirname;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const resolvedPath = path.resolve(projectRoot, moduleName.slice(2));
    return context.resolveRequest(
      { ...context, moduleName: resolvedPath },
      resolvedPath,
      platform,
    );
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

const { getDefaultConfig } = require('expo/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

delete config.watcher?.unstable_workerThreads;

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

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

config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig || {}),
  keep_classnames: true,
  keep_fnames: true,
};

module.exports = wrapWithReanimatedMetroConfig(config);

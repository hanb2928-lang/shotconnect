const { getDefaultConfig } = require('expo/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

const config = getDefaultConfig(__dirname);

delete config.watcher?.unstable_workerThreads;

config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig || {}),
  keep_classnames: true,
  keep_fnames: true,
};

module.exports = wrapWithReanimatedMetroConfig(config);

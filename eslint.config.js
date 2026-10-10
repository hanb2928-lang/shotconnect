// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const noDirectAppStateListener = require('./eslint-rules/no-direct-appstate-listener');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    plugins: {
      'local': {
        rules: {
          'no-direct-appstate-listener': noDirectAppStateListener,
        },
      },
    },
    rules: {
      'local/no-direct-appstate-listener': 'error',
    },
  },
]);

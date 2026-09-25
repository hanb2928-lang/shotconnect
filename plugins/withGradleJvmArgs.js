const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;

    const set = (key, value) => {
      const existing = props.find((p) => p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ key, value, type: 'property' });
      }
    };

    set('org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dorg.gradle.daemon=false -XX:+UseParallelGC');
    set('org.gradle.workers.max', '4');
    set('org.gradle.configureondemand', 'false');
    set('org.gradle.configuration-cache', 'false');
    set('org.gradle.caching', 'true');
    set('android.suppressUnsupportedCompileSdk', '36');

    return config;
  });
};

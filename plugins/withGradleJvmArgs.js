const { withGradleProperties, withSettingsGradle } = require('expo/config-plugins');

module.exports = function withGradleJvmArgs(config) {
  config = withGradleProperties(config, (config) => {
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
    set('org.gradle.parallel', 'false');
    set('org.gradle.workers.max', '4');
    set('org.gradle.configureondemand', 'false');
    set('org.gradle.configuration-cache', 'false');
    set('org.gradle.caching', 'false');
    set('android.suppressUnsupportedCompileSdk', '36');
    set('android.builder.sdkDownload', 'true');
    set('android.packagingOptions.pickFirsts', '**/libc++_shared.so,**/libfbjni.so,**/libreactnativejni.so');

    return config;
  });

  config = withSettingsGradle(config, (config) => {
    const contents = config.modResults.contents;
    config.modResults.contents = contents.replace(
      /rootProject\.name\s*=\s*['"].*['"]/,
      "rootProject.name = 'SnapAndConnect'",
    );
    return config;
  });

  return config;
};

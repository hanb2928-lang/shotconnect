const { withGradleProperties } = require('@expo/config-plugins');

function withOptimizedGradle(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;

    function set(key, value) {
      const existing = props.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    }

    function remove(key) {
      let idx;
      while ((idx = props.findIndex((p) => p.type === 'property' && p.key === key)) >= 0) {
        props.splice(idx, 1);
      }
    }

    set('org.gradle.jvmargs', '-Xmx8192m -XX:MaxMetaspaceSize=2048m -XX:+HeapDumpOnOutOfMemoryError -XX:+UseParallelGC -Dfile.encoding=UTF-8');
    set('org.gradle.workers.max', '4');
    set('org.gradle.configureondemand', 'false');
    set('org.gradle.parallel', 'true');
    set('org.gradle.caching', 'true');
    set('kotlin.daemon.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    set('reactNativeArchitectures', 'arm64-v8a');
    set('hermesEnabled', 'true');
    set('newArchEnabled', 'false');
    set('android.enableMinifyInReleaseBuilds', 'false');
    set('android.enableShrinkResourcesInReleaseBuilds', 'false');
    set('android.packagingOptions.pickFirsts', '**/libc++_shared.so,**/libfbjni.so');
    set('android.ndkVersion', '27.1.12297006');
    set('android.buildToolsVersion', '36.0.0');
    set('android.minSdkVersion', '24');
    set('android.compileSdkVersion', '36');
    set('android.targetSdkVersion', '36');

    remove('edgeToEdgeEnabled');
    remove('expo.edgeToEdgeEnabled');
    remove('react.edgeToEdgeEnabled');

    return cfg;
  });
}

module.exports = withOptimizedGradle;

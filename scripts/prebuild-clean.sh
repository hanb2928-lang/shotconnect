#!/bin/bash
set -e

echo "=== EAS Prebuild Cache Purge ==="

# Remove any stale android directory from previous builds
rm -rf android

# Purge Gradle caches that may contain corrupted metadata from prior failed builds
rm -rf ~/.gradle/caches/transforms-* 2>/dev/null || true
rm -rf ~/.gradle/caches/modules-* 2>/dev/null || true
rm -rf ~/.gradle/caches/build-cache-* 2>/dev/null || true
rm -rf ~/.gradle/caches/*.lock 2>/dev/null || true

# Purge any stale Expo prebuild cache
rm -rf .expo/android 2>/dev/null || true

# Clean npm cache to force fresh resolution
npm cache verify 2>/dev/null || true

echo "=== Cache purge complete, running prebuild ==="

# Run fresh prebuild
npx expo prebuild --platform android --clean --no-install

echo "=== Prebuild complete, patching generated Gradle files ==="

# Ensure no stale Gradle daemon lock files remain in the generated project
find android -name "*.lock" -delete 2>/dev/null || true

# Ensure Gradle wrapper is executable
chmod +x android/gradlew 2>/dev/null || true

echo "=== All patches applied ==="

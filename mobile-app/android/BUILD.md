# Android Build Configuration

This document explains the Android build configuration and how it differs between local development and CI.

## Configuration Files

### `gradle.properties`
Main Gradle configuration used for **local development builds**.

**Key settings:**
- Memory: 2GB heap (reasonable for local machines)
- Architectures: All 4 (armeabi-v7a, arm64-v8a, x86, x86_64)
- Kotlin: Daemon mode (more stable for development)

### `gradle-ci.properties`
CI-specific overrides for **GitHub Actions builds**.

**Optimizations:**
- Memory: 5GB heap (uses available 7GB RAM in CI)
- Architectures: Only arm64-v8a (saves ~25 minutes)
- Kotlin: In-process mode (faster for one-time builds)

The CI workflow appends these properties to override the defaults.

## Build Times

### Local Build (All Architectures)
- Expected: 15-20 minutes for release build
- Builds all 4 CPU architectures
- Full testing compatibility

### CI Build (arm64-v8a only)
- Expected: 10-12 minutes for release build
- Builds only arm64-v8a (99% of modern devices)
- Optimized for speed

## Slowest Parts

Based on CI logs analysis:
1. **CMake C++ compilation**: ~80-90% of build time
   - React Native C++ engine
   - Native modules (Reanimated, Gesture Handler, etc.)
2. **Gradle configuration**: ~5-10%
3. **Dexing and packaging**: ~5-10%

## Local Development

Build locally with all architectures:
```bash
cd mobile-app/android
./gradlew assembleRelease
```

Build for specific architecture (faster):
```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## CI Build Process

The CI workflow (`../.github/workflows/build-android.yml`):
1. Sets up environment (Node, Go, Java)
2. Builds Go backend
3. Applies CI-specific Gradle properties
4. Runs `./gradlew assembleRelease --no-daemon`
5. Uploads APK artifact

## Troubleshooting

### Out of Memory
If builds fail with OOM locally, increase heap in `gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g
```

### Slow Local Builds
Build only one architecture for faster iteration:
```bash
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

### CI Build Too Slow
Check if CMake is building multiple architectures. The CI should only build arm64-v8a.
Verify `gradle-ci.properties` has:
```properties
reactNativeArchitectures=arm64-v8a
```
#!/bin/bash
set -e
echo "============================================"
echo "  ShortConnect Android APK Build"
echo "============================================"
echo ""

# ── Path check (no Korean or spaces) ──
PROJECT_PATH="$(pwd)"
if echo "$PROJECT_PATH" | grep -qP '[\x{AC00}-\x{D7AF}]'; then
    echo "ERROR: Project path contains Korean characters."
    echo "       Current path: $PROJECT_PATH"
    echo ""
    echo "Move the project folder to an English-only path."
    echo "  e.g., C:\\dev\\shortconnect  or  ~/projects/shortconnect"
    exit 1
fi
if echo "$PROJECT_PATH" | grep -q ' '; then
    echo "ERROR: Project path contains spaces."
    echo "       Current path: $PROJECT_PATH"
    echo ""
    echo "Remove spaces from the folder name or move to an English path."
    exit 1
fi
echo "Path check passed."
echo ""

export EAS_NO_VCS=1
export EAS_NO_GIT=1
export EXPO_NO_TELEMETRY=1

echo "[1/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Download: https://nodejs.org (LTS version)"
    exit 1
fi
echo "Node.js $(node --version) confirmed."
echo ""

echo "[2/5] Installing packages... (may take a few minutes)"
npm install --legacy-peer-deps
echo "Package installation complete."
echo ""

echo "[3/5] Verifying node_modules..."
if [ ! -d "node_modules/expo-router" ]; then
    echo "ERROR: node_modules incomplete. expo-router not found."
    echo "Fix: rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
fi
if [ ! -d "node_modules/expo" ]; then
    echo "ERROR: node_modules incomplete. expo not found."
    echo "Fix: rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
fi
if [ ! -d "node_modules/react-native" ]; then
    echo "ERROR: node_modules incomplete. react-native not found."
    echo "Fix: rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
fi
if [ ! -d "node_modules/react-native-reanimated" ]; then
    echo "ERROR: node_modules incomplete. react-native-reanimated not found."
    echo "Fix: rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
fi
if [ ! -d "node_modules/react-native-worklets" ]; then
    echo "ERROR: node_modules incomplete. react-native-worklets not found."
    echo "Fix: rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
fi
echo "node_modules verification passed."
echo ""

# ── Check if EAS or local build ──
USE_EAS=true

if [ "$USE_EAS" = true ]; then
    echo "[4/5] EAS CLI setup..."
    npm install -g eas-cli 2>/dev/null || true
    echo "EAS CLI ready."
    echo ""

    echo "[5/5] EAS login check..."
    if ! eas whoami > /dev/null 2>&1; then
        echo "EAS login required."
        echo "Create an account at https://expo.dev/signup if you don't have one."
        echo ""
        eas login
        if ! eas whoami > /dev/null 2>&1; then
            echo "ERROR: Login failed."
            echo ""
            echo "============================================"
            echo "  EAS login failed. Trying local build..."
            echo "============================================"
            USE_EAS=false
        fi
    else
        echo "Logged in as: $(eas whoami)"
    fi

    if [ "$USE_EAS" = true ]; then
        # Check projectId
        PROJECT_ID=$(node -e "
        try {
          const c = require('./app.json');
          const id = c?.expo?.extra?.eas?.projectId || '';
          console.log(id);
        } catch { console.log(''); }
        ")

        if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "" ]; then
            echo "No project ID found. Creating new project..."
            eas init --non-interactive 2>/dev/null || {
                echo "Auto-init failed. Running interactive init..."
                eas init
            }
            echo "Project linked."
        else
            echo "Existing project ID: $PROJECT_ID"
            if ! eas build:list --limit 1 > /dev/null 2>&1; then
                echo "Cannot access existing project. Creating new one..."
                node -e "
const fs = require('fs');
let s = fs.readFileSync('app.json','utf8');
s = s.replace(/\"projectId\": \"[^\"]*\"/, '\"projectId\": \"\"');
fs.writeFileSync('app.json', s);
"
                eas init --non-interactive 2>/dev/null || eas init
                echo "New project linked."
            else
                echo "Project connection OK."
            fi
        fi
        echo ""

        echo "Starting Android APK build on EAS... (10-15 minutes)"
        echo "Build profile: preview (standalone APK, no dev-client needed)"
        echo ""

        eas build --platform android --profile preview --clear-cache --non-interactive || {
            echo ""
            echo "============================================"
            echo "  EAS build failed."
            echo "============================================"
            echo ""
            echo "Common fixes:"
            echo "  1. Build quota exhausted -> sign up with a new email: https://expo.dev/signup"
            echo "  2. Project link error -> eas logout && eas login && eas init"
            echo "  3. Session expired -> eas logout && eas login"
            echo "  4. node_modules error -> rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
            echo ""
            echo "Alternative: Use GitHub Actions to build without EAS."
            echo "  See GITHUB_ACTIONS_BUILD.md for instructions."
            exit 1
        }

        echo ""
        echo "============================================"
        echo "  Build complete!"
        echo "  Download the APK from the URL above."
        echo "  Or visit https://expo.dev -> Account -> Builds"
        echo "============================================"
        exit 0
    fi
fi

# ── Local build fallback (no EAS required) ──
if [ "$USE_EAS" = false ]; then
    echo ""
    echo "============================================"
    echo "  Local Gradle Build (no EAS required)"
    echo "============================================"
    echo ""

    echo "Checking Java..."
    if ! command -v java &> /dev/null; then
        echo "ERROR: Java is not installed."
        echo "Install JDK 17:"
        echo "  Ubuntu: sudo apt install openjdk-17-jdk"
        echo "  macOS: brew install openjdk@17"
        echo "  Windows: download from https://adoptium.net/"
        exit 1
    fi
    echo "Java: $(java -version 2>&1 | head -1)"
    echo ""

    echo "Running expo prebuild..."
    npx expo prebuild --platform android --clean
    echo "Prebuild complete."
    echo ""

    echo "Building APK with Gradle..."
    cd android
    chmod +x gradlew
    ./gradlew assembleRelease --no-daemon --stacktrace
    echo ""

    APK_PATH="app/build/outputs/apk/release/app-release.apk"
    if [ -f "$APK_PATH" ]; then
        echo "============================================"
        echo "  APK build successful!"
        echo "  Location: $(pwd)/$APK_PATH"
        echo "============================================"
    else
        echo "ERROR: APK file not found at expected location."
        echo "Check the Gradle output above for errors."
        exit 1
    fi
fi

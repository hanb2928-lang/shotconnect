#!/bin/bash
set -e
echo "============================================"
echo "  숏커넥트 Android APK 빌드 (EAS 서버)"
echo "============================================"
echo ""

# ── 경로에 한글/공백이 있는지 검사 ──
PROJECT_PATH="$(pwd)"
if echo "$PROJECT_PATH" | grep -qP '[\x{AC00}-\x{D7AF}]'; then
    echo "오류: 프로젝트 경로에 한글이 포함되어 있습니다."
    echo "      현재 경로: $PROJECT_PATH"
    echo ""
    echo "해결 방법: 프로젝트 폴더를 영어-only 경로로 이동하세요."
    echo "  예: C:\\dev\\shortconnect  또는  ~/projects/shortconnect"
    echo ""
    exit 1
fi
if echo "$PROJECT_PATH" | grep -q ' '; then
    echo "오류: 프로젝트 경로에 공백이 포함되어 있습니다."
    echo "      현재 경로: $PROJECT_PATH"
    echo ""
    echo "해결 방법: 폴더명에서 공백을 제거하거나 영어 경로로 이동하세요."
    exit 1
fi
echo "경로 검사 통과."
echo ""

export EAS_NO_VCS=1
export EAS_NO_GIT=1
export EXPO_NO_TELEMETRY=1

echo "[1/7] Node.js 확인 중..."
if ! command -v node &> /dev/null; then
    echo "오류: Node.js가 설치되어 있지 않습니다."
    echo "다운로드: https://nodejs.org (LTS 버전 설치)"
    exit 1
fi
echo "Node.js $(node --version) 확인 완료."
echo ""

echo "[2/7] 패키지 설치 중... (몇 분 걸릴 수 있습니다)"
npm install --legacy-peer-deps
echo "패키지 설치 완료."
echo ""

echo "[3/7] node_modules 검증 중..."
if [ ! -d "node_modules/expo-router" ]; then
    echo "오류: node_modules가 불완전합니다. expo-router를 찾을 수 없습니다."
    echo "해결: rm -rf node_modules package-lock.json 후 다시 실행하세요."
    exit 1
fi
if [ ! -d "node_modules/expo" ]; then
    echo "오류: node_modules가 불완전합니다. expo를 찾을 수 없습니다."
    echo "해결: rm -rf node_modules package-lock.json 후 다시 실행하세요."
    exit 1
fi
echo "node_modules 검증 통과."
echo ""

echo "[4/7] EAS CLI 설치 중..."
npm install -g eas-cli 2>/dev/null || true
echo "EAS CLI 준비 완료."
echo ""

echo "[5/7] EAS 로그인 확인 중..."
if ! eas whoami > /dev/null 2>&1; then
    echo "EAS 로그인이 필요합니다."
    echo "계정이 없다면 https://expo.dev/signup 에서 가입하세요."
    echo ""
    eas login
    if ! eas whoami > /dev/null 2>&1; then
        echo "오류: 로그인에 실패했습니다."
        exit 1
    fi
fi
echo "로그인 완료: $(eas whoami)"
echo ""

echo "[6/7] 프로젝트 연결 확인 중..."
PROJECT_ID=$(node -e "
try {
  const c = require('./app.json');
  const id = c?.expo?.extra?.eas?.projectId || '';
  console.log(id);
} catch { console.log(''); }
")

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "" ]; then
    echo "프로젝트 ID가 없습니다. 새 프로젝트를 생성합니다..."
    eas init --non-interactive 2>/dev/null || {
        echo "자동 생성 실패. 수동으로 진행합니다..."
        eas init
    }
    echo "프로젝트 연결 완료."
else
    echo "기존 프로젝트 ID 확인됨: $PROJECT_ID"
    if ! eas build:list --limit 1 > /dev/null 2>&1; then
        echo "기존 프로젝트에 접근할 수 없습니다. 새 프로젝트를 생성합니다..."
        node -e "
const fs = require('fs');
let s = fs.readFileSync('app.json','utf8');
s = s.replace(/\"projectId\": \"[^\"]*\"/, '\"projectId\": \"\"');
fs.writeFileSync('app.json', s);
"
        eas init --non-interactive 2>/dev/null || eas init
        echo "새 프로젝트 연결 완료."
    else
        echo "프로젝트 연결 정상."
    fi
fi
echo ""

echo "[7/7] Android APK 빌드 시작... (약 10~15분 소요)"
echo "EAS 서버에서 빌드합니다. 컴퓨터 성능과 무관합니다."
echo "빌드 프로필: preview (standalone APK, dev-client 불필요)"
echo ""

eas build --platform android --profile preview --clear-cache --non-interactive || {
    echo ""
    echo "============================================"
    echo "  빌드 실패."
    echo "============================================"
    echo ""
    echo "오류 해결 방법:"
    echo "  1. 빌드 한도 소진 → 새 이메일로 새 계정 가입: https://expo.dev/signup"
    echo "  2. 프로젝트 연결 오류 → eas logout && eas login && eas init"
    echo "  3. 세션 만료 → eas logout 후 eas login"
    echo "  4. node_modules 오류 → rm -rf node_modules package-lock.json && npm install --legacy-peer-deps"
    exit 1
}

echo ""
echo "============================================"
echo "  빌드가 완료되었습니다!"
echo "  위에 표시된 URL에서 APK를 다운로드하세요."
echo "  또는 https://expo.dev → 계정 → Builds 에서 다운로드"
echo "============================================"

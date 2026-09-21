# APK 추출하기 - EAS 터미널 빌드 완전 가이드

## 개요

EAS(Expo Application Services) 서버에서 안드로이드 APK를 빌드합니다.
컴퓨터 성능과 무관하며, Android Studio·Java·Android SDK 설치가 필요 없습니다.
터미널에서 명령어 몇 줄로 APK를 추출할 수 있습니다.

---

## 1단계: Node.js 설치 (최초 1회)

Node.js가 없다면 먼저 설치해야 합니다.

### Windows
1. https://nodejs.org 접속 → **LTS** 버전 다운로드
2. 설치 파일 실행 → "Next"만 계속 클릭 (기본 설정 그대로)
3. 설치 완료 후 터미널(명령 프롬프트 또는 PowerShell) 열기
4. `node --version` 입력 → 버전 번호가 나오면 설치 성공

### Mac
```bash
# Homebrew가 있는 경우
brew install node

# 또는 https://nodejs.org에서 LTS 버전 다운로드 후 설치
node --version
```

### Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

---

## 2단계: 프로젝트 폴더로 이동

터미널을 열고 프로젝트 폴더로 이동합니다.

### Windows (PowerShell)
```powershell
cd C:\Users\내이름\Downloads\project
```

### Mac / Linux
```bash
cd ~/Downloads/project
```

> 프로젝트 폴더에는 `package.json`, `app.json`, `eas.json` 파일이 있어야 합니다.

---

## 3단계: npm 패키지 설치

프로젝트에 필요한 모든 패키지를 설치합니다.

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` 플래그는 패키지 간 버전 충돌을 무시하고 설치하는 옵션입니다.
> 이 프로젝트는 여러 라이브러리가 서로 다른 React 버전을 요구하므로 이 플래그가 필요합니다.

**설치 시간:** 약 1~3분

**설치 확인:**
```bash
npx expo --version
```
버전 번호가 나오면 정상 설치된 것입니다.

---

## 4단계: EAS CLI 설치 (최초 1회)

EAS 빌드 명령어를 사용하려면 EAS CLI를 전역으로 설치해야 합니다.

```bash
npm install -g eas-cli
```

**설치 확인:**
```bash
eas --version
```

> 이미 설치되어 있다면 이 단계는 건너뛰어도 됩니다.

---

## 5단계: Expo 계정 로그인

EAS 서버를 사용하려면 Expo 계정이 필요합니다.

### 5-1. 계정이 없는 경우
1. https://expo.dev/signup 에서 무료 가입
2. 이메일 인증 완료

### 5-2. 터미널에서 로그인
```bash
eas login
```

프롬프트가 나오면:
- **Username:** 가입한 사용자명 입력
- **Password:** 비밀번호 입력

로그인 성공 메시지가 나오면 다음 단계로 진행합니다.

> 이미 로그인되어 있는 경우 `eas whoami`로 확인할 수 있습니다.

---

## 6단계: 프로젝트 연결 (최초 1회)

프로젝트를 EAS에 연결합니다. `eas.json` 파일이 이미 있으므로 연결만 하면 됩니다.

```bash
eas init
```

**첫 번째 빌드인 경우** 자동으로 새 프로젝트가 생성되고 `project ID`가 `app.json`에 기록됩니다.

> "Project not found" 오류가 나면:
> ```bash
> eas logout
> eas login
> eas init
> ```

---

## 7단계: APK 빌드 실행

이제 EAS 서버에서 APK를 빌드합니다.

### 기본 빌드 (권장)
```bash
eas build --platform android --profile preview
```

### 캐시 초기화 빌드 (빌드 실패 시)
```bash
eas build --platform android --profile preview --clear-cache
```

### 개발용 디버그 빌드 (개발자 도구 포함)
```bash
eas build --platform android --profile development
```

### 프로덕션 빌드 (최적화, 릴리즈 모드)
```bash
eas build --platform android --profile production
```

---

## 8단계: 빌드 진행 상황 확인

빌드를 실행하면 터미널에 다음과 같은 메시지가 나옵니다:

```
Compressing project files...
Uploading to EAS...
Build details: https://expo.dev/accounts/[사용자명]/projects/[프로젝트명]/builds/[빌드ID]
```

### 진행 상황 확인 방법

**방법 1: 터미널에서 실시간 확인**
빌드 명령어를 실행한 터미널에 실시간 로그가 표시됩니다.

**방법 2: 웹에서 확인**
1. 터미널에 표시된 URL 클릭 (또는 https://expo.dev 접속)
2. 로그인 → 좌측 메뉴 **Builds** 클릭
3. 진행 중인 빌드의 상태 확인:
   - 🟡 **Pending** → 대기 중
   - 🔵 **In progress** → 빌드 중
   - 🟢 **Success** → 빌드 완료
   - 🔴 **Failed** → 빌드 실패

**빌드 시간:** 약 10~15분

---

## 9단계: APK 다운로드

빌드가 완료되면:

### 터미널에서 다운로드
빌드 완료 후 터미널에 다음과 같은 메시지가 나옵니다:
```
Build success!
Artifact: https://expo.dev/artifacts/eas/[빌드ID].apk
```
URL을 클릭하면 APK 파일이 다운로드됩니다.

### 웹에서 다운로드
1. https://expo.dev → 로그인 → **Builds**
2. 완료된 빌드 클릭
3. **Download build** 버튼 클릭
4. APK 파일 다운로드

---

## 10단계: 폰에 설치

1. 다운로드한 APK를 안드로이드폰으로 전송
   - USB 케이블
   - 이메일 첨부
   - 카카오톡 파일 전송
   - Google Drive 업로드 후 폰에서 다운로드
2. 폰에서 APK 파일 실행
3. "출처를 알 수 없는 앱" 경고 → **설정에서 허용**
4. 설치 완료 후 앱 실행

---

## 자주 발생하는 오류와 해결 방법

### "You are not logged in"
세션이 만료된 것입니다:
```bash
eas logout
eas login
```

### "Project not found"
프로젝트 연결이 꼬인 것입니다:
```bash
eas logout
eas login
eas init
```

### "You don't have access to this project"
기존 계정의 프로젝트 연결이 꼬인 경우:
```bash
eas logout
eas login
eas init
```

### "Android builds from the Free plan are temporarily limited"
무료 계정의 월간 빌드 한도(15회)를 소진한 경우:
1. https://expo.dev/signup 에서 **다른 이메일**로 새 계정 가입
2. 터미널에서:
```bash
eas logout
eas login
eas init
eas build --platform android --profile preview
```

### "npm install" 실패
```bash
# 캐시 삭제 후 재시도
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### 빌드 중 메모리 부족 (OOM)
`eas.json`의 `GRADLE_OPTS` 설정이 이미 4GB 힙 메모리로 설정되어 있습니다.
그래도 실패하면 `eas.json`에서 다음과 같이 증가:
```json
"GRADLE_OPTS": "-Dorg.gradle.daemon=false -Dorg.gradle.jvmargs=-Xmx6144m -Dorg.gradle.workers.max=2"
```

### 빌드 시간이 너무 오래 걸리는 경우
```bash
# 캐시를 활용한 재빌드 (변경된 부분만 다시 빌드)
eas build --platform android --profile preview
# --clear-cache를 붙이지 마세요
```

---

## 한 번에 실행 (전체 명령어 순서)

처음부터 끝까지 터미널에 순서대로 입력하면 됩니다:

```bash
# 1. 프로젝트 폴더로 이동
cd 프로젝트경로

# 2. npm 패키지 설치
npm install --legacy-peer-deps

# 3. EAS CLI 설치 (이미 설치되어 있으면 생략)
npm install -g eas-cli

# 4. 로그인
eas login

# 5. 프로젝트 연결 (이미 연결되어 있으면 생략)
eas init

# 6. APK 빌드
eas build --platform android --profile preview

# 7. 완료 후 URL에서 APK 다운로드
```

---

## 빌드 스크립트 사용 (원클릭 빌드)

매번 명령어를 입력하는 것이 번거롭다면 프로젝트에 포함된 스크립트를 사용하세요.

### Windows
- `build-android.bat` 더블클릭

### Mac / Linux
```bash
bash build-android.sh
```

### PowerShell (Windows)
```powershell
.\build-android.ps1
```

스크립트가 npm 설치부터 EAS 로그인, 빌드까지 자동으로 처리합니다.

---

## 무료 빌드 한도

| 항목 | 무료 계정 |
|------|-----------|
| 월간 빌드 횟수 | 15회 |
| 빌드 1회당 시간 | 10~15분 |
| 동시 빌드 | 1개 |
| 빌드 결과 보관 | 30일 |

한도 소진 시:
- 새 이메일로 새 계정 가입 → 무료 15회 추가
- 또는 유료 플랜(Expo EAS Priority)으로 업그레이드

---

## 자주 묻는 질문

**Q: Android Studio가 필요한가요?**
아니요. EAS 서버에서 빌드하므로 컴퓨터에 Android Studio, Java, Android SDK가 필요 없습니다. Node.js만 있으면 됩니다.

**Q: android 폴더가 있는데 지워야 하나요?**
상관없습니다. EAS 빌드 시 `expo prebuild`가 자동으로 처리합니다. `android/` 폴더를 지우고 빌드해도 됩니다.

**Q: 빌드한 APK를 Play Store에 등록할 수 있나요?**
`preview` 프로필은 내부 테스트용입니다. Play Store 등록하려면 `production` 프로필로 빌드하고 별도의 서명 키(keystore) 설정이 필요합니다.

**Q: iOS IPA도 빌드할 수 있나요?**
가능하지만 Apple Developer 계정($99/년)이 필요하고, EAS 빌드 시 `--platform ios`를 사용해야 합니다. 이 가이드는 Android APK만 다룹니다.

**Q: 코드를 수정한 후 다시 빌드하려면?**
코드 수정 후 같은 명령어를 다시 실행하면 됩니다:
```bash
eas build --platform android --profile preview
```

**Q: 같은 컴퓨터에서 계정을 바꿀 수 있나요?**
네. `eas logout` 후 `eas login`으로 새 계정 로그인하면 됩니다.

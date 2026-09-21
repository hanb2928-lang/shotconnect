# APK 추출 - 단계별 가이드 (이대로만 하면 됩니다)

## 중요: 한글 경로 확인 (빌드 실패의 1순위 원인)

프로젝트 폴더 경로에 한글이 있으면 무조건 실패합니다.

| 경로 | 결과 |
|------|------|
| `C:\Users\한봉구\Downloads\project` | 실패 (한글) |
| `C:\Users\사용자\Documents\project` | 실패 (한글) |
| `C:\dev\shortconnect` | 성공 |
| `D:\projects\shortconnect` | 성공 |
| `C:\Users\admin\projects\shortconnect` | 성공 (admin이 영어) |

**프로젝트 폴더를 `C:\dev\shortconnect` 같은 경로로 복사하세요.**

---

## 방법 1: 원클릭 스크립트 (가장 쉬움)

1. 프로젝트를 `C:\dev\shortconnect` 로 복사
2. 폴더 더블클릭 → 주소창에 `cmd` 입력
3. `build-android` 입력 후 Tab 키 (또는 `build-android.bat` 실행)
4. 스크립트가 자동으로: 설치 → 로그인 → 빌드 → APK URL 출력

## 방법 2: PowerShell

1. 프로젝트 폴더에서 Shift+우클릭 → "PowerShell 창 열기"
2. `.\build-android.ps1` 입력

## 방법 3: 수동 명령어

```cmd
npm install --legacy-peer-deps
npm install -g eas-cli
eas login
eas build --platform android --profile preview --clear-cache
```

---

## 빌드 완료 후 APK 받기

1. 터미널에 표시된 URL 클릭 → APK 다운로드
2. 또는 https://expo.dev → 로그인 → Builds → 다운로드

---

## 자주 발생하는 오류

### "Failed to resolve plugin for module"
→ 프로젝트 경로에 한글이 있습니다. 영문 경로로 이동하세요.

### "You are not logged in"
→ `eas logout` 후 `eas login`

### "Android builds from the Free plan are temporarily limited"
→ 월 15회 무료 한도 소진. 새 이메일로 새 계정 가입.

### "node_modules가 불완전합니다"
→ 아래 명령어 실행 후 재시도:
```cmd
rmdir /s /q node_modules
del package-lock.json
npm install --legacy-peer-deps
```

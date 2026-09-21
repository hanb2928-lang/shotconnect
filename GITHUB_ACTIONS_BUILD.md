# GitHub Actions로 Android APK 빌드하기

EAS 빌드 한도 없이 GitHub에서 무료로 Android APK를 만드는 방법입니다.

---

## 준비물

- GitHub 계정 (https://github.com)
- 인터넷이 연결된 브라우저 (컴퓨터, 폰, 태블릿 모두 가능)

---

## 1단계: GitHub에 프로젝트 올리기

1. https://github.com/new 접속
2. Repository name에 `shortconnect` 입력
3. **Private** 선택 (소스 코드 보호)
4. "Create repository" 클릭

---

## 2단계: 프로젝트 파일 업로드

1. 생성된 저장소 페이지에서 "uploading an existing file" 클릭
2. Bolt에서 다운로드한 프로젝트의 모든 파일을 드래그 앤 드롭
   - **제외할 파일:** `node_modules/`, `.git/`, `android/` 폴더는 제외 (android 폴더는 빌드 시 자동 생성됨)
   - `.github/workflows/build-android-apk.yml` 파일은 반드시 포함
   - `plugins/with-optimized-gradle.js` 파일은 반드시 포함 (Gradle 최적화 설정)
   - `package-lock.json` 파일은 반드시 포함
3. "Commit changes" 클릭

> 파일이 많아 여러 번에 나눠 올려야 할 수 있습니다.

---

## 3단계: 빌드 실행

1. 저장소 페이지에서 상단의 **Actions** 탭 클릭
2. 왼쪽 목록에서 "Build Android APK" 클릭
3. 오른쪽의 "Run workflow" 버튼 클릭
4. "Run workflow" 한 번 더 클릭하여 실행

빌드가 시작되면 약 20~30분이 소요됩니다.

---

## 4단계: APK 다운로드

1. 빌드가 완료되면 (초록색 체크 표시) 해당 빌드를 클릭
2. 페이지 하단의 "Artifacts" 섹션에서 `shortconnect-android-apk` 클릭
3. APK 파일이 다운로드됩니다 (zip 파일 안에 APK가 들어 있음)

---

## 5단계: 폰에 설치

1. 다운로드한 APK를 안드로이드폰으로 전송 (USB, 이메일, 클라우드 등)
2. 폰에서 APK 실행
3. "출처를 알 수 없는 앱" 경고가 나오면 설정에서 허용
4. 설치 완료 후 앱 실행

---

## 빌드 실패 시

| 문제 | 해결 |
|------|------|
| Actions 탭이 안 보임 | 저장소 Settings > Actions > General에서 "Allow all actions" 선택 |
| 빌드 시간 초과 | workflow의 `timeout-minutes`를 120으로 변경 |
| Gradle 에러 | Actions 탭에서 "Run workflow" 다시 클릭 (재실행) |
| Gradle 메모리 부족(OOM) | `plugins/with-optimized-gradle.js`에서 힙 메모리 설정 확인 (기본 4GB) |
| npm ci 실패 | `package-lock.json`이 업로드되었는지 확인 |
| Prebuild 실패 | `package-lock.json`과 `package.json`이 모두 업로드되었는지 확인 |
| SDK 다운로드 실패 | 재실행 (일시적인 네트워크 문제일 수 있음) |

---

## 무료 한도

- GitHub Actions 무료 한도: 매월 2,000분 (Private 저장소)
- Public 저장소는 무제한
- APK 빌드 1회당 약 20~30분 사용
- 따라서 매월 약 60~80회까지 무료 빌드 가능

---

## 코드 수정 후 다시 빌드

소스 코드를 수정해서 다시 빌드하려면:
1. GitHub 저장소에서 해당 파일 수정
2. "Commit changes" 클릭
3. 자동으로 빌드가 시작됨 (push 트리거)
4. 또는 Actions 탭에서 수동으로 "Run workflow" 클릭

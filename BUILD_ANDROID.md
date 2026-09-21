# APK 만들기 - 초간단 가이드

GitHub 웹 브라우저만 있으면 됩니다. 컴퓨터에 아무것도 설치할 필요 없습니다.

---

## 1단계: GitHub 가입 및 저장소 만들기

1. https://github.com 접속 → **Sign up** 클릭 → 가입
2. 로그인 후 우상단 **+** 버튼 → **New repository**
3. Repository name에 `shortconnect` 입력
4. **Private** 선택 → **Create repository** 클릭

---

## 2단계: 프로젝트 파일 올리기

1. Bolt에서 프로젝트 다운로드 → 압축 해제
2. GitHub 저장소 페이지에서 **uploading an existing file** 클릭
3. 프로젝트의 모든 파일을 드래그 앤 드롭
   - **제외할 폴더 (절대 올리지 마세요):**
     - `node_modules/` 폴더
     - `.expo/` 폴더
     - `android/` 폴더 (빌드 시 자동 생성됨)
   - 이 폴더들은 빌드할 때 자동으로 생성됩니다
   - **반드시 올려야 하는 파일:**
     - `.github/workflows/build-android-apk.yml`
     - `plugins/with-optimized-gradle.js` (Gradle 메모리·CPU 아키텍처 설정)
     - `package.json`, `package-lock.json`
     - `app/` 폴더 전체
     - `components/` 폴더 전체
     - `hooks/`, `lib/`, `types/` 폴더 전체
     - `supabase/` 폴더 전체
     - `assets/`, `public/` 폴더 전체
     - `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`
4. 파일이 많아 여러 번에 나눠 올려야 할 수 있습니다
5. **Commit changes** 클릭

> 팁: 폴더별로 나눠서 올리면 편합니다. `app/` 폴더, `components/` 폴더 순으로.

---

## 3단계: APK 만들기

1. 저장소 페이지 위쪽 **Actions** 탭 클릭
2. 왼쪽 목록에서 **Build Android APK** 클릭
3. 오른쪽 **Run workflow** 버튼 클릭
4. **Run workflow** 한 번 더 클릭

빌드가 시작됩니다. 약 20~30분 걸립니다.
끝나면 초록색 체크 표시가 나옵니다.

---

## 4단계: APK 다운로드

1. 초록색 체크가 된 빌드 클릭
2. 페이지 아래쪽 **Artifacts** 섹션에서 `shortconnect-android-apk` 클릭
3. APK 파일이 다운로드됩니다 (zip 안에 APK가 들어 있음)
4. zip을 풀면 APK 파일이 나옵니다

---

## 5단계: 폰에 설치

1. APK를 안드로이드폰으로 전송 (USB, 이메일, 카카오톡 등)
2. 폰에서 APK 파일 실행
3. "출처를 알 수 없는 앱" 경고 → 설정에서 허용
4. 설치 완료 후 앱 실행

---

## 코드 수정 후 다시 만들기

1. GitHub 저장소에서 수정할 파일 클릭 → 연필 아이콘 → 수정
2. **Commit changes** 클릭
3. 자동으로 빌드 시작
4. 또는 Actions 탭에서 **Run workflow** 수동 클릭

---

## 빌드 실패 시

| 문제 | 해결 |
|------|------|
| Actions 탭이 안 보임 | Settings → Actions → General → "Allow all actions" 선택 |
| 빌드 시간 초과 | `.github/workflows/build-android-apk.yml`에서 `timeout-minutes`를 120으로 변경 |
| npm install 실패 | `package.json`과 `package-lock.json`이 올라가 있는지 확인 |
| Node.js 버전 에러 | 워크플로우에서 Node.js 20을 명시적으로 사용하도록 설정되어 있습니다 |
| Gradle 메모리 부족(OOM) | `plugins/with-optimized-gradle.js`에서 힙 메모리 설정을 확인 (기본 4GB) |

---

## 무료 한도

- GitHub Actions 무료 한도: 매월 2,000분 (Private 저장소)
- Public 저장소는 무제한
- APK 1회당 약 20~30분 사용
- 매월 약 60~80회까지 무료 빌드 가능

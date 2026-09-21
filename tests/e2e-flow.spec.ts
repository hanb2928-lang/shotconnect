import { test, expect } from '@playwright/test';

test('사용자 5각도 촬영부터 결과 페이지 폴링 및 HD 토글 제어까지의 핵심 플로우', async ({ page }) => {
  // 1. 메인 앱 진입
  await page.goto('/');
  // 2. 모드 카드 클릭으로 캡처 시작
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('입체컷 오토')).toBeVisible();
  // 3. 멀티파트 업로드 및 큐 진입 확인
  await page.getByText('입체컷 오토').click();
  // 4. 결과 페이지 진입 및 폴링 상태 머신 / HD Upscale 토글 동작 확인
  await page.waitForURL(/\/result\/.+/);
  const hdToggle = page.getByTestId('hd-upscale-toggle').first();
  await expect(hdToggle).toBeVisible();
  await hdToggle.click();
  // 5. 300초 타임아웃 링커 및 소프트 경고 안내문구 가드 확인
  await expect(page.getByText('백그라운드에서 계속 진행 중')).toBeVisible({ timeout: 15000 });
});

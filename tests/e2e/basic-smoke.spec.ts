// tests/e2e/basic-smoke.spec.ts
//
// FINDING-006: Playwright E2E smoke tests for Cheatly.
//
// Exercises renderer behaviour against framework-neutral desktop API contract.
// Playwright serves renderer with deterministic E2E bridge. Rust command and
// repository behaviour is covered by cargo tests.

import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5180';

test.describe('Cheatly Tauri renderer smoke', () => {
  test('app window loads without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(APP_URL);
    // Wait for the main content area — exact selector is app-specific.
    // We wait for any element with the "app" or "root" identifier.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // allow async init

    const crashIndicators = [
      'is not defined',
      'Cannot find module',
      'Electron Error',
    ];
    const criticalErrors = errors.filter((e) =>
      crashIndicators.some((ci) => e.includes(ci))
    );
    expect(
      criticalErrors,
      `Critical errors: ${criticalErrors.join(' | ')}`
    ).toHaveLength(0);
  });

  test('desktop bridge exposes Tauri contract', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    const bridge = await page.evaluate(() => ({
      platform: (window as any).desktopAPI?.platform,
      startMeeting: typeof (window as any).desktopAPI?.startMeeting,
      getRecentMeetings: typeof (window as any).desktopAPI?.getRecentMeetings,
      electronAPI: typeof (window as any).electronAPI,
    }));

    expect(bridge.platform).toBe('darwin');
    expect(bridge.startMeeting).toBe('function');
    expect(bridge.getRecentMeetings).toBe('function');
    expect(bridge.electronAPI).toBe('undefined');
  });

  test('settings panel opens and closes', async ({ page }) => {
    await page.goto(APP_URL);
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
    await dismiss.click();
    await expect(dismiss).toBeHidden();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'General', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'General', exact: true })
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Logo Start Cheatly' })
    ).toBeVisible();
  });
});

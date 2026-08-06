import { expect, type Page } from '@playwright/test';

/** Login as demo resident and dismiss onboarding tour if present. */
export async function loginAsResident(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('resident@osbb.local');
  await page.getByLabel('Пароль').fill('password123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).toHaveURL(/\/resident/, { timeout: 20_000 });
  await dismissResidentTour(page);
}

export async function dismissResidentTour(page: Page) {
  const skip = page.getByRole('button', { name: /Пропустити|Зрозуміло|Понятно/i });
  if (await skip.first().isVisible().catch(() => false)) {
    await skip.first().click();
  }
}

export async function expandDesktopNav(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const menuBtn = page.locator('.app-menu-btn');
  if (await menuBtn.isVisible()) {
    // Expand if collapsed (nav-collapsed class on shell)
    const collapsed = await page.locator('.app-shell.nav-collapsed').count();
    if (collapsed > 0) await menuBtn.click();
  }
}

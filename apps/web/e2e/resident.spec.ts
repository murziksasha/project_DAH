import { expect, test } from '@playwright/test';

test.describe('Resident cabinet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('resident@osbb.local');
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/resident/);
  });

  test('shows account tab with debt summary', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Рахунок' })).toBeVisible();
    await expect(page.getByText('Борг')).toBeVisible();
  });

  test('switches to communications tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Новини' }).click();
    await expect(page.getByRole('heading', { name: 'Оголошення' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Нова заявка' })).toBeVisible();
  });
});
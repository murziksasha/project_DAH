import { expect, test } from '@playwright/test';

async function loginAsChairman(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('chairman@osbb.local');
  await page.getByLabel('Пароль').fill('password123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test.describe('Admin smoke', () => {
  test('dashboard shows period controls and KPI cards', async ({ page }) => {
    await loginAsChairman(page);
    await expect(page.getByRole('heading', { name: 'Кабінет правління' })).toBeVisible();
    await expect(page.getByLabel('Від')).toBeVisible();
    await expect(page.getByLabel('До')).toBeVisible();
    await expect(page.getByText('Надходження')).toBeVisible();
    await expect(page.getByText('Витрати').first()).toBeVisible();
  });

  test('accrual wizard steps and history link', async ({ page }) => {
    await loginAsChairman(page);
    await page.goto('/admin/accruals');
    await expect(page.getByRole('heading', { name: 'Нарахування внесків' })).toBeVisible();
    await expect(page.getByText('1. Параметри')).toBeVisible();
    await expect(page.getByRole('button', { name: /попередній перегляд/i })).toBeVisible();
    await page.getByRole('link', { name: 'Історія' }).click();
    await expect(page).toHaveURL(/\/admin\/accruals\/list/);
  });

  test('reports page has PDF for board and period filter', async ({ page }) => {
    await loginAsChairman(page);
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Звіти' })).toBeVisible();
    await expect(page.getByRole('button', { name: /PDF для зборів/i })).toBeVisible();
    await expect(page.getByLabel('Від')).toBeVisible();
  });

  test('payments history tab loads', async ({ page }) => {
    await loginAsChairman(page);
    await page.goto('/admin/payments');
    await page.getByRole('button', { name: 'Історія' }).click();
    await expect(page.getByRole('heading', { name: 'Останні платежі' })).toBeVisible();
  });
});

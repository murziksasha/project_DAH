import { expect, test } from '@playwright/test';

test.describe('Login', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Пароль')).toBeVisible();
  });

  test('shows forgot-password form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Забули пароль?' }).click();
    await expect(page.getByRole('button', { name: 'Надіслати' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('resident login redirects to resident cabinet', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('resident@osbb.local');
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/resident/);
    await expect(page.getByRole('heading', { name: 'Кабінет мешканця' })).toBeVisible();
  });

  test('chairman login redirects to admin dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('chairman@osbb.local');
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Кабінет правління' })).toBeVisible();
  });
});
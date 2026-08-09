import { expect, test } from '@playwright/test';
import { expandDesktopNav, loginAsSuperAdmin } from './helpers';

test.describe('Super admin cabinet', () => {
  test('login and system nav items', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expandDesktopNav(page);

    await expect(page.getByRole('link', { name: 'Організації' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Організація' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Інструкція/i })).toBeVisible();
  });

  test('instructions page for system administrator', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/instructions');

    await expect(
      page.getByRole('heading', { name: /Інструкція для системного адміністратора/i }),
    ).toBeVisible();
    await expect(page.getByText(/Каталог ролей/i).first()).toBeVisible();
    await expect(page.getByText(/Додати роль у каталог|Додати \/ увімкнути/i).first()).toBeVisible();
    await expect(page.getByText(/Ім.?я|імʼя|Прізвище/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Організація: користувачі/i })).toBeVisible();
  });

  test('tenants page loads', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/tenants');
    // Page header / create form — avoid brittle table-only asserts
    await expect(page.getByText(/Організац/i).first()).toBeVisible();
  });

  test('organization page shows roles catalog when tenant selected', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin/tenants');

    // Prefer selecting first org if buttons present
    const selectBtn = page.getByRole('button', { name: /Обрати|Выбрать/i }).first();
    if (await selectBtn.isVisible().catch(() => false)) {
      await selectBtn.click();
    }

    await page.goto('/admin/organization');
    await expect(page.getByRole('heading', { name: /Ролі організації|Роли организации/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Додати роль у каталог|Добавить роль в каталог/i)).toBeVisible();
  });

  test('mobile: instructions readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSuperAdmin(page);
    await page.goto('/admin/instructions');
    await expect(
      page.getByRole('heading', { name: /Інструкція для системного адміністратора/i }),
    ).toBeVisible();
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});

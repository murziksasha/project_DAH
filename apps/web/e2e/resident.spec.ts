import { expect, test } from '@playwright/test';
import { dismissResidentTour, expandDesktopNav, loginAsResident } from './helpers';

test.describe('Resident cabinet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsResident(page);
  });

  test('shows action home with balance', async ({ page }) => {
    await expect(
      page.getByText(/До сплати|Переплата|Борг відсутній|Розділи/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('opens account compact view', async ({ page }) => {
    await page.getByRole('button', { name: 'Рахунок' }).first().click();
    await expect(page.getByText('Борг')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /Повна історія|Сховати деталі/ }),
    ).toBeVisible();
  });

  test('opens requests with photo field', async ({ page }) => {
    await page.getByRole('button', { name: 'Заявки' }).first().click();
    await expect(page.getByRole('heading', { name: 'Нова заявка' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Фото/)).toBeVisible();
  });

  test('opens news tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Новини' }).first().click();
    await expect(page.getByRole('heading', { name: 'Оголошення' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('meters batch page with seeded meters', async ({ page }) => {
    await page.goto('/resident/meters');
    await expect(page.getByRole('heading', { name: 'Мої лічильники' })).toBeVisible({
      timeout: 10_000,
    });
    // After seed: batch form or empty
    const batch = page.getByText(/Покази за всіма|Період:/);
    const empty = page.getByText(/Лічильників немає|Квартиру не прив/);
    await expect(batch.or(empty).first()).toBeVisible({ timeout: 10_000 });
  });

  test('security page sections', async ({ page }) => {
    await page.goto('/resident/security');
    await expect(page.getByRole('heading', { name: /Безпека|Безопасность/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Профіль|Профиль/i).first()).toBeVisible();
    await expect(page.getByText(/Пароль|парол/i).first()).toBeVisible();
  });

  test('desktop drawer comfort toggle', async ({ page }) => {
    await expandDesktopNav(page);
    const comfortBtn = page.getByRole('button', {
      name: /Зручний режим|Звичайний розмір|Удобный режим|Обычный размер/i,
    });
    await expect(comfortBtn.first()).toBeVisible({ timeout: 10_000 });
    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-comfort'),
    );
    await comfortBtn.first().click();
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-comfort'),
    );
    expect(['large', 'normal']).toContain(after);
    if (before === 'large') expect(after).toBe('normal');
    else expect(after).toBe('large');
  });
});

import { expect, test, type Page } from '@playwright/test';
import { dismissResidentTour, loginAsResident } from './helpers';

test.describe('Resident offline queue', () => {
  test('shows offline queue banner and flushes on manual send', async ({ page }) => {
    await loginAsResident(page);

    await page.evaluate(() => {
      const apt =
        localStorage.getItem('dah_apartment_id') ||
        (() => {
          try {
            return (JSON.parse(localStorage.getItem('dah_user') || '{}') as { apartmentId?: string })
              .apartmentId;
          } catch {
            return '';
          }
        })() ||
        'apt-demo';
      const queue = [
        {
          id: 'm1-2026-08-test',
          meterId: 'meter_offline_e2e',
          meterName: 'E2E cold water',
          apartmentId: apt,
          period: '2026-08',
          value: 42.5,
          unit: 'm³',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem('dah_meter_offline_queue', JSON.stringify(queue));
      window.dispatchEvent(
        new CustomEvent('dah-meter-queue-change', { detail: { count: 1 } }),
      );
    });

    await page.goto('/resident/meters');
    await dismissResidentTour(page);
    await expect(page.getByText(/Черга офлайн-показів|Очередь офлайн/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('E2E cold water')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Надіслати зараз|Отправить сейчас/i }),
    ).toBeVisible();

    await page.route('**/api/meters/*/readings/self', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: /Надіслати зараз|Отправить сейчас/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          try {
            const raw = localStorage.getItem('dah_meter_offline_queue');
            if (!raw) return 0;
            return (JSON.parse(raw) as unknown[]).length;
          } catch {
            return -1;
          }
        }),
      )
      .toBe(0);
  });

  test('queues reading while browser offline', async ({ page, context }) => {
    await loginAsResident(page);

    await page.route('**/api/meters/apartment/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'meter_ui_offline',
            name: 'UI offline meter',
            type: 'cold_water',
            unit: 'm3',
            isActive: true,
            readings: [],
          },
        ]),
      });
    });

    await context.setOffline(true);
    await page.goto('/resident/meters');
    await dismissResidentTour(page);
    await expect(page.getByText(/Немає інтернету|Нет интернета/i)).toBeVisible({
      timeout: 10_000,
    });

    const valueInput = page.locator('input[type="number"]').first();
    await expect(valueInput).toBeVisible({ timeout: 10_000 });
    await valueInput.fill('11.1');
    await page
      .getByRole('button', {
        name: /Зберегти офлайн|Сохранить офлайн|Надіслати|Отправить/i,
      })
      .click();
    await expect(page.getByText(/Збережено офлайн|Сохранено офлайн|Черга офлайн/i)).toBeVisible({
      timeout: 8_000,
    });
    const queued = await page.evaluate(() => {
      const raw = localStorage.getItem('dah_meter_offline_queue');
      return raw ? (JSON.parse(raw) as unknown[]).length : 0;
    });
    expect(queued).toBeGreaterThan(0);
    await context.setOffline(false);
  });
});

test.describe('Resident multi-apartment soft switch', () => {
  test('real seed: switcher refetches without full reload when 2+ apts', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/resident');
    await dismissResidentTour(page);

    const switcher = page.locator('.resident-apt-switcher select');
    const hasSwitcher = await switcher.isVisible().catch(() => false);
    if (!hasSwitcher) {
      test.skip(true, 'Seed without multi-apt links — run with updated seed');
      return;
    }

    await page.evaluate(() => {
      (window as unknown as { __e2eStay?: boolean }).__e2eStay = true;
    });

    const options = await switcher.locator('option').all();
    expect(options.length).toBeGreaterThanOrEqual(2);
    const values = await Promise.all(options.map((o) => o.getAttribute('value')));
    const current = await switcher.inputValue();
    const next = values.find((v) => v && v !== current);
    expect(next).toBeTruthy();

    const accountRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/accruals/my-account')) {
        accountRequests.push(req.url());
      }
    });

    await switcher.selectOption(next!);

    await expect
      .poll(() => accountRequests.some((u) => u.includes(`apartmentId=${next}`)), {
        timeout: 10_000,
      })
      .toBe(true);

    const stayed = await page.evaluate(
      () => (window as unknown as { __e2eStay?: boolean }).__e2eStay === true,
    );
    expect(stayed).toBe(true);
  });

  test('mocked: switcher changes apartmentId query', async ({ page }) => {
    const aptA = 'apt_e2e_a';
    const aptB = 'apt_e2e_b';
    let lastAccountApt: string | null = null;

    await page.route('**/api/auth/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user_res',
          email: 'resident@osbb.local',
          firstName: 'Мешканець',
          lastName: 'Демо',
          phone: null,
          role: 'resident',
          status: 'active',
          apartmentId: aptA,
          apartments: [
            {
              id: aptA,
              number: '1',
              entrance: 1,
              isPrimary: true,
              buildingName: 'Демо-будинок',
            },
            {
              id: aptB,
              number: '99',
              entrance: 2,
              isPrimary: false,
              buildingName: 'Демо-будинок',
            },
          ],
        }),
      });
    });

    await page.route('**/api/accruals/my-account**', async (route) => {
      const url = new URL(route.request().url());
      lastAccountApt = url.searchParams.get('apartmentId');
      const apt = lastAccountApt || aptA;
      const number = apt === aptB ? '99' : '1';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apartment: { number, buildingName: 'Демо-будинок' },
          summary: { totalAccrued: 100, totalPaid: 0, debt: 100, advance: 0 },
          lines: [],
          payments: [],
          timeline: [],
        }),
      });
    });

    await loginAsResident(page);
    await page.goto('/resident');
    await dismissResidentTour(page);

    const switcher = page.locator('.resident-apt-switcher select');
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      (window as unknown as { __e2eStay?: boolean }).__e2eStay = true;
    });
    await switcher.selectOption(aptB);
    await expect.poll(() => lastAccountApt, { timeout: 10_000 }).toBe(aptB);
    expect(
      await page.evaluate(
        () => (window as unknown as { __e2eStay?: boolean }).__e2eStay === true,
      ),
    ).toBe(true);
    await expect(page.getByText(/кв\.\s*99/i)).toBeVisible({ timeout: 10_000 });
  });
});

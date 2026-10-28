import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:8000';
const TRIP_ID = 501;

const CORS = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

async function mockAuthenticatedTrip(page: Page): Promise<void> {
  await page.route(
    /^https?:\/\/(?!localhost:4200|localhost:8000)/,
    (route) => route.abort(),
  );

  await page.route(`${API}/**`, (route) => {
    const url = route.request().url();

    if (url.includes('/auth/verify')) {
      return route.fulfill({ status: 200, headers: CORS, json: { valid: true } });
    }

    if (url.includes('/users/me')) {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: {
          id: 9001,
          email: 'trip-viewer@example.com',
          firstname: 'Test',
          lastname: 'Traveler',
          has_completed_onboarding: 'Onboarded',
        },
      });
    }

    if (url.includes('/notifications')) {
      return route.fulfill({ status: 200, headers: CORS, json: [] });
    }

    if (url.includes(`/trips/${TRIP_ID}/stops`)) {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: {
          status_code: 200,
          message: '',
          stops: [
            {
              id: 601,
              trip_id: TRIP_ID,
              title: 'Tunis',
              order: 0,
              city: { id: 1, lat: 36.8065, long: 10.1815 },
            },
            {
              id: 602,
              trip_id: TRIP_ID,
              title: 'Sousse',
              order: 1,
              city: { id: 2, lat: 35.8256, long: 10.6386 },
            },
          ],
        },
      });
    }

    if (url.includes('/trips/me')) {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: {
          status_code: 200,
          message: '',
          trips: [
            {
              id: TRIP_ID,
              title: 'Weekend in Tunisia',
              created_at: '2026-10-19T10:00:00Z',
            },
          ],
        },
      });
    }

    return route.fulfill({ status: 200, headers: CORS, json: [] });
  });
}

test('opens a known trip and displays its implemented details', async ({ page }) => {
  await mockAuthenticatedTrip(page);

  await page.goto('/map');
  await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible();
  await page.getByRole('button', { name: 'My Trips' }).click();

  await expect(page.getByRole('heading', { name: 'My Trips' })).toBeVisible();
  const trip = page.locator('.trip-item').filter({ hasText: 'Weekend in Tunisia' });
  await expect(trip).toBeVisible();
  await page.mouse.move(700, 300);
  await trip.click();

  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByRole('heading', { name: 'Weekend in Tunisia' })).toBeVisible();
  await expect(page.getByText('Created on Oct 19, 2026')).toBeVisible();

  const detail = page.locator('.stop-list');
  await expect(detail.getByText('From', { exact: true })).toBeVisible();
  await expect(detail.getByText('Tunis', { exact: true })).toBeVisible();
  await expect(detail.getByText('To', { exact: true })).toBeVisible();
  await expect(detail.getByText('Sousse', { exact: true })).toBeVisible();
});

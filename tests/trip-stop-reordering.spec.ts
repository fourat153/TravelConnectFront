import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:8000';
const TRIP_ID = 502;

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

async function mockReorderableTrip(page: Page): Promise<{
  reorderRequests: () => number;
  lastStopIds: () => number[] | undefined;
}> {
  let stops = [
    { id: 701, trip_id: TRIP_ID, title: 'Tunis', order: 0, city: { id: 1, lat: 36.8065, long: 10.1815 } },
    { id: 702, trip_id: TRIP_ID, title: 'Sousse', order: 1, city: { id: 2, lat: 35.8256, long: 10.6386 } },
    { id: 703, trip_id: TRIP_ID, title: 'Kairouan', order: 2, city: { id: 3, lat: 35.6781, long: 10.0963 } },
    { id: 704, trip_id: TRIP_ID, title: 'Djerba', order: 3, city: { id: 4, lat: 33.8076, long: 10.8451 } },
  ];
  let reorderRequests = 0;
  let lastStopIds: number[] | undefined;

  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, route => route.abort());

  await page.route(`${API}/**`, async route => {
    const request = route.request();
    const url = request.url();

    if (url.includes('/auth/verify')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { valid: true } });
    }

    if (url.includes('/users/me')) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          id: 9002,
          email: 'trip-reorder-test@example.com',
          firstname: 'Trip',
          lastname: 'Reorderer',
          has_completed_onboarding: 'Onboarded',
        },
      });
    }

    if (url.includes('/notifications')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
    }

    if (url.includes(`/trips/${TRIP_ID}/stops/reorder`) && request.method() === 'PUT') {
      const payload = request.postDataJSON() as { stop_ids: number[] };
      reorderRequests += 1;
      lastStopIds = payload.stop_ids;
      const byId = new Map(stops.map(stop => [stop.id, stop]));
      stops = payload.stop_ids.map((id, order) => ({ ...byId.get(id)!, order }));
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { status_code: 200, message: 'Stops reordered' },
      });
    }

    if (url.includes(`/trips/${TRIP_ID}/stops`)) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { status_code: 200, message: '', stops },
      });
    }

    if (url.includes('/trips/me')) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          status_code: 200,
          message: '',
          trips: [{ id: TRIP_ID, title: 'Reordering Tunisia Stops', created_at: '2026-10-19T10:00:00Z' }],
        },
      });
    }

    return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
  });

  return {
    reorderRequests: () => reorderRequests,
    lastStopIds: () => lastStopIds,
  };
}

test('reorders itinerary stops and keeps the new order after reload', async ({ page }) => {
  const fixture = await mockReorderableTrip(page);

  await page.goto('/map');
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await page.locator('.trip-item').filter({ hasText: 'Reordering Tunisia Stops' }).click();

  const itinerary = page.locator('.stop-list');
  const titles = itinerary.locator('.stop-card__title');
  await expect(titles).toHaveText(['Tunis', 'Sousse', 'Kairouan', 'Djerba']);

  const source = itinerary.locator('.stop-card').nth(1);
  const target = itinerary.locator('.stop-card').nth(2);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height * 0.9,
    { steps: 10 },
  );
  await page.mouse.up();

  await expect(titles).toHaveText(['Tunis', 'Kairouan', 'Sousse', 'Djerba']);
  expect(fixture.reorderRequests()).toBe(1);
  expect(fixture.lastStopIds()).toEqual([701, 703, 702, 704]);

  await page.reload();
  await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible();
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await page.locator('.trip-item').filter({ hasText: 'Reordering Tunisia Stops' }).click();
  await expect(page.locator('.stop-list .stop-card__title')).toHaveText([
    'Tunis',
    'Kairouan',
    'Sousse',
    'Djerba',
  ]);
});

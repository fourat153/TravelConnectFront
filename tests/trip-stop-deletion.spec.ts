import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:8000';
const TRIP_ID = 503;

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
};

function initialStops() {
  return [
    { id: 801, trip_id: TRIP_ID, title: 'Tunis', order: 0, city: { id: 1, lat: 36.8065, long: 10.1815 } },
    { id: 802, trip_id: TRIP_ID, title: 'Sousse', order: 1, city: { id: 2, lat: 35.8256, long: 10.6386 } },
    { id: 803, trip_id: TRIP_ID, title: 'Djerba', order: 2, city: { id: 3, lat: 33.8076, long: 10.8451 } },
  ];
}

async function mockDeletionFixture(page: Page): Promise<{
  tripDeleteRequests: () => number;
  stopDeleteRequests: () => number;
}> {
  let trips = [
    { id: TRIP_ID, title: 'Deletion Test Tunisia', created_at: '2026-10-19T10:00:00Z' },
  ];
  let stops = initialStops();
  let tripDeleteRequests = 0;
  let stopDeleteRequests = 0;

  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, route => route.abort());

  await page.route(`${API}/**`, async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/, '');

    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    if (pathname === '/auth/verify') {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { valid: true } });
    }

    if (pathname === '/users/me') {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          id: 9003,
          email: 'trip-deletion-test@example.com',
          firstname: 'Trip',
          lastname: 'Deleter',
          has_completed_onboarding: 'Onboarded',
        },
      });
    }

    if (pathname === '/notifications') {
      return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
    }

    if (pathname === `/trips/${TRIP_ID}` && request.method() === 'DELETE') {
      tripDeleteRequests += 1;
      trips = [];
      return route.fulfill({ status: 200, headers: corsHeaders, json: {} });
    }

    if (/^\/stops\/\d+$/.test(pathname) && request.method() === 'DELETE') {
      stopDeleteRequests += 1;
      const stopId = Number(pathname.split('/').pop());
      stops = stops.filter(stop => stop.id !== stopId);
      return route.fulfill({ status: 200, headers: corsHeaders, json: {} });
    }

    if (pathname === `/trips/${TRIP_ID}/stops`) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { status_code: 200, message: '', stops },
      });
    }

    if (pathname === '/trips/me') {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: { status_code: 200, message: '', trips },
      });
    }

    return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
  });

  return {
    tripDeleteRequests: () => tripDeleteRequests,
    stopDeleteRequests: () => stopDeleteRequests,
  };
}

async function openTestTrip(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await page.locator('.trip-item').filter({ hasText: 'Deletion Test Tunisia' }).click();
}

test('deletes a trip through its options and removes it after reload', async ({ page }) => {
  const fixture = await mockDeletionFixture(page);

  await page.goto('/map');
  await openTestTrip(page);
  await page.getByRole('button', { name: 'Back' }).click();

  const trip = page.locator('.trip-item').filter({ hasText: 'Deletion Test Tunisia' });
  await trip.getByRole('button', { name: 'Trip options' }).click();
  await expect(page.getByRole('heading', { name: 'Delete trip?' })).toBeVisible();
  const deleteResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'DELETE' &&
    new URL(response.url()).pathname.replace(/\/$/, '') === `/trips/${TRIP_ID}`
  );
  await page.locator('.delete-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.status()).toBe(200);
  expect(fixture.tripDeleteRequests()).toBe(1);

  await expect(page.getByRole('heading', { name: 'Delete trip?' })).toBeHidden();
  await expect(page.locator('.trip-item').filter({ hasText: 'Deletion Test Tunisia' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'My Trips' }).click();
  await expect(page.locator('.trip-item').filter({ hasText: 'Deletion Test Tunisia' })).toHaveCount(0);
});

test('deletes a stop through its confirmation dialog and keeps it deleted after reload', async ({ page }) => {
  const fixture = await mockDeletionFixture(page);

  await page.goto('/map');
  await openTestTrip(page);

  const itinerary = page.locator('.stop-list');
  const stop = itinerary.locator('.stop-card').filter({ hasText: 'Sousse' });
  await stop.getByRole('button', { name: 'Delete stop' }).click();
  await expect(page.getByRole('heading', { name: 'Delete stop?' })).toBeVisible();
  await page.locator('.delete-dialog').getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(itinerary.getByText('Sousse', { exact: true })).toHaveCount(0);
  await expect(itinerary.getByText('Tunis', { exact: true })).toBeVisible();
  await expect(itinerary.getByText('Djerba', { exact: true })).toBeVisible();
  expect(fixture.stopDeleteRequests()).toBe(1);

  await page.reload();
  await openTestTrip(page);
  await expect(page.locator('.stop-list').getByText('Sousse', { exact: true })).toHaveCount(0);
});

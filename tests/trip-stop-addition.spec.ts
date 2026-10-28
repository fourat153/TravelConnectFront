import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:8000';
const TRIP_ID = 501;

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

async function mockTripWithStops(page: Page): Promise<{
  addedStop: () => { title: string; id: number } | undefined;
  createRequests: () => number;
}> {
  const stops = [
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
  ];
  let createdStop: { title: string; id: number } | undefined;
  let createRequests = 0;

  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, route => route.abort());

  await page.route('https://api.mapbox.com/search/geocode/v6/forward**', route =>
    route.fulfill({
      status: 200,
      json: {
        features: [
          {
            id: 'place.123',
            properties: { full_address: 'Sfax, Tunisia' },
            geometry: { coordinates: [10.7603, 34.7406] },
          },
        ],
      },
    }),
  );

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
          id: 9001,
          email: 'trip-stop-test@example.com',
          firstname: 'Trip',
          lastname: 'Tester',
          has_completed_onboarding: 'Onboarded',
        },
      });
    }

    if (url.includes('/notifications')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
    }

    if (url.includes(`/trips/${TRIP_ID}/stops`)) {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON() as {
          title: string;
          lat: number;
          long: number;
          description: string;
          order: number;
        };
        createRequests += 1;
        createdStop = { id: 603, title: payload.title };
        stops.splice(1, 0, {
          id: 603,
          trip_id: TRIP_ID,
          title: payload.title,
          order: payload.order,
          city: { id: 3, lat: payload.lat, long: payload.long },
        });
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: { status_code: 201, message: 'Stop created', id: 603, trip_id: TRIP_ID },
        });
      }

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
          trips: [{ id: TRIP_ID, title: 'Weekend in Tunisia', created_at: '2026-10-19T10:00:00Z' }],
        },
      });
    }

    return route.fulfill({ status: 200, headers: corsHeaders, json: [] });
  });

  return {
    addedStop: () => createdStop,
    createRequests: () => createRequests,
  };
}

test('adds a stop to an existing trip and keeps it after reload', async ({ page }) => {
  const fixture = await mockTripWithStops(page);

  await page.goto('/map');
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await page.locator('.trip-item').filter({ hasText: 'Weekend in Tunisia' }).click();

  const itinerary = page.locator('.stop-list');
  await expect(itinerary.getByText('Tunis', { exact: true })).toBeVisible();
  await expect(itinerary.getByText('Sousse', { exact: true })).toBeVisible();

  const search = page.getByPlaceholder('Search for a city or place...');
  await search.fill(`Sfax ${Date.now()}`);
  await expect(page.getByText('Sfax', { exact: true })).toBeVisible();
  await page.getByText('Sfax', { exact: true }).click();

  await page.getByRole('button', { name: 'Add stop', exact: true }).click();

  await expect(itinerary.getByText('Sfax, Tunisia', { exact: true })).toBeVisible();
  expect(fixture.createRequests()).toBe(1);
  expect(fixture.addedStop()).toEqual({ id: 603, title: 'Sfax, Tunisia' });

  await page.reload();
  await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible();
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await page.locator('.trip-item').filter({ hasText: 'Weekend in Tunisia' }).click();
  await expect(page.locator('.stop-list').getByText('Sfax, Tunisia', { exact: true })).toBeVisible();
});

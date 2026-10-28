import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Trip creation E2E - through the "Share Trip" button in the feed.
//
// The real UI flow, traced in the source:
//   feed.html:14-15    <p-button label="Share Trip" ... (onClick)="openCreateModal()">
//   feed.ts:280-285    openCreateModal() -> showCreateModal = true; resets createForm
//   feed.html:197-244  PrimeNG <p-dialog header="Create New Trip"> holding:
//                        - Trip Title   (<label for="title">, required + minLength(2))
//                        - Privacy      (Public / Friends / Private segmented control)
//                        - Route        (<app-trip-stop-input [maxStops]="2"> ->
//                                        "Starting point" + "Destination")
//   feed.html:238-239  <p-button label="Save">, disabled while
//                      "tripStops.length < 2 || createForm.invalid"
//   feed.ts:287-328    submitPost() -> TripService.createTrip() -> POST /trips
//                      body { title, privacy, from_city:{label,lat,lon}, to_city:{...} }
//   feed.ts:314-317    on 201: dialog closes and loadFeed() re-fetches GET /posts/feed
//
// A created trip is read back with GET /trips/me (trip.ts:16-18), the same data
// the map's "My Trips" list renders - that is how persistence is proven.
//
// The backend is mocked in memory because this repo has no running FastAPI
// server and no E2E test account; this matches every other spec under tests/.
// ---------------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

const TUNIS = { label: 'Tunis, Tunisia', lat: 36.8065, lon: 10.1815 };
const SOUSSE = { label: 'Sousse, Tunisia', lat: 35.8256, lon: 10.6386 };

interface StoredTrip {
  id: number;
  title: string;
  created_at: string;
}

let savedTrips: StoredTrip[];
let createCalls: any[];
let createdTripIds: number[];

async function mockBackend(page: Page) {
  // 1) Abort third parties (fonts, analytics, Mapbox map tiles/styles, ...) so
  //    the page never waits on them. The app and the mocked API stay allowed.
  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, (route) =>
    route.abort(),
  );

  // 2) Mapbox forward-geocoding used by <app-trip-stop-input>. Registered after
  //    the catch-all so it takes precedence (last matching route wins). Returns
  //    one deterministic feature per query so stop selection is reproducible.
  await page.route('**/geocode/v6/forward**', (route) => {
    const q = (new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase();
    const isSousse = q.includes('sousse');
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        features: [
          {
            id: isSousse ? 'place-sousse' : 'place-tunis',
            properties: { full_address: isSousse ? SOUSSE.label : TUNIS.label },
            geometry: {
              coordinates: isSousse ? [SOUSSE.lon, SOUSSE.lat] : [TUNIS.lon, TUNIS.lat],
            },
          },
        ],
      },
    });
  });

  // 3) Stateful mocked FastAPI backend (http://localhost:8000).
  await page.route(/localhost:8000\//, (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // authGuard (guard.ts:11) calls this; { valid: true } unlocks /feed and /map.
    if (url.includes('/auth/verify')) {
      return route.fulfill({ status: 200, headers: CORS, json: { valid: true } });
    }

    // app.ts fetches this on startup; the feed sidebar shows the user's name.
    if (url.includes('/users/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: {
          id: 1,
          email: 'traveler@example.com',
          firstname: 'Test',
          lastname: 'Traveler',
          has_completed_onboarding: 'Onboarded',
        },
      });
    }

    // GET /posts/feed - the feed's own data. Empty is fine: the "Share Trip"
    // button lives in the header (feed.html:14) and always renders.
    if (url.includes('/posts/feed') && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: {
          posts: [],
          page_number: 1,
          page_size: 10,
          total_pages: 1,
          total_records: 0,
          status_code: 200,
          message: '',
        },
      });
    }

    // GET /trips/me - read-back used by the map "My Trips" list.
    if (url.includes('/trips/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: { trips: savedTrips, status_code: 200, message: '' },
      });
    }

    // POST /trips - the trip-creation endpoint. Mirrors the real response shape
    // (TripBaseOut) that submitPost() checks: status_code === 201 && id.
    if (url.includes('/trips') && method === 'POST') {
      const body = req.postDataJSON();
      createCalls.push(body);
      const id = 100 + createCalls.length;
      const trip: StoredTrip = {
        id,
        title: body.title,
        created_at: '2026-10-19T10:00:00Z',
      };
      savedTrips = [trip, ...savedTrips];
      createdTripIds.push(id);
      return route.fulfill({
        status: 201,
        headers: CORS,
        json: {
          status_code: 201,
          id,
          title: body.title,
          message: 'Trip created',
          created_at: trip.created_at,
        },
      });
    }

    // DELETE /trips/{id} - exercised by the afterEach cleanup below.
    if (method === 'DELETE' && /\/trips\/\d+/.test(url)) {
      const id = Number(url.match(/\/trips\/(\d+)/)![1]);
      savedTrips = savedTrips.filter((t) => t.id !== id);
      return route.fulfill({
        status: 200,
        headers: CORS,
        json: { status_code: 200, message: 'Trip deleted' },
      });
    }

    return route.fulfill({ status: 200, headers: CORS, json: [] });
  });
}

// Opens /feed the way a logged-in user reaches it and waits for the header.
async function openFeed(page: Page) {
  await page.goto('/feed');
  await expect(page.getByRole('button', { name: 'Share Trip' })).toBeVisible();
}

// Opens the "Share Trip" dialog from the feed header.
async function openShareTripDialog(page: Page) {
  await page.getByRole('button', { name: 'Share Trip' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Create New Trip')).toBeVisible();
  return dialog;
}

// Resolves one route stop through the mocked geocoder.
async function selectStop(page: Page, placeholder: string, query: string) {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(query);

  // The component debounces geocoding by 300ms; wait for the real response
  // instead of guessing a fixed delay.
  await page.waitForResponse((r) => r.url().includes('geocode/v6/forward'));

  // PrimeNG's dialog moves focus to the title input, which blurs the stop input
  // and closes its dropdown (the component hides it on blur). Re-focus so the
  // suggestion list opens again, then pick the first match.
  await input.click();
  const suggestion = page.locator('.suggestion-item').first();
  await suggestion.waitFor({ state: 'visible' });
  await suggestion.click();
}

// Both stops must resolve for Save to become enabled (feed.html:239).
async function selectStops(page: Page) {
  await selectStop(page, 'Starting point', 'Tunis');
  await selectStop(page, 'Destination', 'Sousse');
}

test.beforeEach(async ({ page }) => {
  savedTrips = [];
  createCalls = [];
  createdTripIds = [];
  await mockBackend(page);
});

test.afterEach(async ({ page }) => {
  // Remove only the trips this test created (tracked by the mock's POST
  // handler), leaving any pre-existing data untouched. The fetch runs inside
  // the page so page.route() intercepts it - against a real backend it would
  // hit DELETE /trips/{id}.
  for (const id of createdTripIds) {
    await page.evaluate(
      (tripId) =>
        fetch(`http://localhost:8000/trips/${tripId}`, {
          method: 'DELETE',
          credentials: 'include',
        }).then(() => undefined),
      id,
    );
  }
});

test('creates a trip from the feed Share Trip dialog and sends the expected payload', async ({
  page,
}) => {
  await openFeed(page);
  const dialog = await openShareTripDialog(page);

  // Fill the form the way a user would: title, then the two route stops.
  await dialog.getByLabel('Trip Title').fill('Weekend in Tunisia');
  await selectStops(page);

  // Submit and capture the request the app actually sent.
  const requestPromise = page.waitForRequest(
    (r) => r.url().endsWith('/trips') && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();
  const request = await requestPromise;

  // The payload is the assertion that the form was wired up correctly.
  expect(request.postDataJSON()).toEqual({
    title: 'Weekend in Tunisia',
    privacy: 'public',
    from_city: { label: TUNIS.label, lat: TUNIS.lat, lon: TUNIS.lon },
    to_city: { label: SOUSSE.label, lat: SOUSSE.lat, lon: SOUSSE.lon },
  });

  // Success behaviour: on 201 the dialog closes and the feed reloads
  // (feed.ts:314-317). We stay on /feed - there is no navigation or toast.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/feed$/);
});

test('Save stays disabled until the title and both stops are valid', async ({ page }) => {
  await openFeed(page);
  const dialog = await openShareTripDialog(page);

  const save = dialog.getByRole('button', { name: 'Save' });

  // Disabled initially: empty title and fewer than two resolved stops.
  await expect(save).toBeDisabled();

  // Resolving both stops is still not enough - the title is empty.
  await selectStops(page);
  await expect(save).toBeDisabled();

  // A one-character title violates minLength(2).
  await dialog.getByLabel('Trip Title').fill('A');
  await expect(save).toBeDisabled();

  // Valid title + two stops -> the form is finally submittable.
  await dialog.getByLabel('Trip Title').fill('Ab');
  await expect(save).toBeEnabled();
});

test('a trip created from the feed persists and is listed after a reload', async ({ page }) => {
  await openFeed(page);
  const dialog = await openShareTripDialog(page);

  await dialog.getByLabel('Trip Title').fill('Reload Trip');
  await selectStops(page);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // The feed lists posts, not trips, so read the trip back where trips are
  // shown: the map's "My Trips" sidebar (GET /trips/me).
  await page.goto('/map');
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await expect(page.getByRole('heading', { name: 'My Trips' })).toBeVisible();
  await expect(page.getByText('Reload Trip')).toBeVisible();

  // Reload: the app re-fetches /trips/me and the trip is still there.
  await page.reload();
  await page.getByRole('button', { name: 'My Trips' }).click();
  await page.mouse.move(700, 300);
  await expect(page.getByText('Reload Trip')).toBeVisible();
});

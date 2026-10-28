import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// What the app REALLY does (src/app/features/auth/login/login.ts):
//
//   username: [Validators.required, Validators.email]
//   password: [Validators.required]
//
//   onSubmit() {
//     if (this.loginForm.invalid) return;   // <-- validation gate
//     ... this.authService.login(...)       // POST http://localhost:8000/login
//   }
//
// login.html has NO inline validation feedback: when the form is invalid the
// only observable result is that nothing happens - no API call, no redirect,
// no loading state. These tests pin down exactly that behaviour.
// ---------------------------------------------------------------------------

// Counts every attempt to reach the real login API and aborts it, so the real
// backend (http://localhost:8000) is never touched. The regex targets the API
// port (8000) only - the Angular app itself is served on port 4200.
async function spyOnLoginApi(page: Page): Promise<() => number> {
  let calls = 0;
  await page.route(/localhost:8000\/login/, async (route) => {
    calls += 1;
    await route.abort();
  });
  return () => calls;
}

// Block third parties (fonts, firebase/analytics, mapbox) so they fail fast
// instead of risking a stalled page load.
test.beforeEach(async ({ page }) => {
  await page.route(
    /^https?:\/\/(?!localhost:4200|localhost:8000)/,
    (route) => route.abort()
  );
});

test('empty fields: submit is blocked before any API call', async ({ page }) => {
  const loginApiCalls = await spyOnLoginApi(page);

  await page.goto('/auth/login');

  // Click submit while both fields are still empty.
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // The validation gate returned early, so the POST was never started.
  expect(loginApiCalls()).toBe(0);

  // Still on the login page - a successful login would redirect to /feed.
  await expect(page).toHaveURL(/\/auth\/login$/);

  // The button is still idle. "Signing in..." (and disabled) only appears
  // after validation passes and the request is in flight.
  await expect(
    page.getByRole('button', { name: 'Sign In', exact: true })
  ).toBeEnabled();
});

test('invalid email format: submit is blocked before any API call', async ({ page }) => {
  const loginApiCalls = await spyOnLoginApi(page);

  await page.goto('/auth/login');

  // "not-an-email" fails Validators.email. The password is filled on purpose
  // so the email validator alone is responsible for blocking the submit.
  await page.getByPlaceholder('Email').fill('not-an-email');
  await page.getByPlaceholder('Password').fill('dummy-password');

  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  expect(loginApiCalls()).toBe(0);
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(
    page.getByRole('button', { name: 'Sign In', exact: true })
  ).toBeEnabled();
});

// Positive control: proves the spy above actually sees a real request and
// that valid input reaches the API. Without this, the two tests above could
// pass simply because the matcher never matched anything.
test('control: a valid form DOES attempt the login API', async ({ page }) => {
  const loginApiCalls = await spyOnLoginApi(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('Email').fill('someone@example.com');
  await page.getByPlaceholder('Password').fill('dummy-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // No fixed sleep: expect.poll retries until the value settles (or times out).
  await expect.poll(loginApiCalls).toBe(1);
});

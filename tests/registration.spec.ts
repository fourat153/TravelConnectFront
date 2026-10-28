import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Actual registration behaviour (src/app/features/auth/register/register.ts):
//
//   onSubmit() {
//     if (this.registerForm.invalid) return;
//     this.authService.register(this.registerForm.value).subscribe({
//       next: () => this.router.navigate(['/auth/login'], { queryParams: { registered: 'true' } }),
//       error: () => { this.isLoading = false; },   // <-- no error UI at all
//     });
//   }
//
// register() posts to POST http://localhost:8000/users (core/services/auth.ts).
// The backend is mocked below, so no real account is ever created.
// ---------------------------------------------------------------------------

const API = 'http://localhost:8000';

// Fill the whole registration form with valid data.
async function fillRegistrationForm(page: Page, email: string): Promise<void> {
  await page.getByLabel('First Name').fill('Test');
  await page.getByLabel('Last Name').fill('Traveler');
  await page.getByLabel('Email', { exact: true }).fill(email);
  // exact:true is required - "Password" is a substring of "Confirm Password".
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  // Gender is a required PrimeNG <p-select> with no <label>; it renders as a
  // combobox whose choices appear as listbox options.
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Female' }).click();
}

// Block third parties (fonts, firebase/analytics, mapbox) so they fail fast
// instead of risking a stalled page load. The app and mocked API stay allowed.
test.beforeEach(async ({ page }) => {
  await page.route(
    /^https?:\/\/(?!localhost:4200|localhost:8000)/,
    (route) => route.abort()
  );
});

test('valid signup redirects to the login page and shows the success message', async ({ page }) => {
  await page.route(`${API}/users`, (route) =>
    route.fulfill({ status: 201, json: { id: 1 } })
  );

  await page.goto('/auth/register');
  await fillRegistrationForm(page, 'new.traveler@example.com');
  await page.getByRole('button', { name: 'Create Account' }).click();

  // The implemented redirect target is the LOGIN page (not the timeline) -
  // this is the "landed on the right page, not a broken route" check.
  await expect(page).toHaveURL(/\/auth\/login\?registered=true$/);

  // login.ts reacts to ?registered=true with exactly this message.
  await expect(
    page.getByText(
      'Your account was created successfully! Please check your email to confirm your account before signing in.'
    )
  ).toBeVisible();
});

test('signup with an already-used email does not redirect (no error UI exists yet)', async ({ page }) => {
  let registerAttempts = 0;
  await page.route(`${API}/users`, (route) => {
    registerAttempts += 1;
    return route.fulfill({
      status: 400,
      json: { detail: 'Email already registered' },
    });
  });

  await page.goto('/auth/register');
  await fillRegistrationForm(page, 'existing.traveler@example.com');
  await page.getByRole('button', { name: 'Create Account' }).click();

  // The form was valid, so the request WAS sent and the server rejected it.
  await expect.poll(() => registerAttempts).toBe(1);

  // A rejected signup must not look like a success: stay on the register page
  // and never show the success banner.
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.getByText(/created successfully/i)).toBeHidden();

  // KNOWN GAP (documented, not asserted): register.ts's error callback is
  // empty and register.html has no error element, so a duplicate email shows
  // NO validation message today. Once an error element is added, an assertion
  // for it belongs here.
});

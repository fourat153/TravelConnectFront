import { test, expect } from '@playwright/test';

// The app's root route ('') redirects to /auth/login, so the login page
// is effectively the landing page of Travel Connect.

// Block third parties (fonts, firebase/analytics, mapbox) so they fail fast
// instead of risking a stalled page load.
test.beforeEach(async ({ page }) => {
  await page.route(
    /^https?:\/\/(?!localhost:4200|localhost:8000)/,
    (route) => route.abort()
  );
});

test('landing page loads and shows the login form', async ({ page }) => {
  // Navigate to the root URL; Angular redirects '' -> /auth/login
  await page.goto('/');

  // The URL should now be the login route
  await expect(page).toHaveURL(/\/auth\/login$/);

  // Main hero heading (h1 in the hero panel); the <br> shows as a line break
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Discover\s+Trip\s+in Savan/,
    { useInnerText: true }
  );

  // Login card heading (h2)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Welcome Back' })
  ).toBeVisible();

  // Email and Password inputs (identified by their placeholders)
  await expect(page.getByPlaceholder('Email')).toBeVisible();
  await expect(page.getByPlaceholder('Password')).toBeVisible();

  // Submit button
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('landing page "Sign up" link navigates to the register page', async ({ page }) => {
  await page.goto('/auth/login');

  // Click the Sign up link in the register-link paragraph
  await page.getByRole('link', { name: 'Sign up' }).click();

  // Should land on the register route and show its heading
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Create Account' })
  ).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { mockAuthenticatedFeed } from './feed-fixtures';

test('empty timeline shows the "No activity yet" empty state, not a blank page', async ({ page }) => {
  await mockAuthenticatedFeed(page, []);
  await page.goto('/feed');

  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole('heading', { name: 'No activity yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find Friends' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a Trip' })).toBeVisible();
});

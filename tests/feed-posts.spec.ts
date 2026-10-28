import { test, expect } from '@playwright/test';
import { mockAuthenticatedFeed } from './feed-fixtures';

test('loads the feed and renders an existing post with its trip details', async ({ page }) => {
  await mockAuthenticatedFeed(page);

  await page.goto('/feed');
  await expect(page).toHaveURL(/\/feed$/);

  await expect(page.locator('.feed-header').getByText('TravelConnect', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Trip' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible();

  const post = page.locator('.post-card').filter({ hasText: 'Amina Traveler' });
  await expect(post).toHaveCount(1);
  await expect(post.locator('.author-name')).toHaveText('Amina Traveler');
  await expect(post.getByText('Sfax · Spring Tunisia Route', { exact: true })).toBeVisible();
  await expect(post.getByText('A sunny stop on our coastal route.', { exact: true })).toBeVisible();
  await expect(post.getByText('7 likes', { exact: true })).toBeVisible();
  await expect(page.getByText("You're all caught up!", { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No activity yet' })).toHaveCount(0);
});

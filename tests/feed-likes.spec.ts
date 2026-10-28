import { test, expect, type Page, type Route } from '@playwright/test';

const API = 'http://localhost:8000';
const POST_ID = 9401;

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

const testAccount = {
  id: 9402,
  email: 'feed-like-test@example.com',
  firstname: 'Like',
  lastname: 'Tester',
  has_completed_onboarding: 'Onboarded',
};

const testPost = {
  id: POST_ID,
  authorId: 9403,
  authorName: 'Like Test Traveler',
  authorAvatar: '',
  location: 'Monastir',
  tripTitle: 'Like Test Tunisia',
  description: 'A dedicated post for like state testing.',
  likesCount: 4,
  hasLiked: false,
  images: [],
  comments: [],
  createdAt: '2026-10-21T12:00:00Z',
};

async function mockLikeFixture(page: Page, initiallyLiked: boolean): Promise<void> {
  let liked = initiallyLiked;
  let likesCount = testPost.likesCount + (initiallyLiked ? 1 : 0);

  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, route => route.abort());
  await page.route(`${API}/**`, async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === '/auth/verify') {
      await route.fulfill({ status: 200, headers: corsHeaders, json: { valid: true } });
      return;
    }

    if (pathname === '/users/me') {
      await route.fulfill({ status: 200, headers: corsHeaders, json: testAccount });
      return;
    }

    if (pathname === '/notifications') {
      await route.fulfill({ status: 200, headers: corsHeaders, json: [] });
      return;
    }

    if (pathname === '/posts/feed') {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          page_number: 1,
          total_pages: 1,
          posts: [{ ...testPost, likesCount, hasLiked: liked }],
        },
      });
      return;
    }

    if (pathname === `/posts/${POST_ID}/likes` && request.method() === 'POST') {
      liked = true;
      likesCount = testPost.likesCount + 1;
      await route.fulfill({ status: 201, headers: corsHeaders, json: { liked: true } });
      return;
    }

    if (pathname === `/posts/${POST_ID}/likes` && request.method() === 'DELETE') {
      liked = false;
      likesCount = testPost.likesCount;
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { detail: `Unexpected test request: ${pathname}` },
    });
  });
}

function testPostCard(page: Page) {
  return page.locator('.post-card').filter({ hasText: 'Like Test Traveler' });
}

test('likes the dedicated test post and keeps the liked state after reload', async ({ page }) => {
  await mockLikeFixture(page, false);
  await page.goto('/feed');

  const post = testPostCard(page);
  const likeButton = post.locator('button.like-btn');
  await expect(post.getByText('4 likes', { exact: true })).toBeVisible();
  await expect(likeButton).not.toHaveClass(/liked/);

  const likeResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === `/posts/${POST_ID}/likes`
  );
  await likeButton.click();
  const likeResponse = await likeResponsePromise;
  expect(likeResponse.status()).toBe(201);

  await expect(likeButton).toHaveClass(/liked/);
  await expect(likeButton.locator('i')).toHaveClass(/pi-heart-fill/);
  await expect(post.getByText('4 likes', { exact: true })).toHaveCount(0);

  await page.reload();
  const reloadedPost = testPostCard(page);
  await expect(reloadedPost.locator('button.like-btn')).toHaveClass(/liked/);
  await expect(reloadedPost.getByText('5 likes', { exact: true })).toBeVisible();
});

test('unlikes the dedicated test post and keeps the unliked state after reload', async ({ page }) => {
  await mockLikeFixture(page, true);
  await page.goto('/feed');

  const post = testPostCard(page);
  const likeButton = post.locator('button.like-btn');
  await expect(post.getByText('5 likes', { exact: true })).toBeVisible();
  await expect(likeButton).toHaveClass(/liked/);

  const unlikeResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'DELETE' &&
    new URL(response.url()).pathname === `/posts/${POST_ID}/likes`
  );
  await likeButton.click();
  const unlikeResponse = await unlikeResponsePromise;
  expect(unlikeResponse.status()).toBe(204);

  await expect(likeButton).not.toHaveClass(/liked/);
  await expect(likeButton.locator('i')).toHaveClass(/pi-heart(?!-fill)/);
  await expect(post.getByText('5 likes', { exact: true })).toHaveCount(0);

  await page.reload();
  const reloadedPost = testPostCard(page);
  await expect(reloadedPost.locator('button.like-btn')).not.toHaveClass(/liked/);
  await expect(reloadedPost.getByText('4 likes', { exact: true })).toBeVisible();
});

import { test, expect, type Page, type Route } from '@playwright/test';

const API = 'http://localhost:8000';
const POST_ID = 9501;
const UNIQUE_COMMENT = `Playwright comment ${Date.now()}`;

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

const testAccount = {
  id: 9502,
  email: 'feed-comment-test@example.com',
  firstname: 'Comment',
  lastname: 'Tester',
  has_completed_onboarding: 'Onboarded',
};

const testPost = {
  id: POST_ID,
  authorId: 9503,
  authorName: 'Comment Test Traveler',
  authorAvatar: '',
  location: 'Hammamet',
  tripTitle: 'Comment Test Tunisia',
  description: 'A dedicated post for comment testing.',
  likesCount: 2,
  hasLiked: false,
  images: [],
  comments: [],
  createdAt: '2026-10-22T12:00:00Z',
};

async function mockCommentFixture(page: Page): Promise<void> {
  const comments: Array<{
    id: number;
    user_id: number;
    username: string;
    content: string;
    created_at: string;
  }> = [];

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
          posts: [{ ...testPost, comments }],
        },
      });
      return;
    }

    if (pathname === `/posts/${POST_ID}/comments` && request.method() === 'POST') {
      const body = request.postDataJSON() as { content?: string };
      const comment = {
        id: 9601,
        user_id: testAccount.id,
        username: `${testAccount.firstname} ${testAccount.lastname}`,
        content: body.content ?? '',
        created_at: 'Just now',
      };
      comments.push(comment);
      await route.fulfill({ status: 201, headers: corsHeaders, json: comment });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      json: { detail: `Unexpected test request: ${pathname}` },
    });
  });
}

test('submits a unique comment to the dedicated test post', async ({ page }) => {
  await mockCommentFixture(page);
  await page.goto('/feed');

  const post = page.locator('.post-card').filter({ hasText: 'Comment Test Traveler' });
  await expect(post).toHaveCount(1);

  const commentInput = post.getByPlaceholder('Add a comment...');
  await commentInput.fill(UNIQUE_COMMENT);

  const commentResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === `/posts/${POST_ID}/comments`
  );
  await post.getByRole('button', { name: 'Post', exact: true }).click();

  const commentResponse = await commentResponsePromise;
  expect(commentResponse.status()).toBe(201);

  await expect(post.locator('.comment-item').filter({ hasText: UNIQUE_COMMENT })).toHaveCount(1);
  await expect(post.getByText('Comment Tester', { exact: true })).toBeVisible();
  await expect(commentInput).toHaveValue('');
});

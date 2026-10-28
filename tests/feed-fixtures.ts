import type { Page, Route } from '@playwright/test';

export const API = 'http://localhost:8000';

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:4200',
  'access-control-allow-credentials': 'true',
};

const currentUser = {
  id: 9102,
  email: 'feed-test@example.com',
  firstname: 'Feed',
  lastname: 'Tester',
  has_completed_onboarding: 'Onboarded',
};

const existingPost = {
  id: 901,
  authorId: 9101,
  authorName: 'Amina Traveler',
  authorAvatar: '',
  location: 'Sfax',
  tripTitle: 'Spring Tunisia Route',
  description: 'A sunny stop on our coastal route.',
  likesCount: 7,
  hasLiked: false,
  images: [],
  comments: [],
  createdAt: '2026-10-20T12:00:00Z',
};

async function respondToApi(route: Route, posts: unknown[]): Promise<void> {
  const { pathname } = new URL(route.request().url());

  if (pathname === '/auth/verify') {
    await route.fulfill({ status: 200, headers: corsHeaders, json: { valid: true } });
    return;
  }

  if (pathname === '/users/me') {
    await route.fulfill({ status: 200, headers: corsHeaders, json: currentUser });
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
      json: { page_number: 1, total_pages: 1, posts },
    });
    return;
  }

  await route.fulfill({
    status: 404,
    headers: corsHeaders,
    json: { detail: `Unexpected test request: ${pathname}` },
  });
}

export async function mockAuthenticatedFeed(page: Page, posts: unknown[] = [existingPost]): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost:4200|localhost:8000)/, route => route.abort());
  await page.route(`${API}/**`, route => respondToApi(route, posts));
}

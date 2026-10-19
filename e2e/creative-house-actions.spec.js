const { test, expect } = require('@playwright/test');

test('creator page exposes all six functional submission forms', async ({ page }) => {
  await page.goto('/creative-house.html');
  for (const id of [
    'creative-inquiry-form',
    'event-profile-form',
    'event-form',
    'post-form',
    'project-request-form',
    'profile-form',
  ]) {
    await expect(page.locator('#' + id + ' button[type="submit"]')).toHaveCount(1);
  }
});

test('saving a published creator profile gives an actionable public link', async ({ page }) => {
  await page.route('**/api/creative-house/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/creative-house/my-profile' && route.request().method() === 'PUT') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        profile: { published: true, slug: 'a-creative' }
      }) });
    }
    if (url.pathname === '/api/creative-house/my-profile') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"profile":null}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"profiles":[],"opportunities":[],"events":[],"inquiries":[]}' });
  });
  await page.goto('/creative-house.html');
  await page.locator('[data-creative-workflow="profile"]').click();
  const form = page.locator('#profile-form');
  await expect(form).toBeVisible();
  const fields = await form.locator('[name]').evaluateAll(nodes => nodes.map(n => ({ name:n.name, required:n.required, type:n.type })));
  for (const field of fields) {
    if (!field.required || field.type === 'checkbox') continue;
    await form.locator('[name="' + field.name + '"]').fill(
      field.name === 'bio' ? 'Independent creative specializing in original fashion photography and editorial work.' : 'Columbus creative'
    );
  }
  await form.locator('[name="published"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#profile-status a')).toHaveAttribute('href', '/creative-house.html?profile=a-creative#creative-directory');
  await expect(page.locator('#profile-status')).toContainText('Profile saved.');
});

test('creator profile save errors are shown without a false success message', async ({ page }) => {
  await page.route('**/api/creative-house/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/creative-house/my-profile' && route.request().method() === 'PUT') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in required"}' });
    }
    if (url.pathname === '/api/creative-house/my-profile') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"profile":null}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"profiles":[],"opportunities":[],"events":[],"inquiries":[]}' });
  });
  await page.goto('/creative-house.html');
  await page.locator('[data-creative-workflow="profile"]').click();
  const form = page.locator('#profile-form');
  await expect(form).toBeVisible();
  const fields = await form.locator('[name]').evaluateAll(nodes => nodes.filter(n => n.required && n.type !== 'checkbox').map(n => n.name));
  for (const name of fields) await form.locator('[name="' + name + '"]').fill(name === 'bio' ? 'A detailed creative profile for editorial fashion work.' : 'Creative');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#profile-status')).toContainText('Sign in required');
  await expect(page.locator('#profile-status a')).toHaveCount(0);
});

test('activity selection hides unrelated sections while keeping browsing and inbox available', async ({ page }) => {
  await page.goto('/creative-house.html');
  for (const id of ['your-profile', 'event-profile-editor', 'post-event', 'post', 'casting-commissioning']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }
  await expect(page.locator('#private-inquiries .inquiry-inbox')).toBeHidden();
  await page.locator('[data-creative-workflow="event"]').click();
  await expect(page.locator('#post-event')).toBeVisible();
  await expect(page.locator('#post')).toBeHidden();
  await page.locator('[data-creative-workflow="browse"]').click();
  await expect(page.locator('#post-event')).toBeHidden();
  await expect(page.locator('#opportunities')).toBeVisible();
  await expect(page.locator('#fashion-events')).toBeVisible();
});

test('category links reveal their forms and browser history restores browsing', async ({ page }) => {
  await page.goto('/creative-house.html#opportunities');
  await page.locator('#creative-profile-menu > summary').click();
  await page.locator('.creative-jump-panel a[href="#your-profile"]').click();
  await expect(page.locator('#profile-form')).toBeVisible();
  await expect(page.locator('#event-profile-form')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#your-profile')).toBeHidden();
  await page.goto('/creative-house.html#post');
  await expect(page.locator('#post-form')).toBeVisible();
  await expect(page.locator('#event-form')).toBeHidden();
});

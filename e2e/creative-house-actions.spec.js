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
  const form = page.locator('#profile-form');
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
  const form = page.locator('#profile-form');
  const fields = await form.locator('[name]').evaluateAll(nodes => nodes.filter(n => n.required && n.type !== 'checkbox').map(n => n.name));
  for (const name of fields) await form.locator('[name="' + name + '"]').fill(name === 'bio' ? 'A detailed creative profile for editorial fashion work.' : 'Creative');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#profile-status')).toContainText('Sign in required');
  await expect(page.locator('#profile-status a')).toHaveCount(0);
});

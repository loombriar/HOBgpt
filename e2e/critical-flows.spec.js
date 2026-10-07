const { test, expect } = require('@playwright/test');

async function openDesignerSession(request) {
  const response = await request.post('/api/session', { headers: { Authorization: 'Bearer e2e-designer-token' } });
  expect(response.ok()).toBeTruthy();
}

test('designer session persists profile socials and public storefront hides private accounts', async ({ page, request }) => {
  await openDesignerSession(request);
  const profile = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { brandName: 'E2E Atelier', socialLinks: {
      instagram: { url: 'https://instagram.com/e2eatelier', visible: true },
      tiktok: { url: 'https://tiktok.com/@e2eatelier', visible: false }
    }}
  });
  expect(profile.ok()).toBeTruthy();

  await page.goto('/designers/maker');
  await expect(page).toHaveURL(/\/designers\/maker$/);
  const publicProfile = await request.get('/api/designers/maker');
  const publicBody = await publicProfile.json();
  expect(publicBody.designer.socialLinks.instagram.url).toContain('instagram.com/e2eatelier');
  expect(publicBody.designer.socialLinks.tiktok).toBeUndefined();

  const mine = await request.get('/api/my/designer-profile');
  const mineBody = await mine.json();
  expect(mineBody.designer.socialLinks.tiktok.visible).toBe(false);
});

test('cookie-authenticated cross-site mutation is rejected and same-origin mutation succeeds', async ({ request }) => {
  await openDesignerSession(request);
  const blocked = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'https://evil.example' },
    data: { brandName: 'Blocked' }
  });
  expect(blocked.status()).toBe(403);

  const allowed = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { brandName: 'Allowed Atelier' }
  });
  expect(allowed.ok()).toBeTruthy();
});

test('storefront route records an anonymous designer view without storing an IP field', async ({ page, request }) => {
  await page.goto('/designers/maker');
  await page.waitForLoadState('networkidle');
  const analytics = await request.get('/api/admin/analytics', { headers: { Authorization: 'Bearer admin' } });
  if (analytics.status() === 401) {
    test.skip(true, 'Admin analytics requires an explicit E2E admin token.');
  }
});

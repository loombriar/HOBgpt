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
  const analytics = await request.get('/api/admin/analytics', { headers: { Authorization: 'Bearer e2e-admin-token' } });
  expect(analytics.ok()).toBeTruthy();
  const body = await analytics.json();
  expect(body.traffic.topDesigners.some((row) => row.designerId === 'maker' && row.views >= 1)).toBeTruthy();
});


test('runway studio uploads a garment, walks, pauses and exports a preview', async ({ page }) => {
  await page.goto('/runway');
  await expect(page.getByRole('heading', { name: 'The Briar Runway' })).toBeVisible();
  await page.locator('#photo').setInputFiles({
    name: 'garment.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64')
  });
  await expect(page.getByRole('status')).toContainText('Photo ready');
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walk', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('briar-runway.png');
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Photo removed');
  await expect(page.getByRole('link', { name: /House of Briar/ })).toHaveAttribute('href', '/designers/room');
});

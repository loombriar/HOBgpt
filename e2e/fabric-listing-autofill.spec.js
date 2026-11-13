const { test, expect } = require('@playwright/test');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');
for (const preserve of [false, true]) {
  test(`React Fabric Finder fills dedicated fields and ${preserve ? 'preserves maker text' : 'labels estimates'}`, async ({ page }) => {
    expect((await page.request.post('/api/session', { headers: { Authorization: 'Bearer e2e-designer-token' } })).ok()).toBeTruthy();
    await page.route('**/api/my/fabric-finder', route => route.fulfill({ json: { analysis: { fabricFamily: 'Woven fabric', listingMaterialSuggestion: 'Possible cotton', careConsiderations: ['Follow the fabric label'] }, disclaimer: 'Visual estimate only.' } }));
    await page.goto('/account');
    const form = page.locator('#designer-listings');
    const panel = form.locator('xpath=ancestor::details[1]');
    if (await panel.getAttribute('open') === null) await panel.locator(':scope > summary').click();
    await form.getByRole('button', { name: '3. Measurements', exact: true }).click();
    if (preserve) await form.getByLabel('Materials', { exact: true }).fill('Verified linen from supplier');
    await form.getByRole('button', { name: '2. Details', exact: true }).click();
    await form.getByLabel('Description', { exact: true }).fill('Keep my original product description.');
    await form.getByLabel('Take or choose fabric photos', { exact: true }).setInputFiles({ name: 'fabric.png', mimeType: 'image/png', buffer: pixel });
    await form.getByRole('button', { name: 'Identify fabric', exact: true }).click();
    await form.getByRole('button', { name: 'Use material & care in my listing', exact: true }).click();
    await expect(form.getByRole('heading', { name: 'Measurements', exact: true })).toBeVisible();
    const material = form.getByLabel('Materials', { exact: true });
    const care = form.getByLabel('Care instructions', { exact: true });
    await expect(material).toHaveValue(preserve ? 'Verified linen from supplier' : 'Possible cotton (visual estimate — verify fiber content from label or supplier)');
    await expect(care).toHaveValue('Follow the fabric label (suggested care — verify garment label)');
    await care.fill('Dry clean only per maker label');
    await form.getByRole('button', { name: '2. Details', exact: true }).click();
    await expect(form.getByLabel('Description', { exact: true })).toHaveValue('Keep my original product description.');
    await form.getByRole('button', { name: 'Use material & care in my listing', exact: true }).click();
    await expect(care).toHaveValue('Dry clean only per maker label');
    await expect(material).toHaveValue(preserve ? 'Verified linen from supplier' : 'Possible cotton (visual estimate — verify fiber content from label or supplier)');
  });
}

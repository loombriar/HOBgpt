const {test,expect}=require('@playwright/test');

test('rejected designer session closes the workspace without losing an unsaved draft',async({page})=>{
  expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  await page.goto('/designers/room');
  await expect(page.locator('#designer-workspace')).toBeVisible();
  await page.getByRole('navigation',{name:'Designer room sections'}).getByRole('button',{name:'Create a piece',exact:true}).click();
  await page.getByLabel('Design name',{exact:true}).fill('Unsaved designer draft');
  // Revoke the actual server session while leaving the page's UI state in place.
  expect((await page.request.delete('/api/session',{headers:{Origin:'http://127.0.0.1:4173'}})).ok()).toBeTruthy();
  await page.getByText('Payout setup',{exact:true}).click();
  await page.locator('#stripe-onboarding-btn').click();
  await expect(page.locator('#designer-workspace')).toBeHidden();
  await expect(page.locator('#designer-login-panel')).toBeVisible();
  await expect(page.locator('#designer-auth-message')).toContainText('Your designer session is no longer active.');
  await expect(page.getByLabel('Design name',{exact:true})).toHaveValue('Unsaved designer draft');
  expect((await page.request.get('/api/my/designer-profile')).status()).toBe(401);
  expect((await page.request.post('/api/my/stripe-onboarding')).status()).toBe(401);
});

test('Stripe setup errors keep a valid session and a successful retry follows the returned link',async({page})=>{
  expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  await page.goto('/designers/room');
  await expect(page.locator('#designer-workspace')).toBeVisible();
  let retry=false;
  await page.route('**/api/my/stripe-onboarding',async route=>{
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers().cookie).toContain('hob_designer_session=');
    await route.fulfill(retry?{json:{onboardingUrl:'/designers/room?stripe=fixture'}}:{status:503,json:{error:{message:'Payment setup temporarily unavailable.'}}});
  });
  await page.getByText('Payout setup',{exact:true}).click();
  await page.locator('#stripe-onboarding-btn').click();
  await expect(page.locator('#stripe-payout-status')).toHaveText('Payment setup temporarily unavailable.');
  await expect(page.locator('#designer-workspace')).toBeVisible();
  await expect(page.locator('#stripe-onboarding-btn')).toBeEnabled();
  retry=true;
  await page.locator('#stripe-onboarding-btn').click();
  await expect(page).toHaveURL(/stripe=fixture/);
});

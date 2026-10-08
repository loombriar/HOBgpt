const {test,expect}=require('@playwright/test');
for(const width of [390,1280]) {
 test(`House windows and rooms fit a ${width}px screen`,async({page})=>{
  await page.setViewportSize({width,height:850});
  await page.goto('/');
  const windows=page.locator('.shop-drop-window select');
  await expect(windows).toHaveCount(5);
  for(const select of await windows.all()) {
   const box=await select.boundingBox();
   expect(box.height).toBeGreaterThanOrEqual(44);
   expect(box.x).toBeGreaterThanOrEqual(0);
   expect(box.x+box.width).toBeLessThanOrEqual(width);
  }
  await page.locator('.shop-drop-windows').scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/hob-windows-${width}.png`});
  await page.goto('/designers/room');
  await page.getByLabel('Designer access token',{exact:true}).fill('e2e-designer-token');
  await page.locator('#designer-login-form button').click();
  await expect(page.getByRole('navigation',{name:'Designer room sections'})).toBeVisible();
  await page.getByRole('button',{name:'Create a piece',exact:true}).click();
  await expect(page.locator('#product-form')).toBeFocused();
  const checkbox=await page.locator('#product-international').boundingBox();
  expect(checkbox.width).toBeLessThanOrEqual(24);
  await expect(page.locator('#product-form fieldset').filter({has:page.getByText('Price & shipping',{exact:true})})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.locator('#product-name')).toBeInViewport();
  await page.screenshot({path:`/tmp/hob-room-${width}.png`});
  await page.goto('/');
  await page.getByRole('button',{name:'Admin panel',exact:true}).click();
  await page.getByLabel('Administrator code').fill('e2e-admin-token');
  await page.locator('#admin-login-form button').click();
  await expect(page.locator('#admin-overview > details')).toHaveCount(6);
  await page.locator('#admin-overview > details').first().locator('summary').click();
  await expect(page.locator('#admin-daily-traffic')).toBeVisible();
  await page.locator('#admin-review-dialog').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.locator('#admin-review-close')).toBeInViewport();
  expect(await page.locator('#admin-review-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
  await page.screenshot({path:`/tmp/hob-admin-${width}.png`});
  await page.locator('#admin-review-close').click();
  await expect(page.locator('#admin-review-dialog')).not.toBeVisible();
 });
}
for(const width of [390,1280]) {
 test(`Marketplace studio and admin layout fit a ${width}px screen`,async({page})=>{
  await page.setViewportSize({width,height:850});
  const session=await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
  expect(session.ok()).toBeTruthy();
  await page.goto('/account');
  await expect(page.getByRole('navigation',{name:'Designer studio sections'})).toBeVisible();
  await expect(page.locator('details').filter({has:page.getByText('Your Customer account',{exact:true})})).not.toHaveAttribute('open');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/hob-marketplace-studio-${width}.png`});
  await page.goto('/admin');
  await page.getByLabel('Admin access token').fill('e2e-admin-token');
  await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Administration sections'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/hob-marketplace-admin-${width}.png`});
 });
}

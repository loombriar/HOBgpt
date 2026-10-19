const {test,expect}=require('@playwright/test');

test('admin exchanges its token for a cookie and sign out revokes access',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('hob-admin-token','stale-admin-token'));
  await page.goto('/admin');
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('hob-admin-token'))).toBeNull();
  await page.getByLabel('Admin access token').fill('e2e-admin-token');
  const login=page.waitForResponse(r=>r.url().endsWith('/api/admin/session')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Open dashboard'}).click();
  expect((await login).status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Needs Attention'})).toBeVisible();
  const cookies=await page.context().cookies();
  expect(cookies.find(c=>c.name==='hob_admin_session').httpOnly).toBe(true);
  await expect(page.getByRole('button',{name:'Sign out of admin'})).toBeVisible();
  await page.getByRole('link',{name:'Shop',exact:true}).click();
  await page.goto('/admin');
  await expect(page.getByRole('heading',{name:'Needs Attention'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Needs Attention'})).toBeVisible();
  await page.getByRole('button',{name:'Sign out of admin'}).click();
  await expect(page.getByRole('button',{name:'Open dashboard'})).toBeVisible();
  expect((await page.request.get('/api/admin/operations')).status()).toBe(401);
});

 test('homepage admin panel uses the same revocable cookie without storing its code',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('briarAdminToken','stale-admin-token'));
  await page.goto('/');
  await page.getByRole('button',{name:'Admin panel',exact:true}).click();
  await page.getByLabel('Administrator code').fill('e2e-admin-token');
  await page.getByRole('button',{name:'Open admin panel',exact:true}).click();
  await expect(page.locator('#admin-review-workspace')).toBeVisible();
  await expect(page.getByLabel('Administrator code')).toHaveValue('');
  expect(await page.evaluate(()=>sessionStorage.getItem('briarAdminToken'))).toBeNull();
  expect((await page.context().cookies()).find(c=>c.name==='hob_admin_session').httpOnly).toBe(true);
  await page.locator('#admin-signout-btn').click();
  await expect(page.locator('#admin-login-panel')).toBeVisible();
  expect((await page.request.get('/api/admin/operations')).status()).toBe(401);
 });

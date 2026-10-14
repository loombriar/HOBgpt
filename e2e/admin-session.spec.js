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
  await page.getByRole('button',{name:'Sign out of admin'}).click();
  await expect(page.getByRole('button',{name:'Open dashboard'})).toBeVisible();
  expect((await page.request.get('/api/admin/operations')).status()).toBe(401);
});

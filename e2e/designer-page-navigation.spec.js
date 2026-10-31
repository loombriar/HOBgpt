const {test,expect}=require('@playwright/test');
for(const width of [390,1280]){
 test(`designer workspace links to the public page and groups settings at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});
  expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  await page.goto('/designers/room');
  const publicPage=page.getByRole('link',{name:'View my page (opens in a new tab)'});
  await expect(publicPage).toBeVisible();
  await expect(publicPage).toHaveAttribute('href','/designers/maker');
  await expect(publicPage).toHaveAttribute('target','_blank');
  await page.goto('/account');
  const accountLink=page.getByRole('link',{name:'View my page (opens in a new tab)'});
  await expect(accountLink).toBeVisible();
  await expect(accountLink).toHaveAttribute('href','/designers/maker');
  await page.getByRole('navigation',{name:'Designer studio sections'}).getByRole('link',{name:'My profile',exact:true}).click();
  await expect(page.locator('#designer-profile')).toBeVisible();
  await expect(page.locator('#designer-profile #designer-social')).toHaveCount(1);
  await page.getByRole('navigation',{name:'Designer studio sections'}).getByRole('link',{name:'Settings',exact:true}).click();
  await expect(page.locator('#designer-settings #account-information')).toBeVisible();
  await expect(page.locator('#designer-settings').getByRole('region',{name:'Permanently delete designer account'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

const {test,expect}=require('@playwright/test');
for(const width of [390,1280])for(const theme of ['light','dark']){
 for(const route of ['/','/shop'])test(`compact footer matches the reference on ${route} at ${width}px in ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:850});await page.goto(route);await page.evaluate(theme=>{document.documentElement.dataset.hobTheme=theme;document.documentElement.classList.toggle('dark',theme==='dark');},theme);
  const footer=page.locator('footer.house-footer-enhanced .house-footer-bar');await footer.scrollIntoViewIfNeeded();
  await expect(footer).toContainText('House of Briar. All Rights Reserved.');
  const socials=footer.getByRole('navigation',{name:'House of Briar social media',exact:true});for(const name of ['Facebook','YouTube','Instagram'])await expect(socials.getByRole('link',{name,exact:true})).toBeVisible();
  if(route==='/shop')await expect.poll(async()=>{const widget=await page.locator('.house-support-widget').boundingBox(),bar=await footer.boundingBox();return widget.y+widget.height<=bar.y;}).toBe(true);
  const payments=footer.getByRole('region',{name:'Accepted payments',exact:true});await expect(payments.getByRole('img')).toHaveCount(5);
  for(const logo of await payments.getByRole('img').all()){await expect(logo).toBeVisible();await expect.poll(()=>logo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);const box=await logo.boundingBox();expect(box.height).toBeLessThanOrEqual(26);expect(box.width).toBeLessThanOrEqual(40);expect(await logo.evaluate(img=>getComputedStyle(img).backgroundColor)).toBe('rgb(255, 255, 255)');}
  expect((await footer.boundingBox()).height).toBeLessThan(width===390?160:70);await expect(footer.getByRole('heading',{name:'Ways to pay',exact:true})).toHaveCount(0);await footer.screenshot({path:`/tmp/hob-footer-${route==='/'?'home':'shop'}-${theme}-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

 });
 test(`mailbox dropdown is readable at ${width}px in ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:850});await page.route('**/api/my/designer-notifications',r=>r.fulfill({json:{unread:0,items:[]}}));await page.goto('/');await page.evaluate(theme=>document.documentElement.dataset.hobTheme=theme,theme);
  await page.locator('.hob-mailbox').click();const panel=page.locator('#hob-mailbox-panel');await expect(panel).toBeVisible();await expect(panel).toContainText('Your House mailbox');const box=await panel.boundingBox();expect(box.width).toBeGreaterThanOrEqual(300);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(panel.getByRole('link',{name:'Sales & shipping →',exact:true})).toBeVisible();await page.screenshot({path:`/tmp/hob-mailbox-fixed-${theme}-${width}.png`});
 });
}
test('Enter Backstage is a direct link inside the existing dropdown',async({page})=>{await page.goto('/');const menu=page.locator('.hob-backstage-menu');await menu.locator('summary').click();await menu.getByRole('link',{name:'Enter Backstage',exact:true}).click();await expect(page).toHaveURL(/\/creative-house.html$/);});

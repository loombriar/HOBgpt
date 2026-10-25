const {test,expect}=require('@playwright/test');
test('designer menu mailbox appears on designer sign-in and clears only when marked read',async({page})=>{
 let signedIn=false,read=false;
 await page.route(/\/api\/my\/designer-notifications(?:\/.*)?$/,async route=>{
  if(!signedIn)return route.fulfill({status:401,json:{}});
  if(route.request().method()==='PATCH'){read=true;return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{unread:read?0:1,items:[{id:'mailbox-test',title:'New sale',body:'Your piece has sold.',readAt:read?'2026-10-16':null}]}});
 });
 await page.setViewportSize({width:390,height:850});
 await page.goto('/designers/room');
 await expect(page.locator('.hob-mailbox-wrap')).toBeHidden();
 await page.getByText('Have an older access token?',{exact:true}).click();
 await page.getByLabel('Designer access token',{exact:true}).fill('e2e-designer-token');
 signedIn=true;
 await page.locator('#designer-login-form button[type="submit"]').click();
 await page.locator('#hob-global-nav .hob-designers-menu summary').click();
 const mailbox=page.locator('#hob-global-nav .hob-mailbox');
 await expect(mailbox).toBeVisible();
 await expect(mailbox).toHaveClass(/has-unread/);
 await mailbox.click();
 await expect(page.locator('#hob-mailbox-panel')).toContainText('New sale');
 await expect(mailbox).toHaveClass(/has-unread/);
 await page.locator('#hob-mailbox-panel').getByRole('button',{name:'Mark read',exact:true}).click();
 await expect(mailbox).not.toHaveClass(/has-unread/);
 await expect(page.locator('#hob-mailbox-panel')).toContainText('all caught up');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

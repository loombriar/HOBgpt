const {test,expect}=require('@playwright/test');
for(const kind of ['customer','designer']) for(const path of ['/','/creative-house.html']) {
 test(`sticky sign out clears ${kind} session on ${path}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let signedIn=true;const deleted=[];
  await page.route('**/api/my/designer-profile',route=>route.fulfill({status:signedIn&&kind==='designer'?200:401,json:signedIn&&kind==='designer'?{designer:{id:'nav-test',status:'active',email:'nav@example.test'}}:{error:{message:'Sign in'}}}));
  await page.route('**/api/customer/session',route=>{
   if(route.request().method()==='DELETE'){deleted.push('customer');signedIn=false;return route.fulfill({json:{ok:true}});}
   return route.fulfill({status:signedIn&&kind==='customer'?200:401,json:signedIn&&kind==='customer'?{customer:{id:'nav-test',email:'nav@example.test'}}:{error:{message:'Sign in'}}});
  });
  await page.route('**/api/session',route=>{if(route.request().method()==='DELETE'){deleted.push('designer');signedIn=false;}return route.fulfill({json:{ok:true}});});
  await page.route('**/api/my/studio',route=>route.fulfill({json:{items:[]}}));
  await page.goto(path);
  const signout=page.locator('#hob-global-nav').getByRole('button',{name:'Sign out of House of Briar',exact:true});
  await expect(signout).toBeVisible();await expect(signout).toBeInViewport();
  await signout.click();
  await expect.poll(()=>deleted).toEqual(['designer','customer']);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#hob-global-signout')).toBeHidden();
 });
}
test('failed sticky sign out keeps the action available and reports failure',async({page})=>{
 await page.route('**/api/my/designer-profile',route=>route.fulfill({status:401,json:{}}));
 await page.route('**/api/customer/session',route=>route.fulfill({status:route.request().method()==='DELETE'?503:200,json:{customer:{id:'nav-test'}}}));
 await page.route('**/api/session',route=>route.fulfill({json:{ok:true}}));
 await page.goto('/');const signout=page.locator('#hob-global-signout');await expect(signout).toBeVisible();
 let message='';page.once('dialog',async warning=>{message=warning.message();await warning.dismiss();});await signout.click();await expect.poll(()=>message).toContain('Sign out did not complete');
 await expect(signout).toBeEnabled();await expect(signout).toBeVisible();
});

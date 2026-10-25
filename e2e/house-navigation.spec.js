const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`role menus and one account entry work at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto('/');
 const nav=page.locator('#hob-global-nav');
 await expect(nav.getByRole('link',{name:'Sign in / Join',exact:true})).toBeVisible();
 for(const label of ['Designers','Seamstresses','Creative House']){
  const menu=nav.locator('details').filter({has:page.locator('summary').filter({hasText:new RegExp('^'+label+'$')})});
  await menu.locator('summary').click();await expect(menu).toHaveAttribute('open','');
  expect(await nav.locator('details[open]').count()).toBe(1);
  const box=await menu.locator('.hob-seamstress-menu-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  if(label==='Creative House')await expect(menu.getByRole('link',{name:'Photographer sign in / signup',exact:true})).toBeVisible();
 }
 await page.keyboard.press('Escape');expect(await nav.locator('details[open]').count()).toBe(0);
 await nav.getByRole('link',{name:'Sign in / Join',exact:true}).click();await expect(page).toHaveURL(/join.html$/);await expect(page.getByText('Designers use their designer account.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/hob-navigation-${width}.png`,fullPage:true});
});
for(const role of ['model','photographer','dj','venue'])test(`${role} choice verifies email and lands on the right profile`,async({page})=>{
 await page.goto('/join.html');await page.getByRole('link',{name:{model:'Model',photographer:'Photographer',dj:'DJ',venue:'Venue'}[role],exact:true}).click();
 const modal=page.getByRole('dialog',{name:new RegExp('sign in / signup')});await expect(modal).toContainText('No designer shop is required.');
 const email=`nav-${role}@example.test`;await modal.getByLabel('Email',{exact:true}).fill(email);await modal.getByRole('checkbox',{name:/I agree to the/}).check();await modal.getByRole('button',{name:'Email me a sign-in code',exact:true}).click();
 await expect(modal.getByLabel('Six-digit email code',{exact:true})).toBeVisible();const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();await modal.getByLabel('Six-digit email code',{exact:true}).fill(code);await modal.getByRole('button',{name:'Verify and sign in',exact:true}).click();
 const event=['dj','venue'].includes(role);await expect(page).toHaveURL(new RegExp('creative-house.html\\?join='+role+(event?'#event-profile-editor':'#your-profile')+'$'));await expect(page.locator(event?'#event-profile-form select[name=role]':'#profile-form select[name=role]')).toHaveValue(role);
});
test('designer notifications deep link opens the private inbox',async({page})=>{
 await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});await page.goto('/account#designer-notifications');await expect(page.locator('#designer-notifications')).toHaveAttribute('open','');await expect(page.locator('#designer-notifications')).toBeInViewport();
});

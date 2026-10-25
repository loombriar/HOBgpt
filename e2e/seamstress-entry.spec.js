const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`seamstress signup uses email verification and opens the sewing profile at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto('/');
 await expect(page.getByRole('link',{name:'Shop the edit',exact:false})).toHaveCount(0);
 const menu=page.locator('#hob-global-nav .hob-seamstress-menu');await menu.locator('summary').click();
 for(const screen of width===390?[390,430]:[1280]){await page.setViewportSize({width:screen,height:850});const box=await menu.locator('.hob-seamstress-menu-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(screen);}
 await page.setViewportSize({width,height:850});await menu.getByRole('link',{name:'Seamstress signup',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Seamstress signup',exact:true});await expect(modal).toBeVisible();
 await expect(modal).toContainText('You do not need a designer shop.');await expect(modal.getByRole('link',{name:'Google Play reviewer sign-in',exact:true})).toBeHidden();
 const email=`seamstress-entry-${width}@example.test`;await modal.getByLabel('Your name (optional)',{exact:true}).fill('Sewing Friend');await modal.getByLabel('Email',{exact:true}).fill(email);await modal.getByRole('checkbox',{name:/I agree to the/}).check();await modal.getByRole('button',{name:'Email me a sign-in code',exact:true}).click();
 await expect(modal.getByLabel('Six-digit email code',{exact:true})).toBeVisible();const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();await modal.getByLabel('Six-digit email code',{exact:true}).fill(code);await modal.getByRole('button',{name:'Verify and sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/sewing-services.html#offer-services$/);await expect(page.locator('#offer-services')).toHaveAttribute('open','');await expect(page.getByRole('checkbox',{name:/Bring sketches to life/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('seamstress sign in uses an existing customer and opens service requests without a reviewer password',async({page})=>{
 const email='returning-seamstress@example.test',origin='http://127.0.0.1:4173';
 const created=await page.request.post('/api/customer/signin-code',{headers:{Origin:origin},data:{email,name:'Returning Sewer',acceptedRules:true}});const {requestId}=await created.json();const firstCode=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();await page.request.post('/api/customer/verify-code',{headers:{Origin:origin},data:{requestId,code:firstCode.code}});await page.request.delete('/api/customer/session',{headers:{Origin:origin}});
 await page.goto('/?visitors=signup&seamstress=signin&returnTo=https://example.invalid');
 const modal=page.getByRole('dialog',{name:'Seamstress sign in',exact:true});await expect(modal).toBeVisible();await expect(modal.getByLabel('Your name (optional)',{exact:true})).toBeHidden();await expect(modal.locator('input[type=password]')).toHaveCount(0);await modal.getByLabel('Email',{exact:true}).fill(email);await modal.getByRole('checkbox',{name:/I agree to the/}).check();await modal.getByRole('button',{name:'Email me a sign-in code',exact:true}).click();
 await expect(modal.getByLabel('Six-digit email code',{exact:true})).toBeVisible();const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();await modal.getByLabel('Six-digit email code',{exact:true}).fill(code);await modal.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(page).toHaveURL(origin+'/sewing-services.html#service-inbox');await expect(page.locator('#service-inbox')).toHaveAttribute('open','');await expect(page.locator('#service-inbox-status')).toHaveText('Only you can see these requests.');
});

for(const width of [390,1280])test(`seamstress menu stays within the account dashboard at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});await page.goto('/account');
 const menu=page.locator('.house-seamstress-menu');await menu.locator('summary').click();await expect(menu.getByRole('link',{name:'Seamstress sign in',exact:true})).toBeVisible();await expect(menu.getByRole('link',{name:'Seamstress signup',exact:true})).toBeVisible();const box=await menu.locator('.house-seamstress-menu-panel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
});

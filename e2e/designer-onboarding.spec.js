const {test,expect}=require('@playwright/test');
for(const room of ['dashboard','standalone'])test(`designer onboarding opens the next task and keeps pending approval distinct in ${room}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
 const profile=await(await page.request.get('/api/my/designer-profile')).json();
 await page.route('**/api/my/designer-profile',route=>route.fulfill({json:{...profile,designer:{...profile.designer,sellerTermsAccepted:true,brandName:'Test Atelier',bio:'',location:''}}}));
 await page.route('**/api/my/stripe-status',route=>route.fulfill({json:{readyToSell:true,connected:true,onboardingComplete:true,payoutsEnabled:true}}));
 let pending=false;
 const items=()=>pending?[{id:'pending-piece',title:'Awaiting approval piece',status:'pending_review',moderationStatus:'pending',designerId:'maker',price:60,category:'apparel',productionType:'One of a Kind',images:[]}]:[];
 await page.route('**/api/my/listings',route=>route.fulfill({json:{items:items()}}));
 await page.route('**/api/my/studio',route=>route.fulfill({json:{items:items(),ordersCount:0,messages:0,views:{events:0}}}));
 const url=room==='dashboard'?'/account':'/designers/room';
 await page.goto(url);
 if(room==='dashboard'){
  await page.locator('details').filter({has:page.locator('#launch-title')}).locator(':scope > summary').click();
  const checklist=page.getByRole('region',{name:'Your path to selling',exact:true});
  await expect(checklist).toContainText('2 of 4 required selling steps complete.');
  await checklist.locator('[data-next-action]').getByRole('link',{name:'Create your first draft',exact:true}).click();
  await expect(page.locator('#designer-listings')).toHaveAttribute('open','');await expect(page.getByRole('textbox',{name:'Piece name',exact:true})).toBeVisible();
 }else{
  await expect(page.locator('#seller-readiness-badge')).toHaveText('Account ready · prepare your first approved piece');
  await page.locator('#seller-next-action').getByRole('button',{name:'Create a draft',exact:true}).click();await expect(page.locator('#product-form')).toBeVisible();
  await page.getByRole('navigation',{name:'Designer room sections'}).getByRole('button',{name:'Getting started',exact:true}).click();
  await page.locator('#seller-readiness-list').getByRole('button',{name:'Edit designer profile',exact:true}).click();await expect(page.locator('#designer-brand-form')).toBeVisible();
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 pending=true;await page.goto(url);await page.reload();
 if(room==='dashboard'){
  await page.locator('details').filter({has:page.locator('#launch-title')}).locator(':scope > summary').click();const checklist=page.getByRole('region',{name:'Your path to selling',exact:true});
  await expect(checklist).toContainText('3 of 4 required selling steps complete.');await expect(checklist.locator('[data-next-action]').getByRole('link',{name:'View review status',exact:true})).toBeVisible();await expect(checklist.getByText('Selling setup complete',{exact:true})).toHaveCount(0);
  await checklist.locator('[data-next-action]').getByRole('link',{name:'View review status',exact:true}).click();await expect(page.locator('#products')).toBeVisible();await expect(page.getByText('Awaiting approval piece',{exact:true})).toBeVisible();
 }else{
  await expect(page.locator('#seller-readiness-summary')).toContainText('3 of 4 required');await expect(page.locator('#seller-readiness-badge')).not.toHaveText('Selling setup complete');
  await page.locator('#seller-next-action').getByRole('button',{name:'View review status',exact:true}).click();await expect(page.locator('#designer-listing-area')).toBeVisible();
 }
});

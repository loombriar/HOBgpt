const {test,expect}=require('@playwright/test');
test('installed PWA uses a clear offline page without pretending checkout completed',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.context().setOffline(true);
 try{await page.goto('/creative-house.html');await expect(page.getByRole('heading',{name:'A little pause. We’ll be here.'})).toBeVisible();await expect(page.getByText('We can’t check payment or account status while you’re offline.',{exact:false})).toBeVisible();const apiFailed=await page.evaluate(()=>fetch('/api/creative-house/subscription').then(()=>false).catch(()=>true));expect(apiFailed).toBeTruthy();}finally{await page.context().setOffline(false);}
});

test('fresh direct React entry registers the offline fallback and leaves private APIs network-only',async({page})=>{
 await page.goto('/shop');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.context().setOffline(true);
 try{
  await page.goto('/account');await expect(page.getByRole('heading',{name:'A little pause. We’ll be here.'})).toBeVisible();
  expect(await page.evaluate(()=>fetch('/api/my/orders').then(()=>false).catch(()=>true))).toBeTruthy();
 }finally{await page.context().setOffline(false);}
});

for (const query of [
 '?checkout=success&session_id=cs_fixture',
 '?checkout=canceled&order_id=order_fixture&cancel_token=private_fixture',
 '?paypal=success&token=paypal_fixture&PayerID=payer_fixture',
]) {
 test('offline retry preserves the confirmation URL: '+query,async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const target=new URL('/checkout'+query,page.url()).href;
  await page.context().setOffline(true);
  try {
   await page.goto(target);
   await expect(page.getByText('check your confirmation before attempting another payment.',{exact:false})).toBeVisible();
   const retry=page.getByRole('link',{name:'Try again',exact:true});
   expect(await retry.evaluate(link=>link.href)).toBe(target);
   // Serve a harmless confirmation fixture: this test never contacts a payment provider.
   await page.route(target,route=>route.fulfill({contentType:'text/html',body:'<h1>Connection restored</h1>'}));
   await page.context().setOffline(false);
   await retry.click();
   await expect(page).toHaveURL(target);
   await expect(page.getByRole('heading',{name:'Connection restored'})).toBeVisible();
  } finally { await page.context().setOffline(false); }
 });
}

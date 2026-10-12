const {test,expect}=require('@playwright/test');
test('installed PWA uses a clear offline page without pretending checkout completed',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.context().setOffline(true);
 try{await page.goto('/creative-house.html');await expect(page.getByRole('heading',{name:'A little pause. We’ll be here.'})).toBeVisible();await expect(page.getByText('Checkout, payments, uploads, and account changes need an internet connection.',{exact:false})).toBeVisible();const apiFailed=await page.evaluate(()=>fetch('/api/creative-house/subscription').then(()=>false).catch(()=>true));expect(apiFailed).toBeTruthy();}finally{await page.context().setOffline(false);}
});

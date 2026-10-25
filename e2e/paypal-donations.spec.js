const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`PayPal donation opens approval with the displayed amount and recovers from errors at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});let calls=0;
 await page.route('**/api/paypal/donations/order',async route=>{calls++;expect(route.request().postDataJSON()).toEqual({amount:12});await route.fulfill({status:503,json:{error:{message:'PayPal is temporarily unavailable.'}}});});
 await page.goto('/#support');await page.locator('#donation-amount').fill('12');
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.hobTheme=t,theme);const contrast=await page.locator('#paypal-donation-btn').evaluate(el=>{const lum=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);const style=getComputedStyle(el),a=lum(style.color),b=lum(style.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);}
 await page.locator('#donation-form').screenshot({path:`/tmp/hob-paypal-options-${width}.png`});await page.getByRole('button',{name:'Donate with PayPal',exact:true}).click();
 await expect(page.locator('#donation-message')).toContainText('PayPal is temporarily unavailable.');for(const name of ['Donate with Stripe','Donate with PayPal'])await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();expect(calls).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#donation-form').screenshot({path:`/tmp/hob-paypal-donation-${width}.png`});
 await page.unroute('**/api/paypal/donations/order');await page.route('**/api/paypal/donations/order',async route=>{expect(route.request().postDataJSON().amount).toBe(12);await route.fulfill({status:201,json:{url:'https://www.paypal.com/checkoutnow?token=LOCAL-FIXTURE'}});});
 await page.route('https://www.paypal.com/**',route=>route.fulfill({body:'PayPal approval fixture — no payment',contentType:'text/plain'}));
 await page.getByRole('button',{name:'Donate with PayPal',exact:true}).click();await expect(page).toHaveURL('https://www.paypal.com/checkoutnow?token=LOCAL-FIXTURE');
});
test('an unsafe PayPal approval URL is rejected before navigation',async({page})=>{
 await page.route('**/api/paypal/donations/order',route=>route.fulfill({status:201,json:{url:'https://paypal.com.evil.test/payment'}}));await page.goto('/#support');await page.getByRole('button',{name:'Donate with PayPal',exact:true}).click();await expect(page.locator('#donation-message')).toContainText('valid approval link');await expect(page).toHaveURL(/127.0.0.1/);
});
test('marketplace homepage offers both donation methods and sends the custom PayPal amount',async({page})=>{
 // Exercise the React homepage independently of the server's native homepage route.
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({path:require('path').join(__dirname,'../apps/default/dist/index.html'),contentType:'text/html'}));
 await page.route('**/api/paypal/donations/order',async route=>{expect(route.request().postDataJSON()).toEqual({amount:15});await route.fulfill({status:503,json:{error:{message:'PayPal fixture unavailable'}}});});
 await page.goto('/');await page.getByLabel('Custom amount',{exact:true}).fill('15');await expect(page.getByRole('button',{name:'Donate with Stripe',exact:true})).toBeVisible();await page.getByRole('button',{name:'Donate with PayPal',exact:true}).click();await expect(page.getByRole('alert')).toContainText('PayPal fixture unavailable');await expect(page.getByRole('button',{name:'Donate with PayPal',exact:true})).toBeEnabled();
});

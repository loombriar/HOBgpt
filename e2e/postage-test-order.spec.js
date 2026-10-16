const {test,expect}=require('@playwright/test');
test('designer can create one clearly labelled practice order from the test-only helper',async({page})=>{
  expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  let created=false;let posts=0;
  await page.route('**/api/my/postage-test-order',route=>{
    if(route.request().method()==='POST'){created=true;posts++;return route.fulfill({status:posts===1?201:200,json:{orderId:'postage-test-fixture',simulated:true,message:'Sample order ready. No payment was taken, no inventory changed, and no payout can be released.'}});}
    return route.fulfill({json:{available:true}});
  });
  await page.route('**/api/my/orders',route=>route.fulfill({json:{orders:created?[{id:'postage-test-fixture',orderStatus:'paid',fulfillmentStatus:'awaiting_shipment',payoutStatus:'pending',earningsCents:9100,items:[{title:'TEST ONLY — Postage practice order (no payment)',quantity:1,earningsCents:9100}]}]:[]}}));
  await page.route('**/api/orders/postage-test-fixture/postage',route=>route.fulfill({json:{enabled:true,test:true,label:null}}));
  await page.goto('/account#orders');
  await page.getByRole('button',{name:'Create sample postage order',exact:true}).click();
  await expect(page.getByRole('heading',{name:'TEST ONLY — Postage practice order (no payment)',exact:true})).toBeVisible();
  await expect(page.getByText('Sample order ready. No payment was taken, no inventory changed, and no payout can be released.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Create sample postage order',exact:true}).click();
  await expect(page.getByRole('heading',{name:'TEST ONLY — Postage practice order (no payment)',exact:true})).toHaveCount(1);
  expect(posts).toBe(2);
});

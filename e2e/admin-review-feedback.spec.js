const {test,expect}=require('@playwright/test');

test('mobile change requests require specific feedback and validate the full message before submission',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const item={id:'review-feedback',title:'Feedback fixture dress',description:'A handmade dress',price:75,category:'apparel',designerId:'maker',status:'pending_review',moderationStatus:'pending',images:[]};
  let submitted=false;
  const requests=[];
  await page.route('**/api/admin/operations',route=>route.fulfill({json:{
    summary:{paidOrders:0,refundedOrders:0,pendingOrders:0,heldPayouts:0,failedPayouts:0,releasedPayouts:0,reversedPayouts:0,activeReservations:0},
    orders:[],payouts:[],inventory:[],emails:{configured:true,counts:{pending:0,failed:0,sent:0},messages:[]}
  }}));
  await page.route('**/api/admin/listings/review-queue',route=>route.fulfill({json:{items:submitted?[]:[item]}}));
  await page.route('**/api/admin/support',route=>route.fulfill({json:{messages:[],templates:[]}}));
  await page.route('**/api/admin/listings/review-feedback/reject',route=>{
    requests.push(route.request().postDataJSON());submitted=true;
    return route.fulfill({json:{item:{...item,status:'rejected'}}});
  });
  // UI validation fixture only. Authentication, seller notification delivery and
  // server moderation state transitions are exercised by their existing suites.
  await page.goto('/admin');
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:item.title,exact:true})});
  await expect(card).toBeVisible();
  const send=card.getByRole('button',{name:'Request changes',exact:true});
  await send.click();
  await expect(page.getByRole('alert')).toHaveText('Choose a reason before requesting changes.');
  const category='Needs clearer product details';
  await card.getByLabel('Change category',{exact:true}).selectOption({label:category});
  const detail=card.getByLabel('Additional details',{exact:true});
  await detail.fill('   ');
  await send.click();
  await expect(page.getByRole('alert')).toHaveText('Explain what the designer needs to change.');
  expect(requests).toHaveLength(0);
  await detail.fill('x'.repeat(1001-category.length-2));
  await send.click();
  await expect(page.getByRole('alert')).toHaveText('Keep the category and explanation within 1,000 characters.');
  await expect(card).toBeVisible();
  expect(requests).toHaveLength(0);
  const exact='x'.repeat(1000-category.length-2);
  await detail.fill('  '+exact+'  ');
  await send.click();
  await expect(card).toHaveCount(0);
  expect(requests).toEqual([{reason:category+': '+exact}]);
  expect(requests[0].reason).toHaveLength(1000);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

const {test,expect}=require('@playwright/test');

test('held payout explains the result and a refund refreshes the order summary',async({page})=>{
  let refunded=false;
  const order={id:'feedback-order',status:'paid',subtotal_cents:500,platform_fee_cents:45,designer_amount_cents:455,item_count:1};
  await page.route('**/api/admin/operations',route=>route.fulfill({json:{
    summary:{paidOrders:refunded?0:1,refundedOrders:refunded?1:0,heldPayouts:1},
    orders:[{...order,status:refunded?'refunded':'paid',refund_status:refunded?'succeeded':null}],
    payouts:[{order_id:order.id,designer_id:'maker',amount_cents:455,status:'pending',tracking_status:'test_transit'}],
    inventory:[],emails:{configured:true,counts:{pending:0,failed:0,sent:0},messages:[]}
  }}));
  await page.route('**/api/admin/orders/feedback-order/designers/maker/release',route=>route.fulfill({json:{results:[{designer_id:'maker',status:'pending',reason:'carrier_verification_required'}]}}));
  await page.route('**/api/admin/orders/feedback-order',route=>route.fulfill({json:{order:{...order,refund_status:refunded?'succeeded':null},items:[],refunds:refunded?[{scope:'full',amount_cents:500,status:'succeeded'}]:[]}}));
  await page.route('**/api/admin/orders/feedback-order/refund',route=>{refunded=true;return route.fulfill({json:{status:'succeeded',amountCents:500,refundId:'re_feedback'}});});
  expect((await page.request.post('/api/admin/session',{headers:{Authorization:'Bearer e2e-admin-token',Origin:'http://127.0.0.1:4173'}})).status()).toBe(200);
  await page.goto('/admin');
  await expect(page.getByRole('heading',{name:'Needs Attention'})).toBeVisible();
  await page.getByRole('button',{name:'Release payout',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Payout held: carrier verification is required.'})).toBeVisible();
  await expect(page.locator('#admin-payouts')).toContainText('$4.55 · pending');
  await page.locator('#admin-orders').getByRole('button',{name:'Details',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Refund full order',exact:true}).click();
  await expect(page.locator('#admin-orders').getByRole('row').filter({hasText:order.id.slice(0,10)})).toContainText('refunded');
  await expect(page.locator('#admin-orders').getByRole('button',{name:'Refund',exact:true})).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'Stripe refund succeeded'})).toBeVisible();
});

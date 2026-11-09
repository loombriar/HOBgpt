const {test,expect}=require('@playwright/test');

test('held payout explains the result and a refund refreshes the order summary',async({page})=>{
  let refunded=false;
  const order={id:'feedback-order',status:'paid',subtotal_cents:500,platform_fee_cents:45,designer_amount_cents:455,item_count:1};
  await page.route('**/api/admin/session',route=>route.fulfill({json:{admin:{label:'owner-fixture',role:'owner'}}}));
  await page.route('**/api/admin/operations',route=>route.fulfill({json:{
    summary:{paidOrders:refunded?0:1,refundedOrders:refunded?1:0,heldPayouts:1},
    orders:[{...order,status:refunded?'refunded':'paid',refund_status:refunded?'succeeded':null}],
    payouts:[{order_id:order.id,designer_id:'maker',amount_cents:455,status:'pending',tracking_status:'test_transit',refund_hold:refunded,refund_status:refunded?'succeeded':null}],
    inventory:[],emails:{configured:true,counts:{pending:0,failed:0,sent:0},messages:[]}
  }}));
  await page.route('**/api/admin/orders/feedback-order/designers/maker/release',route=>route.fulfill({json:{results:[{designer_id:'maker',status:'pending',reason:'carrier_verification_required'}]}}));
  await page.route('**/api/admin/orders/feedback-order',route=>route.fulfill({json:{order:{...order,refund_status:refunded?'succeeded':null},items:[],refunds:refunded?[{scope:'full',amount_cents:500,status:'succeeded'}]:[]}}));
  await page.route('**/api/admin/orders/feedback-order/refund',route=>{refunded=true;return route.fulfill({json:{status:'succeeded',amountCents:500,refundId:'re_feedback'}});});
  // This test exercises UI feedback with mocked operations, not authentication.
  // Keep required companion responses isolated too; real login/revocation is covered separately.
  await page.route('**/api/admin/listings/review-queue',route=>route.fulfill({json:{items:[]}}));
  await page.route('**/api/admin/support',route=>route.fulfill({json:{messages:[],templates:[]}}));
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
  await expect(page.locator('#admin-payouts')).toContainText('$4.55 · Held — refunded');
  await expect(page.locator('#admin-payouts').getByRole('button',{name:'Release payout',exact:true})).toBeDisabled();
  await expect(page.locator('#admin-payouts')).toContainText('This seller’s items were refunded. No payout can be released.');
});


test('partial refunds disable only the affected seller and preserve paid and reversed states',async({page})=>{
  const orderId='partial-refund-order';
  await page.route('**/api/**',route=>route.fulfill({json:{}}));
  await page.route('**/api/admin/session',route=>route.fulfill({json:{admin:{label:'owner-fixture',role:'owner'}}}));
  await page.route('**/api/admin/operations',route=>route.fulfill({json:{
    summary:{paidOrders:1,heldPayouts:2},
    orders:[{id:orderId,status:'paid',refund_status:'partial',subtotal_cents:1200,item_count:2}],
    payouts:[
      {order_id:orderId,designer_id:'refunded-maker',amount_cents:665,status:'pending',refund_hold:true,refund_status:'succeeded'},
      {order_id:orderId,designer_id:'other-maker',amount_cents:465,status:'pending',refund_hold:false,refund_status:null},
      {order_id:'review-order',designer_id:'review-maker',amount_cents:500,status:'failed',refund_hold:true,refund_status:'pending'},
      {order_id:'paid-order',designer_id:'paid-maker',amount_cents:500,status:'paid',refund_hold:true,refund_status:'pending'},
      {order_id:'reversed-order',designer_id:'reversed-maker',amount_cents:500,status:'paid',stripe_reversal_id:'trr_fixture',refund_hold:true,refund_status:'succeeded'}
    ],
    inventory:[],emails:{configured:true,counts:{pending:0,failed:0,sent:0},messages:[]}
  }}));
  await page.goto('/admin');
  const payouts=page.locator('#admin-payouts');
  await expect(payouts).toContainText('$6.65 · Held — refunded');
  await expect(payouts.getByRole('button',{name:'Release payout',exact:true}).nth(0)).toBeDisabled();
  await expect(payouts.getByRole('button',{name:'Release payout',exact:true}).nth(1)).toBeEnabled();
  await expect(payouts).toContainText('$4.65 · pending');
  await expect(payouts).toContainText('Held — refund review required');
  const retry=payouts.getByRole('button',{name:'Retry payout',exact:true});
  await expect(retry).toBeDisabled();
  await expect(retry).toHaveAccessibleDescription('This seller’s payout is blocked by a refund. Review the order’s refund details.');
  await expect(payouts).toContainText('$5.00 · paid');
  await expect(payouts).toContainText('$5.00 · reversed');
  await expect(payouts.getByRole('button',{name:/^(Release payout|Retry payout)$/})).toHaveCount(3);
});

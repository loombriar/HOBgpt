const {test,expect}=require('@playwright/test');
for(const width of [390,1280]){
 test(`Admin room puts actionable queues ahead of analytics at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});
  await page.route('**/api/admin/operations',route=>route.fulfill({json:{summary:{},orders:[{id:'paid-order',status:'paid'}],payouts:[{order_id:'paid-order',status:'pending'},{order_id:'problem',status:'failed'}],emails:{configured:true,counts:{pending:0,failed:0,sent:0},messages:[]}}}));
  await page.route('**/api/admin/support',route=>route.fulfill({json:{messages:[{id:'support-one',status:'auto_replied',category:'shipping',message:'Where is my order?'}],templates:[]}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Admin panel',exact:true}).click();
  await page.getByLabel('Administrator code').fill('e2e-admin-token');
  await page.locator('#admin-login-form button[type=submit]').click();
  await expect(page.locator('.admin-attention-card')).toHaveCount(4);
  await expect(page.locator('[data-attention-queue="shipping"] strong')).toHaveText('1');
  await expect(page.locator('[data-attention-queue="payouts"] strong')).toHaveText('1');
  await expect(page.locator('[data-attention-queue="support"] strong')).toHaveText('1');
  await expect(page.locator('[data-attention-queue="shipping"]')).toHaveAttribute('href','/admin#admin-orders');
  expect(await page.locator('#admin-attention').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#admin-review-list'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('#admin-website-views')).not.toHaveAttribute('open');
  await page.locator('[data-attention-queue="support"]').click();
  await expect(page.locator('#admin-customer-service')).toHaveAttribute('open');
  await expect(page.locator('#admin-customer-service')).toContainText('Where is my order?');
  await page.route('**/api/admin/operations',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.locator('#admin-attention-refresh').click();
  await expect(page.locator('[data-attention-queue="shipping"] strong')).toHaveText('Could not check');
  await expect(page.locator('#admin-attention-status')).toContainText('Some queues could not be checked');
  expect(await page.locator('#admin-review-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.locator('#admin-signout-btn').click();
  await expect(page.locator('#admin-attention-cards')).toBeEmpty();
  await expect(page.locator('#admin-review-workspace')).toBeHidden();
 });
}

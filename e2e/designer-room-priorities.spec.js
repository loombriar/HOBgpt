const {test,expect}=require('@playwright/test');
for(const width of [390,1280]){
 test(`designer room prioritizes paid orders and separates listing stages at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});
  expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  const base={designerId:'maker',price:50,category:'apparel',moderationStatus:'approved',productionType:'One of a Kind',availableQuantity:1,reservedQuantity:0,soldQuantity:0,images:[]};
  const items=[
   {...base,id:'draft',title:'Private draft',status:'draft'},
   {...base,id:'pending',title:'Awaiting review',status:'pending_review'},
   {...base,id:'live',title:'Live piece',status:'published'},
   {...base,id:'sold',title:'Sold piece',status:'published',availableQuantity:0,soldQuantity:1},
   {...base,id:'paused',title:'Paused piece',status:'published',pausedByDesigner:true}
  ];
  await page.route('**/api/my/studio',route=>route.fulfill({json:{items,ordersCount:4,messages:0,views:{events:0}}}));
  await page.route('**/api/my/orders',route=>route.fulfill({json:{orders:[
   {id:'order-ship1234',orderStatus:'paid',fulfillmentStatus:'awaiting_shipment',payoutStatus:'pending'},
   {id:'order-pay12345',orderStatus:'paid',fulfillmentStatus:'tracking_verified',payoutStatus:'failed'},
   {id:'order-unpaid',orderStatus:'pending',fulfillmentStatus:'pending',payoutStatus:'pending'},
   {id:'order-held',orderStatus:'paid',fulfillmentStatus:'tracking_submitted',payoutStatus:'pending'}
  ]}}));
  await page.goto('/designers/room');
  await expect(page.locator('#designer-attention-status')).toHaveText('2 paid orders need follow-up.');
  await expect(page.locator('.designer-attention-order')).toHaveCount(2);
  await expect(page.locator('#designer-attention-orders')).toContainText('SHIP1234');
  await expect(page.locator('#designer-attention-orders')).not.toContainText('UNPAID');
  expect(await page.locator('#designer-attention').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#designer-listing-area'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('#designer-listing-area')).toBeHidden();
  await page.getByRole('navigation',{name:'Designer room sections'}).getByRole('button',{name:'Your listings',exact:true}).click();
  await expect(page.locator('#designer-listing-area')).toBeVisible();
  await expect(page.locator('#product-form')).toBeHidden();
  for(const [group,title]of [['Drafts','Private draft'],['Pending approval','Awaiting review'],['Live','Live piece'],['Sold','Sold piece'],['Other','Paused piece']]){
   await page.locator(`[data-listing-group="${group}"]`).click();
   await expect(page.locator('#designer-products .designer-product-item')).toHaveCount(1);
   await expect(page.locator('#designer-products h4')).toHaveText(title);
  }
  await page.getByRole('button',{name:'Needs attention',exact:true}).click();
  await expect(page.locator('#designer-attention')).toBeFocused();
  await expect(page.locator('#modal-close')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.route('**/api/my/orders',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.locator('#designer-attention-refresh').click();
  await expect(page.locator('#designer-attention-status')).toContainText('Orders could not be checked');
  await expect(page.locator('.designer-attention-count')).toHaveCount(0);
 });
}

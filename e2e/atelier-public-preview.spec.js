const {test,expect}=require('@playwright/test');
for(const width of [320,1280])test(`approved Atelier Emine preview is searchable and display-only at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const checkoutWrites=[];
  page.on('request',req=>{if(req.method()==='POST'&&/\/api\/checkout/.test(req.url()))checkoutWrites.push(req.url());});
  await page.goto('/atelier-emine');
  await expect(page.getByRole('heading',{name:'Atelier Emine',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('88 pieces');
  await expect(page.getByRole('article')).toHaveCount(88);
  await expect(page.getByRole('button',{name:/add to (cart|suitcase)|buy now/i})).toHaveCount(0);
  await expect(page.locator('a[href*="/checkout"],a[href*="/shop/"]')).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search the collection',exact:true}).fill('ATELIEREMINE753');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Search the collection',exact:true}).fill('Lustre Pearl');
  const card=page.getByRole('article');await expect(card).toHaveCount(1);
  await expect(card).toContainText('$202.59 USD');
  await card.getByText('Details & photos',{exact:true}).click();
  await expect(card).toContainText('ATELIEREMINE763');
  await expect(card.getByRole('link',{name:/Open Lustre Pearl photo/})).toHaveCount(6);
  expect(checkoutWrites).toHaveLength(0);
  for(const theme of ['dark','light']){
    const button=page.getByRole('button',{name:theme==='dark'?'Use dark theme':'Use light theme',exact:true});
    if(await button.count())await button.click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});

test('empty shopping galleries show the approved bags',async({page})=>{
  await page.route('**/api/gallery**',route=>route.fulfill({json:{items:[]}}));
  await page.goto('/#shop');
  await expect(page.locator('#product-grid .house-preview-piece')).toHaveCount(3);
  await expect(page.getByText('The House is getting dressed',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'View all 88 bags →',exact:true})).toBeVisible();
  await page.goto('/shop');
  await expect(page.getByRole('article')).toHaveCount(88);
  await expect(page.getByRole('button',{name:/add to (cart|suitcase)|buy now/i})).toHaveCount(0);
});

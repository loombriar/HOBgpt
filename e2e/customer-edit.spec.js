const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`customer edit keeps shopping ahead of community sections at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    await expect(page.getByRole('button',{name:'View Moonlit E2E Piece details',exact:true})).toBeVisible();
    expect(await page.locator('#shop').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#creative-house-feature')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    const height=await page.locator('.shop-drop-window').first().evaluate(element=>element.getBoundingClientRect().height);
    // Allow the label plus the full 44px native touch target and spacing.
    expect(height).toBeLessThanOrEqual(120);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.locator('#shop-search-input').fill('no matching garment xyz');
    await expect(page.locator('#shop-status')).toContainText('0 pieces');
    await page.locator('#shop-clear-filters').click();
    await expect(page.getByRole('button',{name:'View Moonlit E2E Piece details',exact:true})).toBeVisible();
  });
  test(`collection search, sorting and reset work at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('**/api/gallery',route=>route.fulfill({json:{items:[
      {id:'a',title:'Silk dress',designerName:'Maker A',price:200,status:'published',size:'Large'},
      {id:'b',title:'Linen top',designerName:'Maker B',price:50,status:'published',size:'Small'},
      {id:'c',title:'Velvet skirt',designerName:'Maker A',price:100,status:'published'}
    ]}}));
    await page.goto('/shop');
    await expect(page.locator('.house-product-card')).toHaveCount(3);
    await page.getByLabel('Sort by',{exact:true}).selectOption('price-low');
    await expect(page.locator('.house-product-card h2')).toHaveText(['Linen top','Velvet skirt','Silk dress']);
    await page.getByRole('textbox',{name:'Search pieces',exact:true}).fill('Silk');
    await expect(page.locator('.house-product-card')).toHaveCount(1);
    await expect(page.locator('.house-product-card')).toContainText('Large');
    await page.getByRole('button',{name:'Clear search & filters',exact:true}).click();
    await expect(page.locator('.house-product-card')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}

for (const width of [320, 390, 1280]) {
  test(`listing cards keep prices, sizes and sold labels readable at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.route('**/api/gallery', route => route.fulfill({json:{items:[
      {id:'available',title:'A long independently designed linen dress',designerName:'A designer with a long brand name',price:125.50,category:'apparel',size:'Large',status:'published',availableQuantity:1,images:[{url:'/house-of-briar-192.png'}]},
      {id:'sold',title:'Archive velvet skirt',designerName:'Studio',price:90,category:'apparel',size:'Medium',status:'published',availableQuantity:0,soldQuantity:1},
      {id:'custom',title:'Made to order shirt',designerName:'Studio',price:70,category:'apparel',productionType:'Made to Order',status:'published',availableQuantity:0,soldQuantity:2}
    ]}}));
    await page.goto('/shop');
    const cards=page.locator('.house-product-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).locator('.house-card-price')).toHaveText('$125.50');
    await expect(cards.nth(0).locator('.house-card-size')).toHaveText('Large');
    await expect(cards.nth(1).locator('.house-card-stock')).toHaveText('Sold');
    await expect(cards.nth(2).locator('.house-card-stock')).toHaveCount(0);
    await expect(cards.nth(2).locator('.house-card-size')).toContainText('Made to order');
    expect(await cards.nth(0).locator('img').evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
    for(const card of await cards.all()){
      const bounds=await card.boundingBox();
      const price=await card.locator('.house-card-price').boundingBox();
      expect(price.x).toBeGreaterThanOrEqual(bounds.x);
      expect(price.x+price.width).toBeLessThanOrEqual(bounds.x+bounds.width);
      for(const button of await card.locator('button').all())expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    const colors=await cards.nth(0).locator('.house-card-price').evaluate(el=>({ink:getComputedStyle(el).color,paper:getComputedStyle(el.closest('article')).backgroundColor}));
    expect(colors.ink).not.toBe(colors.paper);
  });
}

test('homepage photos open details from the keyboard and stock labels respect made-to-order pieces', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/gallery*', route => route.fulfill({json:{items:[
    {id:'sold-card',title:'Archive dress',designerName:'Studio',price:95,size:'Large',category:'apparel',status:'published',productionType:'One of a Kind',availableQuantity:0,soldQuantity:1},
    {id:'custom-card',title:'Custom linen top',designerName:'Studio',price:80,category:'apparel',status:'published',productionType:'Made to Order',availableQuantity:0,soldQuantity:1}
  ]}}));
  await page.goto('/');
  const cards=page.locator('#product-grid .product-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('.product-stock-label')).toHaveText('Sold');
  await expect(cards.nth(1).locator('.product-stock-label')).toHaveCount(0);
  await expect(cards.nth(0).locator('.house-card-price')).toHaveText('$95.00');
  await expect(cards.nth(0).locator('.house-card-size')).toHaveText('Size Large');
  await expect(cards.nth(1).locator('.house-card-size')).toContainText('Made to order');
  await cards.nth(1).getByRole('button',{name:'View photos and details of Custom linen top',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#product-dialog')).toBeVisible();
  await expect(page.locator('#product-detail-title')).toHaveText('Custom linen top');
});

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

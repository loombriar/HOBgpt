const {test,expect}=require('@playwright/test');

for(const [label,soldQuantity] of [['Sold',1],['Currently unavailable',0]]){
  test(`exhausted gallery pieces show ${label} and cannot enter the cart`,async({page})=>{
    await page.route('**/api/gallery*',async route=>{
      const response=await route.fetch();
      const data=await response.json();
      data.items=data.items.map(item=>({...item,availableQuantity:0,soldQuantity}));
      await route.fulfill({response,json:data});
    });
    await page.goto('/');
    await expect(page.locator('#product-grid')).toContainText(label);
    await page.getByRole('button',{name:'View Moonlit E2E Piece details',exact:true}).click();
    await expect(page.locator('#product-dialog').getByRole('button',{name:label,exact:true})).toBeDisabled();
    await expect(page.locator('#product-dialog').getByRole('button',{name:'Add to Cart',exact:true})).toHaveCount(0);
  });
}

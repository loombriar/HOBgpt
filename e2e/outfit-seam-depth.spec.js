const {test,expect}=require('@playwright/test');
for(const width of [375,1280])test(`construction seams follow hem length and garment layers at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/design-projects.html#creator-room');
 await page.getByLabel('Dress or outfit template',{exact:true}).selectOption('Top & trousers');
 await page.getByRole('button',{name:'Show editable sketch',exact:true}).click();
 await expect(page.locator('#creator-preview')).toBeVisible();
 const hem=page.locator('#creator-preview [data-seam="stitched-hem"]');const maxi=await hem.evaluate(el=>el.getBBox().y);
 await page.getByLabel('Length',{exact:true}).selectOption('Mini');expect(await hem.evaluate(el=>el.getBBox().y)).toBeLessThan(maxi-50);
 await page.getByLabel('Length',{exact:true}).selectOption('Maxi');await page.getByLabel('Top style',{exact:true}).selectOption('Longline');
 await expect(page.locator('#creator-preview [data-layer-shadow]')).toHaveCount(1);
 await page.getByLabel('Dress or outfit template',{exact:true}).selectOption('Full skirt');await expect(page.locator('#creator-preview [data-seam="pocket-opening"]')).toHaveCount(0);await expect(page.locator('#creator-preview [data-layer-shadow]')).toHaveCount(0);
 expect(await page.locator('#creator-room [id]').evaluateAll(nodes=>nodes.length===new Set(nodes.map(n=>n.id)).size)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

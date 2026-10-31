const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test('garment pictures replace the default illustration at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/design-projects.html#creator-room');
 const picture=page.locator('#creator-garment-picture');
 await expect(picture).toBeVisible();await expect(page.locator('#creator-preview')).toBeHidden();
 await expect.poll(()=>picture.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 for(const name of ['A-line','Fitted','Full skirt','Jumpsuit','Top & trousers','Top & skirt']){
  await page.getByLabel('Dress or outfit template',{exact:true}).selectOption(name);
  await expect(picture).toHaveAttribute('alt',name+' garment reference');
  await expect.poll(()=>picture.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 }
 const cards=page.locator('.creator-template-art');await expect(cards).toHaveCount(6);
 await expect.poll(()=>cards.evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
 await page.getByRole('button',{name:'Show editable sketch',exact:true}).click();
 await expect(page.locator('#creator-preview')).toBeVisible();await expect(picture).toBeHidden();
 await page.getByRole('button',{name:'Show garment picture',exact:true}).click();await expect(picture).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

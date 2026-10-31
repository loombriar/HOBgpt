const {test,expect}=require('@playwright/test');
for(const width of [375,1280])test(`combined outfit controls preserve preview and brief at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/design-projects.html#creator-room');
 await expect(page.getByLabel('Top style',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Top & trousers',exact:true}).click();
 await page.getByLabel('Top style',{exact:true}).selectOption('Cropped');
 const original=await page.locator('#creator-preview').innerHTML();
 await page.getByLabel('Bottom style',{exact:true}).selectOption('Flared');
 expect(await page.locator('#creator-preview').innerHTML()).not.toBe(original);
 await page.getByLabel('Accessory',{exact:true}).selectOption('Scarf');
 await page.getByLabel('Waist detail',{exact:true}).selectOption('Contrast belt');
 await page.getByLabel('Fabric appearance',{exact:true}).selectOption('Satin');
 await page.getByRole('button',{name:'Add this template to my brief',exact:true}).click();
 for(const text of ['Top style: Cropped','Bottom style: Flared','Accessory: Scarf','Waist detail: Contrast belt','Fabric appearance: Satin'])await expect(page.locator('#project-details')).toHaveValue(new RegExp(text));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

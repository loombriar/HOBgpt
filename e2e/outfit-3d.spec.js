const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test('A-line dress is a rotatable mesh at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/design-projects.html#creator-room');
 const model=page.locator('#creator-3d-canvas');await expect(model).toBeVisible();
 await expect.poll(async()=>Number(await model.getAttribute('data-mesh-triangles'))).toBeGreaterThan(8000);
 await expect(page.locator('#creator-preview')).toBeHidden();
 const yaw=await model.getAttribute('data-yaw');await page.getByRole('button',{name:'Rotate right',exact:true}).click();
 await expect(model).not.toHaveAttribute('data-yaw',yaw);
 await model.focus();const rotated=await model.getAttribute('data-yaw');await model.press('ArrowLeft');await expect(model).not.toHaveAttribute('data-yaw',rotated);
 await page.getByLabel('Length',{exact:true}).selectOption('Mini');await expect(model).toHaveAttribute('data-length','Mini');
 await page.getByLabel('Sleeves',{exact:true}).selectOption('Sleeveless');await expect(model).toHaveAttribute('data-sleeves','Sleeveless');
 await page.getByLabel('Neckline',{exact:true}).selectOption('V-neck');await expect(model).toHaveAttribute('data-neckline','V-neck');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save 3D image',exact:true}).click();expect((await pending).suggestedFilename()).toBe('house-of-briar-3d-dress.png');
 await page.getByRole('button',{name:'Show editable sketch',exact:true}).click();await expect(model).toBeHidden();await expect(page.locator('#creator-preview')).toBeVisible();
 await page.getByRole('button',{name:'Show 3D dress',exact:true}).click();await expect(model).toBeVisible();
 for(const template of ['Fitted','Full skirt','Top & skirt','Jumpsuit','Top & trousers']){await page.getByLabel('Dress or outfit template',{exact:true}).selectOption(template);await expect(model).toBeVisible();await expect(model).toHaveAttribute('data-template',template);await expect.poll(async()=>Number(await model.getAttribute('data-mesh-triangles'))).toBeGreaterThan(1000);await expect(page.locator('#creator-preview')).toBeHidden();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

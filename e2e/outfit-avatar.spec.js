const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`uploaded avatar stays local, positions the template and exports only with consent at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});let uploads=0;page.on('request',r=>{if(r.method()==='POST'&&/design-projects/.test(r.url()))uploads++;});
 await page.goto('/design-projects.html#creator-room');
 const avatar=await require('sharp')({create:{width:90,height:160,channels:4,background:'#dd8666'}}).png().toBuffer();
 await page.getByLabel('Upload your avatar image',{exact:true}).setInputFiles({name:'my-avatar.png',mimeType:'image/png',buffer:avatar});
 await expect(page.locator('#creator-avatar-status')).toContainText('Avatar added locally');await expect(page.locator('#creator-preview image[data-avatar-reference]')).toHaveCount(1);
 await expect(page.locator('#creator-preview-description')).toContainText('your uploaded avatar');expect(uploads).toBe(0);
 await page.locator('#creator-avatar-adjustments summary').click();await page.getByLabel('Outfit size',{exact:true}).fill('80');await page.getByLabel('Move outfit left or right',{exact:true}).fill('12');
 await expect(page.locator('#creator-preview > g').first()).toHaveAttribute('transform',/translate\(12 0\).*scale\(0.8\)/);
 await page.getByRole('button',{name:'Add this template to my brief',exact:true}).click();await expect(page.locator('#project-details')).toHaveValue(/Avatar: user-provided visual reference/);
 expect(await page.evaluate(()=>window.houseCreatorPreview())).toBeNull();
 await page.locator('#creator-include-preview').check();const sketch=await page.evaluate(async()=>{const blob=await window.houseCreatorPreview();return {type:blob.type,size:blob.size};});expect(sketch.type).toBe('image/png');expect(sketch.size).toBeGreaterThan(1000);expect(uploads).toBe(0);
 await page.getByLabel('Outfit opacity',{exact:true}).fill('60');await expect(page.locator('#creator-include-preview')).toBeDisabled();await expect(page.locator('#creator-include-preview')).not.toBeChecked();
 await page.getByRole('button',{name:'Remove avatar',exact:true}).click();await expect(page.locator('#creator-preview image')).toHaveCount(0);await expect(page.locator('#creator-avatar-adjustments')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('bad avatar files leave the outfit builder usable',async({page})=>{
 await page.goto('/design-projects.html');await page.getByLabel('Upload your avatar image',{exact:true}).setInputFiles({name:'avatar.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.locator('#creator-avatar-status')).toContainText('PNG, JPG or WebP');await expect(page.locator('#creator-preview image')).toHaveCount(0);
 await page.getByLabel('Upload your avatar image',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await expect(page.locator('#creator-avatar-status')).toContainText('could not be opened');await page.getByLabel('Dress or outfit template',{exact:true}).selectOption('Fitted');await expect(page.locator('#creator-preview-description')).toContainText('Fitted template');
});
test('an avatar outfit is uploaded only through the explicit sketch consent',async({page})=>{
 let uploads=0;await page.route('**/api/my/design-projects',async r=>{await r.fulfill({status:r.request().method()==='POST'?201:200,json:r.request().method()==='POST'?{project:{id:'avatar-project'}}:{projects:[],offers:[]}});});await page.route('**/api/my/design-projects/avatar-project/images',async r=>{uploads++;const body=r.request().postDataBuffer().toString();expect(body).toContain('creator-room-sketch.png');expect(body).toContain('name="consent"');await r.fulfill({status:201,json:{}});});
 await page.goto('/design-projects.html');const image=await require('sharp')({create:{width:100,height:180,channels:4,background:'#bd7890'}}).png().toBuffer();await page.getByLabel('Upload your avatar image',{exact:true}).setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:image});await expect(page.locator('#creator-avatar-status')).toContainText('Avatar added locally');expect(uploads).toBe(0);
 await page.getByRole('button',{name:'Add this template to my brief',exact:true}).click();await page.getByLabel('Name shown to makers',{exact:true}).fill('Outfit creator');await page.locator('#creator-include-preview').check();await page.getByRole('button',{name:'Create private project',exact:true}).click();await expect(page.locator('#design-project-form [role=status]')).toContainText('Template sketch saved');expect(uploads).toBe(1);
});

const {test,expect}=require('@playwright/test');
test('Back Stage updates a template and preserves personal brief notes',async({page})=>{
 await page.setViewportSize({width:390,height:844});expect((await page.request.get('/creator-room.js')).status()).toBe(200);await page.goto('/design-projects.html#creator-room');
 await expect(page.getByRole('heading',{name:'Back Stage',exact:true})).toBeVisible();
 await page.getByLabel('Dress or outfit template',{exact:true}).selectOption('Top & skirt');await page.getByLabel('Neckline',{exact:true}).selectOption('Square');await page.getByLabel('Sleeves',{exact:true}).selectOption('Long');await page.getByLabel('Length',{exact:true}).selectOption('Midi');
 await expect(page.locator('#creator-preview-description')).toContainText('Top & skirt template, Square, long sleeves, midi length');
 await page.locator('#project-details').fill('I would like a comfortable outfit with pockets.');await page.getByLabel('Fabric name and notes',{exact:true}).fill('Floral cotton');await page.getByLabel('Fabric product link',{exact:true}).fill('https://fabric.example/product/floral');
 await page.getByRole('button',{name:'Add this template to my brief'}).click();await expect(page.locator('#project-details')).toHaveValue(/I would like a comfortable outfit with pockets/);await expect(page.locator('#project-details')).toHaveValue(/https:\/\/fabric\.example\/product\/floral/);
 await page.getByRole('button',{name:'Add this template to my brief'}).click();expect((await page.locator('#project-details').inputValue()).match(/\[Back Stage template\]/g)).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Back Stage saves a private written brief without uploading an unconsented sketch',async({page})=>{
 let payload,uploads=0;await page.route('**/api/my/design-projects',async route=>{if(route.request().method()==='POST'){payload=route.request().postDataJSON();await route.fulfill({status:201,json:{project:{id:'fixture'}}});}else await route.fulfill({json:{projects:[],offers:[]}});});
 await page.route('**/api/my/design-projects/*/images',async route=>{uploads++;await route.fulfill({status:201,json:{}});});await page.goto('/design-projects.html');
 await page.getByRole('button',{name:'Add this template to my brief'}).click();await page.getByLabel('Name shown to makers',{exact:true}).fill('Test creator');await page.getByRole('button',{name:'Create private project',exact:true}).click();
 await expect(page.locator('#design-project-form [role=status]')).toContainText('Private project created');expect(payload.details).toContain('Template design: A-line');expect(payload.visibility).toBeUndefined();expect(uploads).toBe(0);
});
test('Back Stage rejects unsafe fabric links and invalidates stale previews',async({page})=>{
 await page.goto('/design-projects.html');await page.getByLabel('Fabric product link',{exact:true}).fill('javascript:alert(1)');await page.getByRole('button',{name:'Add this template to my brief'}).click();await expect(page.locator('#creator-status')).toContainText('secure https://');
 await page.getByLabel('Fabric product link',{exact:true}).fill('');await page.getByRole('button',{name:'Add this template to my brief'}).click();await page.locator('#creator-include-preview').check();await page.getByLabel('Length',{exact:true}).selectOption('Mini');await expect(page.locator('#creator-include-preview')).not.toBeChecked();await expect(page.locator('#creator-include-preview')).toBeDisabled();
});

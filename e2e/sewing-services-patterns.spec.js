const {test,expect}=require('@playwright/test');
test('sewing directory filters service and opens a private request for that provider',async({page})=>{
 await page.route('**/api/sewing-services',route=>route.fulfill({json:{profiles:[{id:'sewing-provider',displayName:'Sewing Studio',location:'Columbus, Ohio',bio:'Repairs and sample making.',services:['repairs'],modes:['mail-in'],leadTime:'2 weeks'}]}}));
 await page.route('**/api/sewing-services/sewing-provider/requests',route=>route.fulfill({status:201,json:{message:'Request sent privately.'}}));
 await page.goto('/sewing-services.html');await expect(page.getByRole('heading',{name:'Sewing Studio',exact:true})).toBeVisible();
 await page.locator('#service-filter').selectOption('sample-making');await expect(page.getByRole('heading',{name:'Sewing Studio',exact:true})).toBeHidden();
 await page.locator('#service-filter').selectOption('repairs');await page.getByRole('button',{name:'Request sewing help',exact:true}).click();
 const form=page.locator('#service-request-form');await form.getByLabel('Project title',{exact:true}).fill('Repair my coat');await form.getByLabel('What needs doing?',{exact:true}).fill('Please repair the torn lining and damaged seam on my coat.');await form.getByRole('button',{name:'Send private request',exact:true}).click();await expect(form.getByRole('status')).toHaveText('Request sent privately.');
});
test('pattern studio explains mailed paper patterns without a PDF uploader',async({page})=>{
 await page.goto('/pattern-studio.html');await expect(page.getByRole('heading',{name:'Your pattern studio'})).toBeVisible();await expect(page.locator('main')).toContainText('Mail purchased paper patterns with tracking.');await expect(page.locator('#pattern-upload-form')).toHaveCount(0);
});

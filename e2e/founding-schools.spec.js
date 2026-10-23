const {test,expect}=require('@playwright/test');
test('school application submits on mobile with permanent-rate copy and private review',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/founding-schools');
 await expect(page.getByRole('heading',{name:'Permanent 5% school commission'})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Primary navigation'})).toBeVisible();
 await page.getByLabel('Full name',{exact:true}).fill('School Test Maker');
 await page.getByLabel('Email',{exact:true}).fill(`school-${Date.now()}@example.test`);
 await page.getByLabel('School name',{exact:true}).fill('Test Fashion School');
 await page.getByRole('button',{name:'Submit application',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Application received'})).toBeVisible();
 await expect(page.getByText('Your application is pending review.',{exact:false})).toBeVisible();
 const privateList=await page.request.get('/api/founding-schools/admin/applications');expect(privateList.status()).toBe(401);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

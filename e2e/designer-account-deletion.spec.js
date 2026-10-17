const {test,expect}=require('@playwright/test');

test('mobile empty designer deletion requires confirmation and ends the session',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});
 const email=`delete-mobile-${Date.now()}@example.test`;
 await page.goto('/designers/room#designer-signup');
 const signup=page.locator('#designer-signup-form');
 await signup.getByLabel('Your name',{exact:true}).fill('Deletion test');
 await signup.getByLabel('Designer or brand name',{exact:true}).fill('Deletion Atelier');
 await signup.getByLabel('Email',{exact:true}).fill(email);
 await signup.getByLabel('What do you create?',{exact:true}).fill('Clothing');
 await signup.locator('input[type=checkbox]').check();
 await signup.locator('button[type=submit]').click();
 await expect(page.locator('#designer-signin-code')).toBeVisible();
 const {code}=await(await request.get('/__test/designer-code?email='+encodeURIComponent(email))).json();
 await page.locator('#designer-signin-code').fill(code);
 await page.locator('#designer-code-form button[type=submit]').click();
 await expect(page.locator('#designer-workspace')).toBeVisible();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.locator('#designer-delete-confirmation').fill('DELETE');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Delete designer account permanently',exact:true}).click();
 await expect(page).toHaveURL('/');
 expect((await page.request.get('/api/my/designer-profile')).status()).toBe(401);
 await page.goto('/designers/room');
 await expect(page.locator('#designer-signup-form')).toBeVisible();
 await expect(page.locator('#designer-workspace')).not.toBeVisible();
});

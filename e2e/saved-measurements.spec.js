const {test,expect}=require('@playwright/test');

test('homepage profiles persist in the account, appear on the account page, and disappear from filters after deletion',async({page,request})=>{
  const email='measurement-ui@example.test';
  await page.goto('/?visitors=signup');
  await page.locator('#customer-signup-email').fill(email);
  await page.locator('#customer-rules-consent').check();
  await page.getByRole('button',{name:'Email me a sign-in code',exact:true}).click();
  await expect(page.locator('#customer-code-form')).toBeVisible();
  const code=await request.get('/__test/customer-code?email='+encodeURIComponent(email));
  await page.locator('#customer-signin-code').fill((await code.json()).code);
  await page.getByRole('button',{name:'Verify and sign in',exact:true}).click();
  await expect(page.locator('#customer-signed-in')).toBeVisible();
  await page.locator('#measurement-profile-name').fill('Account fit');
  await page.locator('#measurement-profile-bust').fill('35');
  await page.locator('#measurement-profile-inseam').fill('30.5');
  await page.getByRole('button',{name:'Save measurement profile',exact:true}).click();
  await expect(page.locator('#measurement-profile-message')).toHaveText('Measurement profile saved securely in your account.');
  const profiles=(await (await request.get('/api/customer/measurements')).json()).profiles;
  expect(profiles).toEqual([expect.objectContaining({label:'Account fit',bust:'35',inseam:'30.5'})]);
  expect(await page.evaluate(()=>localStorage.getItem('house-of-briar:measurement-profiles'))).toBeNull();
  await page.reload();
  await page.locator('#header-customer-auth-btn').click();
  await expect(page.locator('#measurement-profile-list')).toContainText('Account fit');
  await page.goto('/account');
  await expect(page.getByRole('heading',{name:'Saved measurements',exact:true})).toBeVisible();
  await expect(page.getByText('Account fit',{exact:true})).toBeVisible();
  await page.goto('/?visitors=signup');
  await expect(page.locator('#measurement-profile-list')).toContainText('Account fit');
  await expect(page.locator('#shop-fit-profile option')).toHaveCount(2);
  await page.locator('#measurement-profile-list').getByRole('button',{name:'Delete',exact:true}).click();
  await expect(page.locator('#measurement-profile-list')).not.toContainText('Account fit');
  await expect(page.locator('#shop-fit-profile option')).toHaveCount(1);
  expect((await (await request.get('/api/customer/measurements')).json()).profiles).toEqual([]);
});

test('signed-out saves do not write new measurements to browser storage',async({page})=>{
  await page.goto('/?visitors=signup');
  await page.locator('#measurement-profile-name').fill('Do not save');
  await page.getByRole('button',{name:'Save measurement profile',exact:true}).click();
  await expect(page.locator('#measurement-profile-message')).toContainText('Sign in to save measurements securely');
  expect(await page.evaluate(()=>localStorage.getItem('house-of-briar:measurement-profiles'))).toBeNull();
});

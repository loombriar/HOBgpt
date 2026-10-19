const {test,expect}=require('@playwright/test');

test('guest support offers email help and closes the bubble when continuing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/account#house-support');
  const support=page.locator('#house-support');
  await expect(support.getByRole('link',{name:'Email House support'})).toHaveAttribute('href','mailto:thee.house.of.briar@gmail.com');
  await expect(support).toContainText('including for a guest order');
  await page.getByRole('button',{name:'Need help?',exact:true}).click();
  const chat=page.getByRole('dialog',{name:'House of Briar AI support'});
  await chat.getByLabel('Your question').fill('How do I get help with my guest order?');
  await chat.getByRole('button',{name:'Continue to AI support'}).click();
  await expect(page).toHaveURL(/account#house-support-agent$/);
  await expect(chat).not.toBeVisible();
  await expect(page.getByRole('link',{name:'Email House support'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Sign in or create customer account'})).toBeVisible();
  await expect(support).toContainText('AI support requires a signed-in House account');
});

test('AI support uses the signed-in cookie without a synthetic bearer credential',async({page})=>{
  const session=await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
  expect(session.ok()).toBeTruthy();
  let calls=0;
  await page.route('**/api/my/support-agent',async route=>{
    calls++;
    const request=route.request();
    const headers=await request.allHeaders();
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toContain('hob_designer_session=');
    expect(request.postDataJSON()).toMatchObject({consent:true,allowEscalation:false});
    await route.fulfill({json:{answer:'Policy-only test answer.',ticketId:null,actions:[]}});
  });
  await page.goto('/account#house-support-agent');
  const support=page.locator('#house-support-agent');
  await support.getByLabel('Your question',{exact:true}).fill('Is US delivery free for shoppers?');
  await expect(support.getByRole('button',{name:'Ask House support',exact:true})).toBeDisabled();
  expect(calls).toBe(0);
  await support.getByRole('checkbox',{name:'Send my question and relevant order summary to OpenAI for support.',exact:true}).check();
  await support.getByRole('button',{name:'Ask House support',exact:true}).click();
  await expect(support.getByRole('status')).toContainText('Policy-only test answer.');
  expect(calls).toBe(1);
});

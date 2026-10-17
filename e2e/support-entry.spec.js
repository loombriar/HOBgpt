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

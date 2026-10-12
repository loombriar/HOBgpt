const {test,expect,devices}=require('@playwright/test');
test.use({...devices['Pixel 7'],browserName:'chromium'});
const cart=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('house-of-briar:cart')||'[]'));

test('Android taps remove populated and unavailable pieces from both carts and survive reload',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'View Moonlit E2E Piece details',exact:true}).tap();
  await page.locator('#product-dialog').getByRole('button',{name:'Add to Cart',exact:true}).tap();
  await page.locator('#cart-btn').tap();
  const remove=page.locator('#cart-dialog').getByRole('button',{name:'Remove from Cart',exact:true});
  const bounds=await remove.boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(48);
  await remove.tap();
  await expect(page.locator('#cart-items')).toContainText('Your Cart is empty.');
  await page.reload();expect(await cart(page)).toEqual([]);
  await page.evaluate(()=>localStorage.setItem('house-of-briar:cart',JSON.stringify(['e2e-piece','unavailable-piece'])));
  await page.reload();await page.locator('#cart-btn').tap();
  await page.locator('#cart-items .designer-product').filter({hasText:'outside the current collection'}).getByRole('button',{name:'Remove from Cart'}).tap();
  expect(await cart(page)).toEqual(['e2e-piece']);
  await page.goto('/cart');
  await page.getByRole('button',{name:'Remove Moonlit E2E Piece from bag'}).tap();
  await page.reload();expect(await cart(page)).toEqual([]);
  await page.evaluate(()=>localStorage.setItem('house-of-briar:cart',JSON.stringify(['unavailable-piece'])));
  await page.reload();await page.getByRole('button',{name:'Remove unavailable piece 1',exact:true}).tap();
  await page.reload();expect(await cart(page)).toEqual([]);
});

test('successful account deletion clears the Android cart and gift choices',async({page,request})=>{
  const email=`android-delete-${test.info().retry}@example.test`;
  await page.goto('/?visitors=signup');
  await page.locator('#customer-signup-email').fill(email);
  await page.locator('#customer-rules-consent').check();
  await page.getByRole('button',{name:'Email me a sign-in code',exact:true}).tap();
  await expect(page.locator('#customer-code-form')).toBeVisible();
  const response=await request.get('/__test/customer-code?email='+encodeURIComponent(email));
  await page.locator('#customer-signin-code').fill((await response.json()).code);
  await page.getByRole('button',{name:'Verify and sign in',exact:true}).tap();
  await expect(page.locator('#customer-signed-in')).toBeVisible();
  await page.evaluate(()=>{localStorage.setItem('house-of-briar:cart','["e2e-piece"]');localStorage.setItem('house-of-briar:gift-wrap','["e2e-piece"]');});
  page.once('dialog',dialog=>dialog.accept('DELETE'));
  await page.locator('#customer-delete-account').tap();
  await expect(page.locator('#customer-signup-status')).toHaveText('Your customer account has been deleted.');
  expect(await cart(page)).toEqual([]);
  expect(await page.evaluate(()=>localStorage.getItem('house-of-briar:gift-wrap'))).toBeNull();
  await page.reload();await page.locator('#cart-btn').tap();
  await expect(page.locator('#cart-items')).toContainText('Your Cart is empty.');
});

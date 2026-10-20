const {test,expect}=require('@playwright/test');
for(const width of [390,1280]) {
 test(`House windows and rooms fit a ${width}px screen`,async({page})=>{
  await page.setViewportSize({width,height:850});
  await page.goto('/');
  const menus=page.locator('.shop-filter-menu');
  await expect(menus).toHaveCount(5);
  await expect(page.locator('#shop-designer-filter')).not.toBeVisible();
  for(const menu of await menus.all()) {
   await menu.locator(':scope > summary').click();
   for(const child of await menu.locator('.shop-filter-child').all()) {
    await child.locator(':scope > summary').click();
   }
   for(const select of await menu.locator('select').all()) {
    await expect(select).toBeVisible();
    const box=await select.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width);
   }
  }
  await page.locator('.shop-drop-windows').scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/hob-windows-${width}.png`});
  await page.goto('/designers/room');
  await page.getByText('Have an older access token?',{exact:true}).click();
  await page.getByLabel('Designer access token',{exact:true}).fill('e2e-designer-token');
  await page.locator('#designer-login-form button[type="submit"]').click();
  await expect(page.getByRole('navigation',{name:'Designer room sections'})).toBeVisible();
  await expect(page.locator('#designer-workspace > .designer-room-panel')).toHaveCount(6);
  await expect(page.locator('#product-form')).not.toBeVisible();
  await expect(page.locator('#designer-add-piece')).toBeVisible();
  expect(await page.locator('#designer-workspace').evaluate(el=>{
   const setup=el.querySelector('#designer-setup-panel'),add=el.querySelector('.designer-start-actions'),orders=el.querySelector('#designer-attention');
   return Boolean(setup.compareDocumentPosition(add)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(add.compareDocumentPosition(orders)&Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBeTruthy();
  await expect(page.locator('#designer-dialog-title')).toBeInViewport();
  await page.locator('#designer-add-piece').click();
  await expect(page.locator('#product-form')).toBeVisible();
  await page.getByRole('button',{name:'Create a piece',exact:true}).click();
  await expect(page.locator('#product-form')).toBeFocused();
  const checkbox=await page.locator('#product-international').boundingBox();
  expect(checkbox.width).toBeLessThanOrEqual(24);
  await expect(page.locator('#product-form fieldset').filter({has:page.getByText('Price & shipping',{exact:true})})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  // New garment drafts now begin with listing photos; the name remains editable below.
  await expect(page.locator('#product-photos')).toBeInViewport();
  await expect(page.locator('#product-name')).toBeVisible();
  for(const [id,value]of [['product-price','100'],['estimated-materials','20'],['estimated-labor-hours','2'],['estimated-hourly-pay','15'],['estimated-postage','8'],['estimated-packaging','2']])await page.locator('#'+id).fill(value);
  await expect(page.locator('#pricing-estimate')).toContainText('House of Briar fee (9%): $9.00');
  await expect(page.locator('#pricing-estimate')).toContainText('Labor (hours × hourly pay): $30.00');
  await expect(page.locator('#pricing-estimate')).toContainText('Amount left after listed costs: $31.00');
  await expect(page.locator('#product-price')).toHaveValue('100');
  await page.locator('#product-name').fill('Unsaved design');
  const panel=page.locator('.designer-room-panel').filter({has:page.locator('#product-form')});
  await panel.locator(':scope > summary').click();
  await expect(page.locator('#product-form')).not.toBeVisible();
  await panel.locator(':scope > summary').click();
  await expect(page.locator('#product-name')).toHaveValue('Unsaved design');
  await page.screenshot({path:`/tmp/hob-room-${width}.png`});
  await page.goto('/');
  await page.getByRole('button',{name:'Admin panel',exact:true}).click();
  await page.getByLabel('Administrator code').fill('e2e-admin-token');
  await page.locator('#admin-login-form button[type="submit"]').click();
  await expect(page.locator('#admin-overview > details')).toHaveCount(6);
  // Check both themes using this test's existing session; do not spend extra login attempts.
  const toolbar=page.locator('#admin-review-workspace .studio-toolbar');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-hob-theme',theme),theme);
   await toolbar.scrollIntoViewIfNeeded();
   await expect(toolbar.getByRole('heading',{name:'Pending clothing',exact:true})).toBeVisible();
   await expect.poll(async()=>toolbar.locator('h3,p,button').evaluateAll(elements=>{
    const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return Math.min(...elements.map(el=>{
     let bg=[0,0,0];for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}
     const a=lum(rgb(getComputedStyle(el).color)),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    }));
   }),{message:`Pending clothing text needs 4.5:1 contrast in ${theme} mode`}).toBeGreaterThanOrEqual(4.5);
  }

  await page.locator('#admin-overview > details').first().locator('summary').click();
  await expect(page.locator('#admin-daily-traffic')).toBeVisible();
  await page.locator('#admin-review-dialog').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.locator('#admin-review-close')).toBeInViewport();
  expect(await page.locator('#admin-review-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
  await page.screenshot({path:`/tmp/hob-admin-${width}.png`});
  await page.locator('#admin-review-close').click();
  await expect(page.locator('#admin-review-dialog')).not.toBeVisible();
 });
}
for(const width of [390,1280]) {
 test(`Marketplace studio and admin layout fit a ${width}px screen`,async({page})=>{
  await page.setViewportSize({width,height:850});
  const session=await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
  expect(session.ok()).toBeTruthy();
  await page.goto('/account');
  await expect(page.getByRole('navigation',{name:'Designer studio sections'})).toBeVisible();
  await expect(page.locator('details').filter({has:page.getByText('Your Customer account',{exact:true})})).not.toHaveAttribute('open');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/hob-marketplace-studio-${width}.png`});
  await page.goto('/admin');
  await page.getByLabel('Admin access token').fill('e2e-admin-token');
  await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Administration sections'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/hob-marketplace-admin-${width}.png`});
 });
}


test('designer and admin credentials can be revealed and hidden without changing values', async ({ page }) => {
  await page.goto('/designers/room');
  await page.getByText('Have an older access token?',{exact:true}).click();
  await page.locator('#designer-token').fill('example-designer-token');
  const designer = page.locator('#designer-token');
  const designerToggle = page.locator('#designer-login-form').getByRole('button', { name: 'Show password' });
  await expect(designer).toHaveAttribute('type', 'password');
  await designerToggle.click();
  await expect(designer).toHaveAttribute('type', 'text');
  await expect(designer).toHaveValue('example-designer-token');
  await page.locator('#designer-login-form').getByRole('button', { name: 'Hide password' }).click();
  await expect(designer).toHaveAttribute('type', 'password');
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin panel', exact: true }).click();
  const admin = page.locator('#admin-token');
  await expect(admin).toHaveAttribute('type', 'password');
  const adminForm = page.locator('#admin-login-form');
  await adminForm.getByRole('button', { name: 'Show password' }).click();
  await expect(admin).toHaveAttribute('type', 'text');
  await adminForm.getByRole('button', { name: 'Hide password' }).click();
  await expect(admin).toHaveAttribute('type', 'password');
});

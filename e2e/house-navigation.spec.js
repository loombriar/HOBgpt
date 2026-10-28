const {test,expect}=require('@playwright/test');
for(const width of [320,390,768,1280])for(const url of ['/','/shop'])test(`ordered navigation at ${width}px on ${url}`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(url);
 const legacy=url==='/';const nav=page.locator(legacy?'#hob-global-nav':'.house-compact-header');
 const shop=nav.locator('details').filter({has:page.locator('summary').filter({hasText:/^Shop the Runway/})});
 const backstage=nav.locator('details').filter({has:page.locator('summary').filter({hasText:/^Go Backstage/})});
 const logo=nav.getByRole('link',{name:'House of Briar home',exact:true});const theme=nav.getByRole('button',{name:/light (mode|theme)|dark (mode|theme)/});const search=nav.getByRole('button',{name:'Open shop search',exact:true});const mailbox=nav.getByRole(legacy?'button':'link',{name:/mailbox/i});const cart=nav.locator(legacy?'.hob-global-cart-button,.hob-global-cart-link':'a[href="/cart"]');
 const ordered=width<=900?[logo,theme,search,mailbox,cart]:[logo,theme,search,shop.locator('summary'),backstage.locator('summary'),mailbox,cart];
 const logoBox=await logo.boundingBox(),themeBox=await theme.boundingBox(),searchBox=await search.boundingBox();expect(themeBox.x-(logoBox.x+logoBox.width)).toBeLessThan(26);expect(searchBox.x-(themeBox.x+themeBox.width)).toBeLessThan(26);
 let last=-1;for(const item of ordered){await expect(item).toBeVisible();const box=await item.boundingBox();expect(box.x).toBeGreaterThan(last);last=box.x;}
 await shop.locator('summary').click();await expect(shop).toContainText('We’re still moving in.');
 for(const name of ['Create your room','Save your measurements','Create an outfit'])await expect(shop.getByRole('link',{name,exact:true})).toBeVisible();
 await backstage.locator('summary').click();await expect(shop).not.toHaveAttribute('open');
 for(const role of ['designer','model','photographer','DJ'])await expect(backstage.getByRole('link',{name:'Sign in as '+role,exact:true})).toBeVisible();
 await expect(backstage.getByRole('link',{name:/venue/i})).toHaveCount(0);
 const box=await backstage.locator('div').first().boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
 await backstage.locator('summary').press('Escape');await expect(backstage).not.toHaveAttribute('open');
 await search.click();await expect(nav.getByRole('searchbox')).toBeVisible();await nav.getByRole('searchbox').press('Escape');await expect(nav.getByRole('searchbox')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/hob-ordered-${legacy?'home':'shop'}-${width}.png`});
});
for(const role of ['model','photographer','dj','venue'])test(`${role} choice verifies email and lands on the right profile`,async({page})=>{
 await page.goto('/join.html');await page.getByRole('link',{name:{model:'Model',photographer:'Photographer',dj:'DJ',venue:'Venue'}[role],exact:true}).click();
 const modal=page.getByRole('dialog',{name:new RegExp('sign in / signup')});await expect(modal).toContainText('No designer shop is required.');
 const email=`nav-${role}@example.test`;await modal.getByLabel('Email',{exact:true}).fill(email);await modal.getByRole('checkbox',{name:/I agree to the/}).check();await modal.getByRole('button',{name:'Email me a sign-in code',exact:true}).click();
 await expect(modal.getByLabel('Six-digit email code',{exact:true})).toBeVisible();const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();await modal.getByLabel('Six-digit email code',{exact:true}).fill(code);await modal.getByRole('button',{name:'Verify and sign in',exact:true}).click();
 const event=['dj','venue'].includes(role);await expect(page).toHaveURL(new RegExp('creative-house.html\\?join='+role+(event?'#event-profile-editor':'#your-profile')+'$'));await expect(page.locator(event?'#event-profile-form select[name=role]':'#profile-form select[name=role]')).toHaveValue(role);
});
test('designer notifications deep link opens the private inbox',async({page})=>{
 await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});await page.goto('/account#designer-notifications');await expect(page.locator('#designer-notifications')).toHaveAttribute('open','');await expect(page.locator('#designer-notifications')).toBeInViewport();
});

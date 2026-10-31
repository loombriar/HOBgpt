const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`dark mode keeps creative descriptions and activity buttons readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/creative-house.html');
    // Exercise the explicit light-to-dark toggle.
    await page.evaluate(() => { localStorage.setItem('house-of-briar-theme', 'light'); document.documentElement.dataset.hobTheme = 'light'; document.documentElement.classList.remove('dark'); });
    await page.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme', 'dark');
    const contrast = () => page.locator('.creative-category-heading>p:last-child, #creative-workflow-help, .creative-workflow-options button, .creative-path small').evaluateAll(elements => {
      const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = c => c.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i], 0);
      return elements.map(element => {
        let background = [0,0,0,0];
        for (let parent = element; parent; parent = parent.parentElement) {
          const candidate = rgb(getComputedStyle(parent).backgroundColor);
          if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
        }
        const foreground = luminance(rgb(getComputedStyle(element).color));
        const surface = luminance(background);
        return { text: element.textContent.trim(), ratio: (Math.max(foreground,surface) + .05) / (Math.min(foreground,surface) + .05) };
      });
    });
    await expect.poll(async () => Math.min(...(await contrast()).map(result => result.ratio)), { message: 'Text must reach 4.5:1 contrast after the theme transition' }).toBeGreaterThanOrEqual(4.5);
  });
}

for (const theme of ['light','dark']) {
  test(`newsletter text stays readable in ${theme} mode`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.addInitScript(theme=>localStorage.setItem('hob-theme',theme),theme);
    await page.goto('/');
    await page.evaluate(theme=>document.documentElement.setAttribute('data-hob-theme',theme),theme);
    const contrast=()=>page.locator('#journal .newsletter-heading h2,#journal .newsletter-heading>p,#newsletter-consent').evaluateAll(elements=>{
      const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
      const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return elements.map(node=>{const el=node.id==='newsletter-consent'?node.parentElement:node;let bg=[0,0,0];for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
    });
    await expect.poll(async()=>Math.min(...await contrast())).toBeGreaterThanOrEqual(4.5);
  });
}

async function expectReadable(locator) {
  try { await expect.poll(async()=>locator.evaluateAll(elements=>{
    const rgb=v=>(v.match(/[\d.]+/g)||[]).map(Number);
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const ratios=elements.filter(e=>e.getClientRects().length).map(e=>{
      let bg=[0,0,0];for(let p=e;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}
      const a=lum(rgb(getComputedStyle(e).color)),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    return ratios.length?Math.min(...ratios):0;
  }),{message:'Visible room text and button labels need 4.5:1 contrast'}).toBeGreaterThanOrEqual(4.5);
  } catch(error) {
    console.log('Room contrast diagnostics:',await locator.evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>({id:e.id,className:e.className,text:e.textContent.trim().slice(0,80),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,parentBackground:e.parentElement?getComputedStyle(e.parentElement).backgroundColor:null}))));
    throw error;
  }
}
for(const width of [390,1280]) {
  test(`dark customer, product and cart headers and controls are readable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    // Exercise the explicit light-to-dark toggle.
    await page.evaluate(() => { localStorage.setItem('house-of-briar-theme', 'light'); document.documentElement.dataset.hobTheme = 'light'; document.documentElement.classList.remove('dark'); });
    await page.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme','dark');
    await expectReadable(page.locator('.sewing-hero-actions .primary-button,.hob-customer-access button'));
    await page.locator('.hob-shop-menu > summary').click();await page.locator('#hob-global-nav .hob-global-join').click();await page.getByRole('link',{name:'Customer sign in / join',exact:true}).click();
    await expectReadable(page.locator('#visitor-suite-modal .dialog-header h2,#visitor-suite-modal .dialog-header p,#visitor-suite-close,#customer-signup-form label,#customer-signup-form .primary-button,#customer-signup-email'));
    await page.locator('#visitor-suite-close').click();
    await page.getByRole('button',{name:'View Moonlit E2E Piece details',exact:true}).click();
    await expectReadable(page.locator('#product-dialog .dialog-header h2,#product-dialog-close,#product-dialog .primary-button,#product-dialog .secondary-button,#product-dialog .text-button,#product-dialog .product-seller-name,#product-dialog .support-link-button,#product-dialog a'));
    await page.locator('#product-dialog').getByRole('button',{name:'Add to Cart',exact:true}).click();
    await page.locator('#cart-btn').click();
    await expectReadable(page.locator('#cart-dialog .dialog-header h2,#cart-dialog-close,#cart-dialog .primary-button,#cart-dialog .text-button,#cart-dialog .notice,#cart-dialog .cart-badge-reward p,#cart-dialog .cart-badge-reward strong,#cart-dialog .suitcase-info-links a'));
  });
}

for (const width of [393,1280]) {
  test(`dark homepage editorial cards, story and shopping text are readable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:851});
    await page.goto('/');
    const stylesheet = await page.locator('link[href^="/customer-edit.css"]').getAttribute('href');
    const asset = await page.request.get(stylesheet);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toContain('text/css');
    // Exercise the explicit light-to-dark toggle.
    await page.evaluate(() => { localStorage.setItem('house-of-briar-theme', 'light'); document.documentElement.dataset.hobTheme = 'light'; document.documentElement.classList.remove('dark'); });
    await page.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme','dark');
    const text=page.locator('.fashion-cover-footnote,.briar-invite p,.briar-invite strong,.menswear-window-title,.menswear-window-subtitle,.feature-bar span,.feature-bar strong,.founder-announcement p,.founder-announcement a,.story-grid h2,.story-grid p,.story-grid a,.hob-door-content strong,.hob-door-content span,.hob-door-number,.product-card .badge,.product-card .card-description,.product-card .favorite-button,.house-styling button,.atelier-spotlight button');
    expect(await text.count()).toBeGreaterThan(15);
    await expectReadable(text);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme','dark');
    await expectReadable(text);
  });
}

const {test,expect}=require('@playwright/test');
async function readable(locator){return locator.evaluateAll(elements=>{const rgb=v=>(v.match(/[\d.]+/g)||[]).map(Number),lum=c=>c.slice(0,3).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return elements.filter(el=>el.getClientRects().length).map(el=>{let bg=[255,255,255];for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}const a=lum(rgb(getComputedStyle(el).color)),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});});}
for(const width of [390,1280])for(const theme of ['light','dark'])test(`footer navigation stays readable at ${width}px in ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.addInitScript(t=>localStorage.setItem('house-of-briar-theme',t),theme);
 for(const route of ['/','/shop']){
  await page.goto(route);const row=page.locator('.house-footer-link-row');await expect(row).toBeVisible();
  const ratios=await readable(row.locator('a,button,summary,p,span'));expect(ratios.length).toBeGreaterThan(2);expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  const policies=row.getByText('Help & policies',{exact:true});await policies.click();const panel=row.locator('details[open] .house-footer-link-panel');await expect(panel).toBeVisible();expect(Math.min(...await readable(panel.locator('a,p,li')))).toBeGreaterThanOrEqual(4.5);
  await policies.click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
for(const width of [390,1280])test(`cloth illustrations render all silhouettes and preserve export at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:750});await page.goto('/design-projects.html#creator-room');
 for(const name of ['A-line','Fitted','Full skirt','Jumpsuit','Top & trousers','Top & skirt']){
  await page.getByLabel('Dress or outfit template',{exact:true}).selectOption(name);await expect(page.locator('#creator-preview [data-cloth-volumes] path')).not.toHaveCount(0);await expect(page.locator('#creator-preview [data-garment-shadow]')).toHaveCount(1);await expect(page.locator('#creator-preview-description')).toContainText(name);
 }
 await page.getByLabel('Print',{exact:true}).selectOption('Polka dots');await expect(page.locator('#creator-top-print')).toHaveCount(1);
 const download=page.waitForEvent('download');await page.locator('#creator-download').click();const file=await download,metadata=await require('sharp')(await file.path()).metadata();expect(metadata.width).toBe(600);expect(metadata.height).toBe(860);
 await expect(page.locator('.creator-builder figure')).toHaveCSS('position','static');expect(await page.locator('#creator-preview').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(360);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

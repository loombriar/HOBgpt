const {test,expect}=require('@playwright/test');
const path=require('node:path');

for(const react of [false,true])for(const width of [320,1280]){
 test(`Atelier Emine introduction stays readable and informational in ${react?'React':'legacy'} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  if(react)await page.route('http://127.0.0.1:4173/',route=>route.fulfill({path:path.join(__dirname,'../apps/default/dist/index.html'),contentType:'text/html'}));
  await page.goto('/');
  const feature=page.locator('#atelier-emine');
  await expect(feature.getByRole('heading',{name:'Meet Atelier Emine',exact:true})).toBeVisible();
  await expect(feature).toContainText('65-year family craft heritage');
  await expect(feature).toContainText('Collection preview · Purchasing coming soon');
  await expect(feature.getByRole('link',{name:'Preview the collection →',exact:true})).toHaveAttribute('href','/atelier-emine');
  await expect(feature).toContainText('Pieces are not available to purchase yet.');
  const image=feature.getByRole('img',{name:'Atelier Emine',exact:true});
  await feature.scrollIntoViewIfNeeded();
  await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth===1024)).toBe(true);
  await expect(feature.getByRole('link',{name:/Visit Atelier Emine/})).toHaveAttribute('href','https://www.atelieremine.com');
  await expect(feature.getByRole('link',{name:/Instagram/})).toHaveAttribute('href','https://www.instagram.com/ateliereminedesign');
  await expect(feature.getByRole('button')).toHaveCount(0);
  await expect(feature.locator('a[href*="checkout"],a[href*="/shop/"]')).toHaveCount(0);
  for(const theme of ['dark','light']){
   const toggle=react
    ? page.getByRole('button',{name:theme==='dark'?'Use dark theme':'Use light theme',exact:true})
    : page.locator('#hob-theme-toggle');
   if(await page.locator('html').getAttribute('data-hob-theme')!==theme)await toggle.click();
   await feature.scrollIntoViewIfNeeded();
   await expect(page.locator('html')).toHaveAttribute('data-hob-theme',theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const contrast=await feature.evaluate(el=>{
    const lum=rgb=>(rgb.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const s=getComputedStyle(el),a=lum(s.color),b=lum(s.backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   });
   expect(contrast).toBeGreaterThanOrEqual(4.5);
   await feature.screenshot({path:`/tmp/atelier-emine-${react?'react':'legacy'}-${width}-${theme}.png`});
  }
 });
}

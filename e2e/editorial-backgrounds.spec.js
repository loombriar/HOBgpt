const {test,expect}=require('@playwright/test');
for(const width of [390,1280])for(const theme of ['light','dark'])test(`editorial surfaces stay solid and readable in ${theme} at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.addInitScript(t=>{localStorage.setItem('house-of-briar-theme',t);localStorage.setItem('theme',t);},theme);
 const paper=theme==='dark'?'rgb(28, 23, 36)':'rgb(248, 243, 250)';
 for(const path of ['/','/creative-house.html','/sewing-services.html','/design-projects.html','/join.html']){
  await page.goto(path);await expect(page.locator('html')).toHaveAttribute('data-hob-theme',theme);
  const surface=await page.locator('body').evaluate(el=>({color:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}));expect(surface.color).toBe(paper);expect(surface.image).toBe('none');
  if(path==='/'){
   const hero=page.locator('.briar-text-hero');await expect(hero).toBeVisible();expect(await hero.evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
   const contrast=await hero.locator('h1').evaluate(el=>{const lum=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el.closest('.briar-text-hero')).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
   await page.screenshot({path:`/tmp/hob-editorial-${theme}-${width}.png`});
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.goto('/shop');await expect(page.locator('.fashion-app')).toBeVisible();expect(await page.locator('.fashion-app').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
});

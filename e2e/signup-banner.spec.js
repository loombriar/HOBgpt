const {test,expect}=require('@playwright/test');
for(const width of [320,1280])for(const url of ['/','/shop'])test(`signup announcement shows the House date at ${width}px on ${url}`,async({page})=>{
 await page.clock.install({time:new Date('2026-10-29T03:59:30Z')});await page.setViewportSize({width,height:900});await page.goto(url);
 const banner=page.getByRole('region',{name:'House signup announcement',exact:true});await expect(banner).toContainText('We’re in our signup era.');await expect(banner.locator('time')).toHaveText('October 28, 2026');await expect(banner.locator('time')).toHaveAttribute('datetime','2026-10-28');await page.clock.runFor(60000);await expect(banner.locator('time')).toHaveText('October 29, 2026');
 const logo=page.getByRole('link',{name:'House of Briar home',exact:true});const bb=await banner.boundingBox(),lb=await logo.boundingBox();expect(bb.y+bb.height).toBeLessThanOrEqual(lb.y+2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/hob-signup-${url==='/'?'home':'shop'}-${width}.png`});
});

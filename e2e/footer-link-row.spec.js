const {test,expect}=require('@playwright/test');
for(const width of [390,1280])for(const path of ['/','/shop'])test(`footer link row is above payments at ${width} on ${path}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(path);const row=page.locator('.house-footer-link-row');await row.scrollIntoViewIfNeeded();await expect(row).toContainText('House of Briar');await expect(row).toContainText('Explore');await expect(row).toContainText('Help & policies');await expect(row).toContainText('Our Story');await expect(row).toContainText('Back to top');
 const bar=page.locator('.house-footer-bar'),rb=await row.boundingBox(),bb=await bar.boundingBox();expect(rb.y+rb.height).toBeLessThanOrEqual(bb.y+2);
 if(width===1280){const boxes=await row.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return b.y+b.height/2}));expect(Math.max(...boxes)-Math.min(...boxes)).toBeLessThan(8);}
 await row.locator('summary').filter({hasText:'Help & policies'}).click();await expect(row.getByRole('link',{name:'Rules & Returns',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/hob-footer-row-${path==='/'?'home':'shop'}-${width}.png`});
});

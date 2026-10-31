const {test,expect}=require('@playwright/test');
for(const width of [375,1280])test(`tailored shapes share shading, preserve trouser gap and change top cut at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/design-projects.html#creator-room');
 const cards=page.locator('.creator-template-card');await expect(cards).toHaveCount(6);
 for(const card of await cards.all()){
  const picture=card.locator('img.creator-template-art');await expect(picture).toHaveCount(1);
  await expect.poll(()=>picture.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 }
 expect(await page.locator('#creator-room [id]').evaluateAll(nodes=>{const ids=nodes.map(n=>n.id);return ids.length===new Set(ids).size})).toBe(true);
 await page.getByRole('button',{name:'Top & trousers',exact:true}).click();
 const bottom=page.locator('#creator-preview [data-garment-bottom]');
 expect(await bottom.evaluate(path=>{const svg=path.ownerSVGElement,p=svg.createSVGPoint();p.x=150;p.y=320;return path.isPointInFill(p)})).toBe(false);
 const top=page.locator('#creator-preview [data-garment-top]'),classic=await top.getAttribute('d');
 await page.getByLabel('Top style',{exact:true}).selectOption('Cropped');const cropped=await top.getAttribute('d');expect(cropped).not.toBe(classic);
 await page.getByLabel('Top style',{exact:true}).selectOption('Longline');expect(await top.getAttribute('d')).not.toBe(cropped);
 await page.getByLabel('Top / main color',{exact:true}).fill('#87355d');await expect(top).toHaveAttribute('fill','#87355d');
 await page.getByLabel('Bottom style',{exact:true}).selectOption('Flared');
 expect(await bottom.evaluate(path=>{const p=path.ownerSVGElement.createSVGPoint();p.x=150;p.y=320;return path.isPointInFill(p)})).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

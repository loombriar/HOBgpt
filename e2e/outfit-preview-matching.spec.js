const {test,expect}=require('@playwright/test');
for(const look of ['everyday','evening','separates'])test(`homepage ${look} image matches the starter sketch`,async({page})=>{
 await page.goto('/design-projects.html?look='+look+'#creator-room');
 await expect(page.locator('.creator-template-card')).toHaveCount(6);
 const response=await page.request.get('/outfit-options/starter-'+look+'.svg');
 expect(response.ok()).toBe(true);
 const markup=await response.text();
 expect(await page.evaluate(source=>{
  const asset=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
  return asset.innerHTML===document.getElementById('creator-preview').innerHTML;
 },markup)).toBe(true);
});
test('silhouette cards follow selected details and match the main sketch',async({page})=>{
 await page.goto('/design-projects.html#creator-room');
 await page.getByLabel('Dress or outfit template',{exact:true}).selectOption('Top & skirt');
 await page.getByLabel('Neckline',{exact:true}).selectOption('Square');
 await page.getByLabel('Sleeves',{exact:true}).selectOption('Long');
 await page.getByLabel('Length',{exact:true}).selectOption('Mini');
 await page.getByLabel('Print',{exact:true}).selectOption('Polka dots');
 await page.locator('#creator-color').evaluate(input=>{input.value='#87355d';input.dispatchEvent(new Event('input',{bubbles:true}));});
 const image=page.locator('[data-creator-template="Top & skirt"] img');
 await expect(image).toHaveAttribute('src',/^data:image\/svg\+xml/);
 expect(await image.evaluate(img=>{
  const source=decodeURIComponent(img.getAttribute('src').split(',')[1]);
  const thumbnail=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
  return thumbnail.innerHTML===document.getElementById('creator-preview').innerHTML;
 })).toBe(true);
 await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
});

const {test,expect}=require('@playwright/test');

async function expectMatchingDrawing(page,source){
 const drawing=await page.evaluate(source=>{
  const asset=new DOMParser().parseFromString(source,'image/svg+xml');
  if(asset.querySelector('parsererror'))throw Error('Invalid SVG preview');
  // XML and HTML serialize empty SVG tags differently. Compare the drawing tree.
  const normalize=node=>({
   tag:node.localName,
   namespace:node.namespaceURI,
   attributes:Array.from(node.attributes).filter(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/').map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)),
   text:Array.from(node.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(''),
   children:Array.from(node.children,normalize),
  });
  return {
   expected:Array.from(asset.documentElement.children,normalize),
   actual:Array.from(document.getElementById('creator-preview').children,normalize),
  };
 },source);
 expect(drawing.actual).toEqual(drawing.expected);
}

for(const look of ['everyday','evening','separates'])test(`homepage ${look} image matches the starter sketch`,async({page})=>{
 await page.goto('/design-projects.html?look='+look+'#creator-room');
 await expect(page.locator('.creator-template-card')).toHaveCount(6);
 const response=await page.request.get('/outfit-options/starter-'+look+'.svg');
 expect(response.ok()).toBe(true);
 const markup=await response.text();
 await expectMatchingDrawing(page,markup);
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
 const source=decodeURIComponent((await image.getAttribute('src')).split(',')[1]);
 await expectMatchingDrawing(page,source);
 await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
});

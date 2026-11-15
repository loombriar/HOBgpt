const {test,expect}=require('@playwright/test');
const artwork={'A-line':'a-line','Fitted':'fitted','Full skirt':'full-skirt','Jumpsuit':'jumpsuit','Top & trousers':'top-trousers','Top & skirt':'top-skirt'};
for(const [look,template]of [['everyday','A-line'],['evening','Fitted'],['separates','Top & skirt']])test('homepage '+look+' keeps the detailed garment artwork',async({page})=>{
 await page.goto('/');
 const link=page.locator('.outfit-studio-looks a[href*="look='+look+'"]');
 await expect(link.locator('img')).toHaveAttribute('src','/outfit-options/'+artwork[template]+'.png');
 await link.click();
 await expect(page.locator('#creator-detailed-image')).toHaveAttribute('src','/outfit-options/'+artwork[template]+'.png');
 await expect(page.locator('#creator-template')).toHaveValue(template);
});
for(const width of [390,1280])test('detailed selected image and live design work at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/design-projects.html#creator-room');
 for(const [name,file]of Object.entries(artwork)){
  const button=page.locator('[data-creator-template="'+name+'"]');
  await expect(button.locator('img')).toHaveAttribute('src','/outfit-options/'+file+'.png');
  await button.click();
  const image=page.locator('#creator-detailed-image');
  await expect(image).toHaveAttribute('src','/outfit-options/'+file+'.png');
  await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('#creator-detailed-title')).toHaveText(name+' · Studio image');
 }
 await page.locator('#creator-color').evaluate(input=>{input.value='#87355d';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.getByLabel('Sleeves',{exact:true}).selectOption('Long');
 await expect(page.locator('#creator-3d-canvas')).toHaveAttribute('data-top-color','#87355d');
 await expect(page.locator('#creator-3d-canvas')).toHaveAttribute('data-sleeves','Long');
 await expect(page.locator('#creator-3d-canvas')).toHaveAttribute('data-lighting','smooth-cloth');
 await expect(page.locator('.creator-detailed-panel')).toContainText('Your color, neckline, sleeve and length changes appear in the editable previews below.');
 await page.getByRole('button',{name:'Show editable sketch',exact:true}).click();
 await expect(page.locator('#creator-preview')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

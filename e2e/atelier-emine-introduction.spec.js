const {test,expect}=require('@playwright/test');
const path=require('node:path');
for(const react of [false,true])for(const width of [320,1280]){
 test(`Marketplace homepage keeps fashion first in ${react?'React':'legacy'} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  if(react)await page.route('http://127.0.0.1:4173/',route=>route.fulfill({path:path.join(__dirname,'../apps/default/dist/index.html'),contentType:'text/html'}));
  await page.goto('/');
  const campaign=page.locator('#house-fashion-campaign');
  await expect(campaign).toBeVisible();
  const image=campaign.getByRole('img',{name:'Fashion model holding a pink mother-of-pearl handbag',exact:true});
  await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await expect(campaign.getByRole('link',{name:'Join as a designer →',exact:true})).toHaveAttribute('href','/sell');
  await expect(page.locator('#atelier-emine')).toHaveCount(0);
  await expect(page.locator('main a[href^="/atelier-emine"]')).toHaveCount(0);
  const studio=page.locator('#outfit-studio-home');
  await expect(studio.getByRole('heading',{name:'Create an outfit.',exact:true})).toBeVisible();
  await expect(studio.getByRole('link',{name:'Open the outfit studio ↗',exact:true})).toHaveAttribute('href','/design-projects.html#creator-room');
  await expect(studio.getByRole('group',{name:'Start an outfit'}).getByRole('link')).toHaveCount(3);
  for(const image of await studio.getByRole('img').all()) {
   await image.scrollIntoViewIfNeeded();
   await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  }
  expect(await campaign.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#outfit-studio-home'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const student=page.locator(react?'section[aria-labelledby="student-commission-heading"]':'#student-benefit');
  await expect(student).toContainText('permanent 5%');
  await expect(student.locator('a')).toHaveAttribute('href','/founding-schools');
  expect(await campaign.evaluate((el,selector)=>Boolean(el.compareDocumentPosition(document.querySelector(selector))&Node.DOCUMENT_POSITION_FOLLOWING),react?'section[aria-labelledby="student-commission-heading"]':'#student-benefit')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

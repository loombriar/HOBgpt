const {test,expect}=require('@playwright/test');

for(const width of [390,1280]){
 test(`Creative House groups roles and reveals their specialties at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.route('**/api/creative-house/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const profiles=path.endsWith('/event-profiles')?[
    {slug:'house-dj',role:'dj',display_name:'House DJ',location:'Ohio',description:'Independent runway music',specialties:'House, Disco'},
    {slug:'studio-venue',role:'venue',display_name:'Studio Venue',location:'Ohio',description:'Fashion event space',specialties:'Studio'}
   ]:path.endsWith('/profiles')?[
    {slug:'runway-model',role:'model',display_name:'Runway Model',location:'Ohio',bio:'Independent fashion model',specialties:'Runway'},
    {slug:'editorial-photographer',role:'photographer',display_name:'Editorial Photographer',location:'Ohio',bio:'Fashion photography',specialties:'Editorial'}
   ]:[];
   return route.fulfill({json:{profiles,profile:null,opportunities:[],events:[],inquiries:[]}});
  });
  await page.goto('/creative-house.html');
  await expect(page.locator('.creative-category-menu')).toHaveCount(3);
  const talent=page.locator('#creative-talent-menu');
  await talent.locator(':scope > summary').click();
  await talent.locator('[data-talent-role="model"]').click();
  await expect(page.locator('#directory-role')).toHaveValue('model');
  await expect(page.locator('#directory-specialty-menu')).toHaveAttribute('open');
  await page.locator('#directory-specialty').selectOption('Runway');
  await expect(page.locator('#creative-directory-list article:visible')).toHaveCount(1);
  await expect(page.locator('#creative-directory-list article:visible')).toContainText('Runway Model');
  await talent.locator('[data-talent-role="photographer"]').click();
  await expect(page.locator('#directory-specialty')).toHaveValue('');
  await expect(page.locator('#creative-directory-list article:visible')).toContainText('Editorial Photographer');
  await talent.locator('[data-talent-role="dj"]').click();
  await expect(page.locator('#event-directory-role')).toHaveValue('dj');
  await page.locator('#event-directory-specialty').selectOption('House');
  await expect(page.locator('#event-profiles-list article:visible')).toHaveCount(1);
  await expect(page.locator('#event-profiles-list article:visible')).toContainText('House DJ');
  await talent.locator('[data-talent-role="venue"]').click();
  await expect(page.locator('#event-directory-specialty')).toHaveValue('');
  await expect(page.locator('#event-profiles-list article:visible')).toContainText('Studio Venue');
  await page.locator('#creative-profile-menu > summary').click();
  await expect(talent).not.toHaveAttribute('open');
  await page.locator('#creative-profile-menu a[href="#event-profile-editor"]').click();
  await expect(page.locator('#event-profile-form')).toBeVisible();
  await expect(page.locator('#profile-form')).toBeHidden();
  await page.locator('#creative-profile-menu a[href="#your-profile"]').click();
  await expect(page.locator('#profile-form')).toBeVisible();
  await expect(page.locator('#event-profile-form')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#creative-profile-menu')).not.toHaveAttribute('open');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('role navigation preserves the designer-only directory boundary',async({page})=>{
 await page.route('**/api/creative-house/profiles',route=>route.fulfill({status:403,json:{error:'Designer access required'}}));
 await page.route('**/api/creative-house/event-profiles',route=>route.fulfill({status:403,json:{error:'Designer access required'}}));
 await page.goto('/creative-house.html');
 await page.locator('#creative-talent-menu > summary').click();
 await page.locator('[data-talent-role="model"]').click();
 await expect(page.locator('#directory-status')).toContainText('Only signed-in, active House of Briar designers');
 await expect(page.locator('#creative-directory-list article')).toHaveCount(0);
 await page.locator('[data-talent-role="dj"]').click();
 await expect(page.locator('#event-profiles-status')).toContainText('active House designer');
 await expect(page.locator('#event-profiles-list article')).toHaveCount(0);
});

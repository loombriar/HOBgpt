const {test,expect}=require('@playwright/test');
test('creative role choices open the matching form and checklist reflects saved photographer visibility',async({page})=>{
 await page.route('**/api/creative-house/**',route=>{
  const p=new URL(route.request().url()).pathname;
  const body=p.endsWith('/my-profile')?{profile:{display_name:'Test Photographer',role:'photographer',location:'Ohio',bio:'Fashion photography',published:false}}:p.endsWith('/my-event-profile')?{profile:null}:p.endsWith('/my-portfolio')?{images:[],access:{premium:false,imageLimit:5},settings:{}}:p.endsWith('/subscription/plans')?{checkoutConfigured:false}:{profiles:[],events:[],opportunities:[],inquiries:[]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/creative-house.html#join-house');
 await expect(page.locator('[data-join-role="photographer"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-ready="account"]')).toHaveAttribute('data-complete','true');
 await expect(page.locator('[data-ready="work"]')).toHaveAttribute('data-complete','false');
 await expect(page.locator('#creative-readiness-status')).toContainText('add portfolio photos');
 for(const role of ['model','photographer','dj','venue']){
  await page.locator('[data-join-role="'+role+'"]').click();
  const form=page.locator(['dj','venue'].includes(role)?'#event-profile-form':'#profile-form');
  await expect(form).toBeVisible();await expect(form.locator('[name="role"]')).toHaveValue(role);
 }
 const visibility=page.locator('#event-profile-form .creative-visibility');
 await expect(visibility).toContainText('Private');
 await page.locator('#event-profile-form [name="published"]').check();
 await expect(visibility).toContainText('Save profile to apply changes');
});

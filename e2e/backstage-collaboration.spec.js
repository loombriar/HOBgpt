const {test,expect}=require('@playwright/test');

for(const role of ['makeup-artist','hairstylist']){
 test(`designer discovers and contacts a ${role} without exposing private contact details`,async({page})=>{
  const slug=role+'-example';
  let submitted=null;
  await page.route('**/api/creative-house/**',async route=>{
   const url=new URL(route.request().url());
   const path=url.pathname;
   if(path.endsWith('/inquiries')&&route.request().method()==='POST'){
    submitted=route.request().postDataJSON();
    return route.fulfill({json:{message:'Inquiry sent.'}});
   }
   if(path.endsWith('/profiles'))return route.fulfill({json:{profiles:[{slug,role,display_name:'Example '+role,location:'Remote',bio:'Editorial work',specialties:'Editorial'}]}});
   if(path.endsWith('/my-inquiries'))return route.fulfill({json:{inquiries:[]}});
   if(path.endsWith('/my-portfolio'))return route.fulfill({json:{images:[],settings:{},access:{premium:false,imageLimit:5,status:'free'}}});
   if(path.endsWith('/my-profile'))return route.fulfill({json:{profile:null}});
   return route.fulfill({json:{profiles:[],events:[],opportunities:[],inquiries:[]}});
  });
  await page.goto('/creative-house.html#creative-directory');
  await page.locator('#creative-talent-menu > summary').click();
  await page.locator('[data-talent-role="'+role+'"]').click();
  const card=page.locator('#creative-directory-list article:visible');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Example '+role);
  await expect(card).not.toContainText('@');
  await card.getByText('Start a collaboration').click();
  await expect(page.locator('#creative-inquiry-form [name="recipient_slug"]')).toHaveValue(slug);
  await expect(page.locator('#creative-inquiry-form [name="recipient_kind"]')).toHaveValue('talent');
  await expect(page.locator('#creative-inquiry-form [name="subject"]')).toBeFocused();
 });
}
test('private inquiries remain inaccessible when designer directory is forbidden',async({page})=>{
 await page.route('**/api/creative-house/profiles',route=>route.fulfill({status:403,json:{error:'Designer access required'}}));
 await page.goto('/creative-house.html#creative-directory');
 await expect(page.locator('#directory-status')).toContainText('Only signed-in, active House of Briar designers');
 await expect(page.locator('#creative-directory-list article')).toHaveCount(0);
});

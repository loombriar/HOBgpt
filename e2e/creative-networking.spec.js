const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`networking preferences and wedding or repair briefs work at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 let profile={slug:'network-creative',display_name:'Network Creative',role:'designer',location:'Ohio',bio:'',published:true,openTo:[]},sent;
 await page.route('**/api/creative-house/**',route=>{
  const p=new URL(route.request().url()).pathname,method=route.request().method();
  if(p.endsWith('/my-profile')){if(method==='PUT')profile={...profile,...route.request().postDataJSON()};return route.fulfill({json:{profile}});}
  if(p.endsWith('/profiles'))return route.fulfill({json:{profiles:[profile]}});
  if(p.endsWith('/inquiries')&&method==='POST'){sent=route.request().postDataJSON();return route.fulfill({status:201,json:{sent:true,message:'Private inquiry sent.'}});}
  const data=p.endsWith('/my-event-profile')?{profile:null}:{profiles:[],events:[],opportunities:[],inquiries:[]};return route.fulfill({json:data});
 });
 await page.goto('/creative-house.html#your-profile');
 const form=page.locator('#profile-form');
 await expect(form).toBeVisible();
 await form.locator('[name=openTo][value=wedding-attire]').check();
 await form.locator('[name=openTo][value=repairs-alterations]').check();
 await form.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).toContainText('Profile saved');
 expect(profile.openTo).toEqual(['wedding-attire','repairs-alterations']);
 await page.goto('/creative-house.html#creative-directory');
 const card=page.locator('#creative-directory-list article').first();
 await expect(card).toContainText('Wedding attire');await expect(card).toContainText('Repairs & alterations');
 await card.getByRole('link',{name:'Start a collaboration'}).click();
 const request=page.locator('#creative-inquiry-form');await expect(request).toBeVisible();
 await expect(request.locator('[name=recipient_slug]')).toHaveValue('network-creative');
 await request.locator('[name=subject]').fill('Wedding and repair project');
 await request.locator('[name=projectType]').selectOption(width===390?'wedding-attire':'repairs-alterations');
 await request.locator('[name=budget]').fill('$400 total');
 await request.locator('[name=projectLocation]').fill('Columbus, Ohio');
 await request.locator('[name=startDate]').fill('2027-06-01');
 await request.locator('[name=message]').fill('Looking for a collaborator for wedding party repairs and alterations.');
 await request.getByRole('button',{name:'Send private inquiry',exact:true}).click();
 await expect(page.locator('#creative-inquiry-status')).toContainText('Private inquiry sent');
 expect(sent.budget).toBe('$400 total');expect(sent.projectType).toBe(width===390?'wedding-attire':'repairs-alterations');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

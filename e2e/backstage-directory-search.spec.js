const {test,expect}=require('@playwright/test');
test('designer can combine name, location and profession filters and reset them',async({page})=>{
 await page.route('**/api/creative-house/**',route=>{
  const p=new URL(route.request().url()).pathname;
  if(p.endsWith('/profiles'))return route.fulfill({json:{profiles:[
   {slug:'a',role:'hairstylist',display_name:'Alex Styles',location:'New York',bio:'Editorial',specialties:'Runway'},
   {slug:'b',role:'makeup-artist',display_name:'Sam Beauty',location:'Remote',bio:'Bridal',specialties:'Bridal'},
   {slug:'c',role:'hairstylist',display_name:'Taylor Hair',location:'Chicago',bio:'Fashion',specialties:'Editorial'}
  ]}});
  if(p.includes('/portfolios/'))return route.fulfill({json:{images:[],settings:{layout:'grid',theme:'mint'}}});
  if(p.endsWith('/my-portfolio'))return route.fulfill({json:{images:[],settings:{},access:{premium:false,imageLimit:5,status:'free'}}});
  return route.fulfill({json:{profiles:[],inquiries:[],events:[],opportunities:[]}});
 });
 await page.goto('/creative-house.html#creative-directory');
 const cards=page.locator('#creative-directory-list article');
 await expect(cards).toHaveCount(3);
 await page.locator('#directory-role').selectOption('hairstylist');
 await page.locator('#directory-name').fill('alex');
 await page.locator('#directory-location').fill('new york');
 await expect(cards.filter({visible:true})).toHaveCount(1);
 await expect(cards.filter({visible:true})).toContainText('Alex Styles');
 await page.locator('#directory-clear').click();
 await expect(cards.filter({visible:true})).toHaveCount(3);
});
test('unauthorized directory search does not reveal profiles',async({page})=>{
 await page.route('**/api/creative-house/profiles',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.goto('/creative-house.html#creative-directory');
 await page.locator('#directory-name').fill('Alex');
 await expect(page.locator('#creative-directory-list article')).toHaveCount(0);
});

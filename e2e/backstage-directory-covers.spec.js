const {test,expect}=require('@playwright/test');

test('authorized designer sees selected portfolio cover and can start an inquiry',async({page})=>{
 await page.route('**/api/creative-house/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname.endsWith('/profiles'))return route.fulfill({json:{profiles:[{slug:'artist-1',role:'hairstylist',display_name:'Artist One',location:'Remote',bio:'Editorial styling',specialties:'Editorial'}]}});
  if(pathname.endsWith('/portfolios/artist-1'))return route.fulfill({json:{images:[{id:'first',url:'/api/creative-house/portfolio-images/first',caption:'First',is_cover:0},{id:'cover',url:'/api/creative-house/portfolio-images/cover',caption:'Cover',is_cover:1}],settings:{layout:'grid',theme:'mint'}}});
  if(pathname.endsWith('/my-profile'))return route.fulfill({json:{profile:null}});
  if(pathname.endsWith('/my-inquiries'))return route.fulfill({json:{inquiries:[]}});
  if(pathname.endsWith('/my-portfolio'))return route.fulfill({json:{images:[],settings:{},access:{premium:false,imageLimit:5,status:'free'}}});
  return route.fulfill({json:{profiles:[],inquiries:[],events:[],opportunities:[]}});
 });
 await page.goto('/creative-house.html#creative-directory');
 const card=page.locator('#creative-directory-list article').filter({hasText:'Artist One'});
 await expect(card.locator('img.creative-directory-cover')).toHaveAttribute('src','/api/creative-house/portfolio-images/cover');
 await card.getByText('Start a collaboration').click();
 await expect(page.locator('#creative-inquiry-form [name="recipient_slug"]')).toHaveValue('artist-1');
});
test('directory does not expose portfolios to unauthorized visitors',async({page})=>{
 let portfolioRequests=0;
 await page.route('**/api/creative-house/profiles',route=>route.fulfill({status:403,json:{error:'Designer access required'}}));
 await page.route('**/api/creative-house/portfolios/**',route=>{portfolioRequests++;return route.fulfill({status:403,json:{error:'Designer access required'}});});
 await page.goto('/creative-house.html#creative-directory');
 await expect(page.locator('#creative-directory-list article')).toHaveCount(0);
 await expect(page.locator('#directory-status')).toContainText('Only signed-in, active House of Briar designers');
 expect(portfolioRequests).toBe(0);
});

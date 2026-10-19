const {test,expect}=require('@playwright/test');

test('mobile navigation stays compact and keeps account and cart usable',async({page})=>{
 await page.setViewportSize({width:393,height:851});await page.goto('/');
 const header=page.locator('#hob-global-nav');
 await expect(header.locator('.hob-global-actions')).toBeVisible();
 await expect.poll(async()=> (await header.boundingBox()).height,{message:'The mobile storefront header must fit two compact rows'}).toBeLessThanOrEqual(110);
 await header.getByRole('button',{name:'Customer sign in or create an account'}).click();
 await expect(page.locator('#visitor-suite-modal')).toBeVisible();
 await page.locator('#visitor-suite-close').click();
 await page.locator('#cart-btn').click();await expect(page.locator('#cart-dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#cart-dialog-close').click();
 await expect(page.locator('html')).toHaveAttribute('data-hob-theme','dark');
 const surface=await page.locator('#product-grid .product-body').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}));
 expect(surface.background).not.toContain('rgba');expect(surface.blur).toBe('none');
});

test('homepage category changes reset subcategories and retain the chosen branch',async({page})=>{
 await page.goto('/');
 const categoryMenu=page.locator('[data-filter-menu="category"]');
 await page.getByLabel('Filter by category',{exact:true}).selectOption('accessories');
 const sub=page.getByLabel('Filter by subcategory',{exact:true});
 await expect(sub.locator('option[value="Belt"]')).toHaveCount(1);
 await expect(sub.locator('option[value="Dress"]')).toHaveCount(0);
 const request=page.waitForRequest(r=>r.url().includes('/api/gallery?')&&new URL(r.url()).searchParams.get('style')==='Belt');
 await sub.selectOption('Belt');const url=new URL((await request).url());expect(url.searchParams.get('category')).toBe('accessories');
 await expect(categoryMenu.locator('#shop-category-buttons button[aria-pressed="true"]')).toContainText('Accessories');
 await page.getByLabel('Filter by category',{exact:true}).selectOption('apparel');
 await expect(sub).toHaveValue('all');await expect(sub.locator('option[value="Dress"]')).toHaveCount(1);
 await expect(sub.locator('option[value="Belt"]')).toHaveCount(0);
 await page.locator('#shop-clear-filters').click();await expect(page.locator('#shop-category-filter')).toHaveValue('all');
 await expect(categoryMenu.locator('#shop-category-buttons button[aria-pressed="true"]')).toContainText('All pieces');
});

test('shop page category and subcategory filters compose and reset together',async({page})=>{
 await page.route('**/api/gallery*',r=>r.fulfill({json:{items:[
  {id:'dress',title:'Editorial dress',price:30,category:'apparel',style:'Dress',aesthetic:'Boho',status:'published'},
  {id:'belt',title:'Studio belt',price:20,category:'accessories',style:'Belt',aesthetic:'Boho',status:'published'}
 ]}}));
 await page.goto('/shop');await page.getByText('Browse pieces ·',{exact:false}).click();await page.locator('#category-filter').selectOption('apparel');await page.locator('#subcategory-filter').selectOption('Dress');await page.locator('#style-filter').selectOption('Boho');
 await expect(page.locator('.house-shop-grid')).toContainText('Editorial dress');await expect(page.locator('.house-shop-grid')).not.toContainText('Studio belt');
 await page.locator('#category-filter').selectOption('accessories');await expect(page.locator('#subcategory-filter')).toHaveValue('All subcategories');
 await expect(page.locator('.house-shop-grid')).toContainText('Studio belt');await expect(page.locator('.house-shop-grid')).not.toContainText('Editorial dress');
});

test('creative directories filter saved roles and specialties',async({page})=>{
 await page.route('**/api/creative-house/**',r=>{
  const path=new URL(r.request().url()).pathname;
  const profiles=path==='/api/creative-house/profiles'?[
   {slug:'runway-model',display_name:'Runway Model',role:'model',location:'Ohio',bio:'Fashion model',specialties:'Runway, Editorial'},
   {slug:'fashion-photographer',display_name:'Fashion Photographer',role:'photographer',location:'Ohio',bio:'Fashion photography',specialties:'Fashion'}
  ]:[];
  return r.fulfill({json:{profiles,profile:null,opportunities:[],events:[],inquiries:[]}});
 });
 await page.goto('/creative-house.html#creative-directory');
 await expect(page.locator('#creative-directory-list article')).toHaveCount(2);
 await page.locator('#directory-role').selectOption('model');await page.locator('#directory-specialty').selectOption('Runway');
 await expect(page.locator('#creative-directory-list article:visible')).toHaveCount(1);
 await expect(page.locator('#creative-directory-list article:visible')).toContainText('Runway Model');
 await page.locator('#directory-role').selectOption('photographer');await expect(page.locator('#directory-specialty')).toHaveValue('');
 await expect(page.locator('#creative-directory-list article:visible')).toContainText('Fashion Photographer');
});

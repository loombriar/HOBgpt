const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`designer listing photos load and switch at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
 const image=await require('sharp')({create:{width:32,height:40,channels:3,background:'#439b85'}}).png().toBuffer();
 await page.route('**/api/listings/photo-piece/images/*/content',route=>route.fulfill({contentType:'image/png',body:image}));
 await page.route('**/api/my/studio',async route=>{const response=await route.fetch();const studio=await response.json();await route.fulfill({json:{...studio,items:[{id:'photo-piece',title:'Photo test dress',description:'Handmade',price:295,category:'apparel',status:'published',moderationStatus:'approved',studioStatus:'Active',version:1,images:[{id:'front',url:'/api/listings/photo-piece/images/front/content'},{id:'back',url:'/api/listings/photo-piece/images/back/content'}]}]}});});
 await page.goto('/account#products');
 const row=page.locator('#listing-photo-piece');
 await row.scrollIntoViewIfNeeded();
 const cover=row.getByRole('img',{name:'Photo test dress — photo 1 of 2',exact:true});
 await expect(cover).toBeVisible();
 await expect.poll(()=>cover.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await row.getByRole('button',{name:'Show Photo test dress photo 2',exact:true}).click();
 await expect(row.getByRole('img',{name:'Photo test dress — photo 2 of 2',exact:true})).toBeVisible();
 await expect(row.getByRole('button',{name:'Show Photo test dress photo 2',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(row.getByRole('button',{name:'Edit listing & inventory',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

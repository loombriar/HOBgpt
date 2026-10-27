const {test,expect}=require('@playwright/test');
for(const room of ['standalone','dashboard'])for(const width of [390,1280])test(`main photo is chosen directly and saved in ${room} at ${width}`,async({page})=>{
await page.setViewportSize({width,height:900});await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
const item={id:'cover-piece',title:'Cover test dress',description:'Handmade dress',price:75,category:'apparel',style:'Dress',size:'M',aesthetic:'Romantic',productionType:'One of a Kind',status:'draft',moderationStatus:'pending',version:1,images:[{id:'front',url:'/api/listings/cover-piece/images/front/content'},{id:'back',url:'/api/listings/cover-piece/images/back/content'}]};let order;
const image=await require('sharp')({create:{width:20,height:30,channels:3,background:'#439b85'}}).png().toBuffer();
await page.route('**/api/my/studio',async r=>{const response=await r.fetch();const studio=await response.json();await r.fulfill({json:{...studio,items:[item]}});});await page.route('**/api/listings/cover-piece',r=>r.fulfill({json:{item}}));await page.route('**/api/listings/cover-piece/images/*/content',r=>r.fulfill({contentType:'image/png',body:image}));await page.route('**/api/listings/cover-piece/enhancements',r=>r.fulfill({json:{item}}));await page.route('**/api/listings/cover-piece/images/order',r=>{order=r.request().postDataJSON().imageIds;return r.fulfill({json:{item}});});
await page.goto(room==='standalone'?'/designers/room':'/account#products');const row=page.locator('#listing-cover-piece');
if(room==='standalone')await page.locator('#designer-edit-pieces').click();
await row.getByRole('button',{name:'Edit',exact:true}).click();
await page.getByRole('button',{name:'Make photo 2 the main photo',exact:true}).click();
if(room==='standalone'){await expect(page.locator('#photo-preview > div').first().locator('img')).toHaveAttribute('src',/./);await expect(page.locator('#photo-preview > div').first()).toContainText('Main photo');await page.locator('#listing-save-changes').click();await expect(page.locator('#upload-message')).toContainText('Changes saved successfully');}
else{await expect(page.getByRole('img',{name:'Listing cover preview',exact:true})).toHaveAttribute('src',/back/);await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Submit it for review when it is ready.',{exact:true})).toBeVisible();}
expect(order).toEqual(['back','front']);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

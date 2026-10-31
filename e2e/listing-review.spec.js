const {test,expect}=require('@playwright/test');
for(const room of ['dashboard','standalone'])test(`review feedback opens the piece for editing in ${room}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
 const item={id:'review-piece',title:'Berry dress',description:'A handmade dress',price:75,category:'apparel',status:'rejected',moderationStatus:'rejected',moderationReason:'Please add garment measurements.',version:1,images:[],productionType:'One of a Kind',stockQuantity:1};
 await page.route('**/api/my/studio',r=>r.fulfill({json:{items:[item],orders:[],ordersCount:0,messages:0,counts:{Active:0,Draft:0,Expired:0,'Sold Out':0,Inactive:1},views:{events:0,sessions:0,days:30}}}));
 await page.route('**/api/listings/review-piece',r=>r.fulfill({json:{item}}));
 await page.goto(room==='dashboard'?'/account#listing-review-piece':'/designers/room');
 if(room==='standalone')await page.getByRole('navigation',{name:'Designer room sections'}).getByRole('button',{name:'Your listings',exact:true}).click();
 const card=page.locator('#listing-review-piece');
 await expect(card).toContainText('Please add garment measurements.');
 await card.getByRole('button',{name:'Edit & resubmit',exact:true}).click();
 if(room==='dashboard')await page.getByRole('button',{name:'2. Details',exact:true}).click();
 if(room==='standalone')await page.locator('.listing-edit-options').filter({has:page.locator('#product-name')}).locator(':scope > summary').click();
 const title=room==='dashboard'?page.getByRole('textbox',{name:'Piece name',exact:true}):page.locator('#product-name');
 await expect(title).toBeVisible();await expect(title).toHaveValue('Berry dress');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

const {test,expect}=require('@playwright/test');
test('Backstage notifications display unread items and mark them read',async({page})=>{
 let read=false;
 await page.route('**/api/creative-house/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/designer-notifications'))return route.fulfill({status:403,json:{error:'Forbidden'}});
  if(path.endsWith('/notifications'))return route.fulfill({json:{unread:read?0:1,notifications:[{id:'n1',inquiry_id:'q1',kind:'new_inquiry',read_at:read?'2026-11-02':null,created_at:'2026-11-02'}]}});
  if(path.endsWith('/notifications/n1/read')){read=true;return route.fulfill({json:{updated:true}});}
  if(path.endsWith('/my-portfolio'))return route.fulfill({json:{images:[],settings:{},access:{premium:false,imageLimit:5,status:'free'}}});
  return route.fulfill({json:{profiles:[],inquiries:[],events:[],opportunities:[]}});
 });
 await page.goto('/creative-house.html#backstage-notifications');
 await expect(page.locator('#notification-count')).toContainText('1 unread');
 await page.locator('#notification-list').getByRole('button',{name:'Mark as read'}).click();
 await expect(page.locator('#notification-count')).toBeEmpty();
 await expect(page.locator('#notification-list').getByRole('button',{name:'Mark as read'})).toHaveCount(0);
});
test('notifications stay hidden without an authenticated account',async({page})=>{
 await page.route('**/api/creative-house/notifications',route=>route.fulfill({status:401,json:{error:'Unauthorized'}}));
 await page.route('**/api/creative-house/designer-notifications',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.goto('/creative-house.html#backstage-notifications');
 await expect(page.locator('#notification-list').children()).toHaveCount(0);
 await expect(page.locator('#notification-status')).toContainText('Sign in');
});
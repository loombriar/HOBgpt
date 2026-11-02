const {test,expect}=require('@playwright/test');
test('designer can filter sent collaborations and view inquiry details',async({page})=>{
 await page.route('**/api/creative-house/my-inquiries',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.route('**/api/creative-house/sent-inquiries',route=>route.fulfill({json:{inquiries:[{id:'a',subject:'Editorial shoot',status:'pending',recipient_slug:'photographer-one',recipient_kind:'talent',message:'A private editorial project.'},{id:'b',subject:'Runway show',status:'accepted',recipient_slug:'model-two',recipient_kind:'talent',message:'Runway collaboration.'}]}}));
 await page.goto('/creative-house.html#collaboration-dashboard');
 await expect(page.locator('#collaboration-view')).toHaveValue('sent');
 await expect(page.locator('#collaboration-dashboard-list .opportunity')).toHaveCount(2);
 await page.locator('#collaboration-filter').selectOption('accepted');
 await expect(page.locator('#collaboration-dashboard-list .opportunity')).toHaveCount(1);
 await expect(page.locator('#collaboration-dashboard-list')).toContainText('Runway show');
 await expect(page.locator('#collaboration-dashboard-list')).not.toContainText('Editorial shoot');
});
test('creative can accept a pending inquiry from the dashboard',async({page})=>{
 let accepted=false;
 await page.route('**/api/creative-house/my-inquiries/*/respond',route=>{accepted=true;return route.fulfill({json:{updated:true}});});
 await page.route('**/api/creative-house/my-inquiries',route=>route.fulfill({json:{inquiries:[{id:'a',subject:'Campaign request',status:accepted?'accepted':'pending',sender_name:'House Studio',recipient_kind:'talent',message:'Please collaborate on our campaign.'}]}}));
 await page.route('**/api/creative-house/sent-inquiries',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.goto('/creative-house.html#collaboration-dashboard');
 await expect(page.locator('#collaboration-dashboard-list')).toContainText('Campaign request');
 await page.locator('#collaboration-dashboard-list').getByRole('button',{name:'Accept inquiry'}).click();
 await expect(page.locator('#collaboration-dashboard-list')).toContainText('Status: accepted');
});
test('notification review link opens collaboration dashboard',async({page})=>{
 await page.route('**/api/creative-house/notifications',route=>route.fulfill({json:{unread:1,notifications:[{id:'n',inquiry_id:'a',kind:'new_inquiry',read_at:null}]}}));
 await page.route('**/api/creative-house/designer-notifications',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.goto('/creative-house.html#backstage-notifications');
 await expect(page.locator('#notification-list a').first()).toHaveAttribute('href','#collaboration-dashboard');
});

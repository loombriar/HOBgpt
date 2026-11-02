const {test,expect}=require('@playwright/test');
test('accepted creative inquiry supports private conversation and unread badge',async({page})=>{
 let sent=false;
 await page.route('**/api/creative-house/my-inquiries',route=>route.fulfill({json:{inquiries:[{id:'q1',subject:'Editorial campaign',status:'accepted'}]}}));
 await page.route('**/api/creative-house/sent-inquiries',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.route('**/api/creative-house/creative-messages/unread',route=>route.fulfill({json:{unread:sent?0:1,threads:[{inquiry_id:'q1',unread:1}]}}));
 await page.route('**/api/creative-house/creative-messages/q1/read',route=>route.fulfill({json:{updated:true}}));
 await page.route('**/api/creative-house/creative-messages/q1',route=>{
  if(route.request().method()==='POST'){sent=true;return route.fulfill({status:201,json:{sent:true}});}
  return route.fulfill({json:{messages:[{id:'m1',sender_role:'designer',body:'Can you join our editorial?',created_at:'2026-11-02'},...(sent?[{id:'m2',sender_role:'creative',body:'Yes, happy to discuss.',created_at:'2026-11-02'}]:[])]}});
 });
 await page.goto('/creative-house.html#backstage-messages');
 await expect(page.locator('#backstage-message-thread')).toHaveValue('q1');
 await expect(page.locator('#backstage-message-list')).toContainText('Can you join our editorial?');
 await page.locator('#backstage-message-form textarea').fill('Yes, happy to discuss.');
 await page.locator('#backstage-message-form button').click();
 await expect(page.locator('#backstage-message-list')).toContainText('Yes, happy to discuss.');
});
test('pending inquiries cannot be selected for messaging',async({page})=>{
 await page.route('**/api/creative-house/my-inquiries',route=>route.fulfill({json:{inquiries:[{id:'pending',subject:'Not accepted',status:'pending'}]}}));
 await page.route('**/api/creative-house/sent-inquiries',route=>route.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.route('**/api/creative-house/creative-messages/unread',route=>route.fulfill({json:{unread:0,threads:[]}}));
 await page.goto('/creative-house.html#backstage-messages');
 await expect(page.locator('#backstage-message-thread option')).toHaveCount(1);
 await expect(page.locator('#backstage-message-status')).toContainText('Select an accepted collaboration');
});

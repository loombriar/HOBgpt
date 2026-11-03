const {test,expect}=require('@playwright/test');
test('designer proposes booking for accepted collaboration',async({page})=>{
 let proposed=null;
 await page.route('**/api/creative-house/my-inquiries',r=>r.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.route('**/api/creative-house/sent-inquiries',r=>r.fulfill({json:{inquiries:[{id:'q1',subject:'Editorial booking',status:'accepted'}]}}));
 await page.route('**/api/creative-house/designer-bookings/notifications',r=>r.fulfill({json:{unread:0,notifications:[]}}));
 await page.route('**/api/creative-house/designer-bookings/q1',r=>r.fulfill({json:{booking:proposed}}));
 await page.route('**/api/creative-house/designer-bookings/q1/propose',async r=>{proposed={...r.request().postDataJSON(),status:'proposed',proposed_by:'designer'};await r.fulfill({status:201,json:{booking:proposed}});});
 await page.goto('/creative-house.html#backstage-bookings');
 await page.locator('#booking-view').selectOption('designer');
 await expect(page.locator('#booking-inquiry option[value="q1"]')).toHaveCount(1);
 await page.locator('#booking-inquiry').selectOption('q1');
 await page.locator('#booking-proposal [name="starts_at"]').fill('2027-01-12T10:00');
 await page.locator('#booking-proposal [name="ends_at"]').fill('2027-01-12T12:00');
 await page.locator('#booking-proposal [name="timezone"]').fill('America/New_York');
 await page.locator('#booking-proposal [name="location"]').fill('Photo studio');
 await page.locator('#booking-proposal [name="compensation"]').fill('$300 flat');
 await page.locator('#booking-proposal button').click();
 await expect(page.locator('#booking-details')).toContainText('Status: proposed');
 await expect(page.locator('#booking-details')).toContainText('$300 flat');
});
test('pending collaboration cannot create booking proposal',async({page})=>{
 await page.route('**/api/creative-house/my-inquiries',r=>r.fulfill({json:{inquiries:[{id:'q2',subject:'Pending request',status:'pending'}]}}));
 await page.route('**/api/creative-house/sent-inquiries',r=>r.fulfill({status:403,json:{error:'Forbidden'}}));
 await page.route('**/api/creative-house/creative-bookings/notifications',r=>r.fulfill({json:{unread:0,notifications:[]}}));
 await page.goto('/creative-house.html#backstage-bookings');
 await expect(page.locator('#booking-inquiry option')).toHaveCount(1);
 await expect(page.locator('#booking-proposal')).toBeHidden();
});

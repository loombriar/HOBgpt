const {test,expect}=require('@playwright/test');
test('confirmed booking offers mutual completion acknowledgement',async({page})=>{
 let confirmed=false;
 await page.route('**/api/creative-house/my-inquiries',r=>r.fulfill({json:{inquiries:[{id:'q1',subject:'Editorial',status:'accepted'}]}}));
 await page.route('**/api/creative-house/creative-bookings/notifications',r=>r.fulfill({json:{unread:0,notifications:[]}}));
 await page.route('**/api/creative-house/creative-bookings/q1',r=>r.fulfill({json:{booking:{inquiry_id:'q1',status:'confirmed',starts_at:'2026-10-01T10:00:00Z',ends_at:'2026-10-01T12:00:00Z',location:'Studio',compensation:'$300'},completion:confirmed?{creative_approved:1,designer_approved:0}:null}}));
 await page.route('**/api/creative-house/creative-bookings/q1/completion',r=>{confirmed=true;return r.fulfill({json:{completion:{creative_approved:1,designer_approved:0}}});});
 await page.goto('/creative-house.html#backstage-bookings');
 await expect(page.locator('#booking-inquiry option[value="q1"]')).toHaveCount(1);
 await page.locator('#booking-inquiry').selectOption('q1');
 await page.getByRole('button',{name:'Confirm project completed'}).click();
 await expect(page.locator('#booking-actions')).toContainText('Waiting for the other participant');
});

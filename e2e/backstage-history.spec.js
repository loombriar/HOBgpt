const {test,expect}=require('@playwright/test');
test('history preferences default private and can be opted in',async({page})=>{
 let saved=null;
 await page.route('**/api/creative-house/my-inquiries',r=>r.fulfill({json:{inquiries:[]}}));
 await page.route('**/api/creative-house/creative-history',r=>r.fulfill({json:{preferences:saved||{public_history:0,allow_endorsements:0},completed_collaborations:2,endorsements:[]}}));
 await page.route('**/api/creative-house/creative-history/preferences',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{preferences:saved}});});
 await page.goto('/creative-house.html#backstage-history');
 await expect(page.locator('#history-public')).not.toBeChecked();
 await expect(page.locator('#history-summary')).toContainText('2');
 await page.locator('#history-public').check();
 await page.locator('#history-save').click();
 await expect(page.locator('#history-status')).toContainText('Preferences saved');
 expect(saved.public_history).toBe(true);
});

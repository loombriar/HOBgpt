const {test,expect}=require('@playwright/test');

for(const role of ['reviewer','support']){
  test(`${role} opens only its work queue, restores the session and signs out`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const requests=[];
    page.on('request',request=>{if(request.url().includes('/api/admin/'))requests.push(new URL(request.url()).pathname);});
    await page.goto('/admin');
    await page.getByRole('textbox',{name:'Admin access token',exact:true}).fill(`e2e-${role}-fixture-token`);
    await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
    const heading=role==='reviewer'?'Product Review Queue':'Customer support inbox';
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Sign out of admin',exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'Admin access token',exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Message a designer',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Save response',exact:true})).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    const forbidden=role==='reviewer'?'/api/admin/support':'/api/admin/listings/review-queue';
    expect(requests).not.toContain('/api/admin/operations');
    expect(requests).not.toContain(forbidden);
    expect((await page.request.get(forbidden)).status()).toBe(403);
    const allowed=role==='reviewer'?'/api/admin/listings/review-queue':'/api/admin/support';
    expect((await page.request.get(allowed)).status()).toBe(200);
    await page.getByRole('button',{name:'Sign out of admin',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open dashboard',exact:true})).toBeVisible();
    expect((await page.request.get(allowed)).status()).toBe(401);
    expect((await page.request.get('/api/admin/session')).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toHaveCount(0);
  });
}

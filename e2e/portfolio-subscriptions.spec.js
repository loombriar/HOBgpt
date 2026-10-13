const {test,expect}=require('@playwright/test');
test('portfolio controls reflect server access and keep unconfigured checkout disabled',async({page})=>{
  await page.route('**/api/creative-house/**',route=>{
    const p=new URL(route.request().url()).pathname;
    const body=p.endsWith('/subscription/plans')?{checkoutConfigured:false}:p.endsWith('/my-portfolio')?{images:[],settings:{layout:'grid',theme:'mint',featured_project:''},access:{premium:false,imageLimit:5,status:'free',canManageBilling:false}}:p.endsWith('/my-profile')?{profile:null}:{profiles:[],events:[],opportunities:[],inquiries:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/creative-house.html');
  await expect(page.locator('#portfolio-status')).toContainText('Free Portfolio · 0 / 5 images');
  await expect(page.locator('#portfolio-upgrade')).toBeDisabled();
  await expect(page.locator('#portfolio-settings')).toBeHidden();
  await expect(page.locator('#portfolio-upload')).toBeVisible();
});
test('paid portfolio benefits and cancellation controls reflect verified server response',async({page})=>{
  await page.route('**/api/creative-house/**',route=>{
    const p=new URL(route.request().url()).pathname;
    const body=p.endsWith('/subscription/plans')?{checkoutConfigured:true}:p.endsWith('/my-portfolio')?{images:[],settings:{layout:'spotlight',theme:'coral',featured_project:'Spring editorial'},access:{premium:true,imageLimit:30,status:'active',canManageBilling:true,cancelAtPeriodEnd:false}}:p.endsWith('/analytics')?{views:7}:p.endsWith('/my-profile')?{profile:null}:{profiles:[],events:[],opportunities:[],inquiries:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/creative-house.html?subscription=success');
  await expect(page.locator('#portfolio-status')).toContainText('Premium Portfolio · 0 / 30 images');
  await expect(page.locator('#portfolio-manage')).toBeVisible();
  await expect(page.locator('#portfolio-cancel')).toBeVisible();
  await expect(page.locator('#portfolio-settings')).toBeVisible();
  await expect(page.locator('#portfolio-settings [name="layout"]')).toHaveValue('spotlight');
  await expect(page.locator('#portfolio-analytics')).toContainText('7 portfolio opens');
});

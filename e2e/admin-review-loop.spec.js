// Isolated mobile review/resubmission journey rebased onto current main.
// Admin review-form validation is already implemented on main; no UI patch needed.
const {test,expect}=require('@playwright/test');
test('mobile review loop delivers feedback, resubmission and approval alerts',async({page,browser})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
 const creatorContext=await browser.newContext({baseURL:'http://127.0.0.1:4173',extraHTTPHeaders:{Origin:'http://127.0.0.1:4173'},viewport:{width:390,height:844}}),creator=await creatorContext.newPage();
 let id;
 try{
  expect((await creator.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
  const created=await creator.request.post('/api/listings',{data:{title:'Review Loop Dress',price:75,category:'apparel',description:'A sample handmade dress',productionType:'One of a Kind'}});
  expect(created.ok(),await created.text()).toBeTruthy();id=(await created.json()).item.id;
  const image=await require('sharp')({create:{width:32,height:32,channels:3,background:'#af4763'}}).png().toBuffer();
  const uploaded=await creator.request.post(`/api/listings/${id}/images`,{multipart:{clientImageKey:'review-loop-'+id,image:{name:'sample.png',mimeType:'image/png',buffer:image}}});expect(uploaded.ok(),await uploaded.text()).toBeTruthy();
  expect((await creator.request.post(`/api/listings/${id}/submit`,{data:{marketplaceRulesAccepted:true}})).ok()).toBeTruthy();
  await page.goto('/admin');await page.getByLabel('Admin access token').fill('e2e-admin-token');await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review Loop Dress',exact:true})});
  await expect(card).toBeVisible();
  await expect.poll(()=>card.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await card.getByLabel('Change category',{exact:true}).selectOption({label:'Needs clearer product details'});
  await card.getByRole('button',{name:'Request changes',exact:true}).click();
  await expect(page.getByText('Explain what the designer needs to change.',{exact:true})).toBeVisible();await expect(card).toBeVisible();
  await card.getByLabel('Additional details',{exact:true}).fill('Please add waist and length measurements.');
  await card.getByRole('button',{name:'Request changes',exact:true}).click();await expect(card).toHaveCount(0);
  const alerts=await(await creator.request.get('/api/my/designer-notifications')).json();
  const feedback=alerts.items.find(n=>n.listingId===id&&n.title==='Changes requested');expect(feedback.readAt).toBeNull();expect(feedback.body).toContain('waist and length');
  await creator.goto(feedback.actionPath);
  let piece=creator.locator('#listing-'+id);await expect(piece).toContainText('Please add waist and length measurements.');
  await piece.getByRole('button',{name:'Edit & resubmit',exact:true}).click();
  await creator.getByLabel('Garment measurements',{exact:true}).fill('Waist 30 in; length 40 in');
  await creator.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(creator.getByText('Draft saved. Submit it for review when it is ready.',{exact:true})).toBeVisible();
  await creator.getByRole('navigation',{name:'Designer studio sections'}).getByRole('link',{name:'Listings',exact:true}).click();
  piece=creator.locator('#listing-'+id);await piece.getByRole('checkbox').last().check();
  await piece.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(piece).toContainText('Pending review');
  expect((await(await creator.request.get('/api/gallery')).json()).items.some(x=>x.id===id)).toBe(false);
  await page.reload();await expect(card).toContainText('Waist 30 in');await card.getByRole('button',{name:'Approve',exact:true}).click();await expect(card).toHaveCount(0);
  const approved=await(await creator.request.get('/api/my/designer-notifications')).json();expect(approved.items.some(n=>n.listingId===id&&n.title==='Listing approved'&&!n.readAt)).toBe(true);
  expect((await(await creator.request.get('/api/gallery')).json()).items.some(x=>x.id===id)).toBe(true);
  await creator.reload();await expect(creator.locator('#listing-'+id)).toContainText('Live');
  for(const tab of [page,creator])expect(await tab.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 }finally{if(id)await page.request.delete('/api/admin/listings/'+id,{headers:{Origin:'http://127.0.0.1:4173'}});await creatorContext.close();}
});

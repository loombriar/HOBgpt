const {test,expect}=require('@playwright/test');
const sharp=require('sharp');
for(const width of [390,1280])test(`a sketch stays private until shared and connects to a maker after acceptance at ${width}px`,async({page,browser})=>{
 await page.setViewportSize({width,height:850});
 const email=`sketch-${width}@example.test`;
 const challenge=await page.request.post('/api/customer/signin-code',{headers:{Origin:'http://127.0.0.1:4173'},data:{email,name:'Sketch Artist',acceptedRules:true}});expect(challenge.status()).toBe(202);const {requestId}=await challenge.json();
 const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();expect((await page.request.post('/api/customer/verify-code',{headers:{Origin:'http://127.0.0.1:4173'},data:{requestId,code}})).ok()).toBe(true);
 await page.goto('/design-projects.html');
 const create=page.locator('#design-project-form');
 await create.getByLabel('Name shown to makers').fill('Sketch Artist');await create.getByLabel('Design title').fill(`Original sketch ${width}`);
 await create.getByLabel('Tell us what you want made').fill('I drew this original dress and would like help with the pattern and sewing.');await create.getByLabel('Budget range (optional)').fill('$200–$350');
 await create.getByRole('button',{name:'Create private project',exact:true}).click();
 const project=page.locator('#project-list > article').filter({has:page.getByRole('heading',{name:`Original sketch ${width}`,exact:true})});await expect(project).toContainText('Private project');
 const upload=project.getByRole('form',{name:`Upload drawing for Original sketch ${width}`});
 const image=await sharp({create:{width:140,height:200,channels:3,background:'#ffccaa'}}).png().toBuffer();
 await upload.locator('input[type=file]').setInputFiles({name:'my-sketch.png',mimeType:'image/png',buffer:image});await upload.getByRole('checkbox').check();await upload.getByRole('button',{name:'Upload drawing',exact:true}).click();
 await expect(project.getByRole('img')).toHaveCount(1);const imageUrl=await project.getByRole('img').getAttribute('src');
 const makerContext=await browser.newContext({baseURL:'http://127.0.0.1:4173'});const maker=await makerContext.newPage();
 try{
  await maker.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}});
  expect((await maker.request.get(imageUrl)).status()).toBe(404);
  await project.getByRole('button',{name:'Share with makers',exact:true}).click();await expect(project).toContainText('Shared with makers');
  await maker.goto('/design-projects.html#maker-board');await maker.getByRole('button',{name:'Browse shared projects',exact:true}).click();
  const shared=maker.locator('#maker-project-list > article').filter({has:maker.getByRole('heading',{name:`Original sketch ${width}`,exact:true})});await expect(shared.getByRole('img')).toBeVisible();
  await shared.getByRole('textbox').fill('I can draft the pattern and sew a sample. Let us discuss your fabrics and schedule.');await shared.getByRole('button',{name:'I can help make this',exact:true}).click();await expect(shared.getByRole('status')).toContainText('Contact emails are shared only');
  await page.getByRole('button',{name:'Refresh my projects',exact:true}).click();await expect(project).toContainText('I can draft the pattern');await expect(project).not.toContainText('Contact your maker:');
  page.once('dialog',dialog=>dialog.accept());await project.getByRole('button',{name:'Accept & share contact emails',exact:true}).click();await expect(project).toContainText('Contact your maker:');await expect(project).toContainText('Private project');
  await maker.getByRole('button',{name:'Refresh my projects',exact:true}).click();await expect(maker.locator('#maker-offer-list')).toContainText('Contact the creator: '+email);expect((await maker.request.get(imageUrl)).status()).toBe(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-hob-theme',theme),theme);
   const contrast=await page.evaluate(()=>{
    const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const lum=color=>rgb(color).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const bg=lum(getComputedStyle(document.body).backgroundColor);
    return Math.min(...[document.querySelector('h1'),document.querySelector('main > p:not(.eyebrow)')].map(element=>{const fg=lum(getComputedStyle(element).color);return(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);}));
   });
   expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({path:`/tmp/hob-design-project-${width}.png`,fullPage:true});
  page.once('dialog',dialog=>dialog.accept());await project.getByRole('button',{name:'Delete project',exact:true}).click();await expect(project).toHaveCount(0);expect((await maker.request.get(imageUrl)).status()).toBe(404);
 }finally{await makerContext.close();}
});
test('someone who loves sewing can join through the homepage and opt into bringing sketches to life',async({page})=>{
 const email='new-seamstress@example.test',headers={Origin:'http://127.0.0.1:4173'};
 const challenge=await page.request.post('/api/customer/signin-code',{headers,data:{email,name:'Sewing Friend',acceptedRules:true}});expect(challenge.status()).toBe(202);const {requestId}=await challenge.json();
 const {code}=await(await page.request.get('/__test/customer-code?email='+encodeURIComponent(email))).json();expect((await page.request.post('/api/customer/verify-code',{headers,data:{requestId,code}})).ok()).toBe(true);
 await page.goto('/');await page.getByRole('link',{name:/Sign up as a seamstress or tailor/}).click();
 await expect(page.locator('#offer-services')).toHaveAttribute('open','');
 const form=page.locator('#service-profile-form');await form.getByLabel('Name or business name',{exact:true}).fill('Sewing Friend Studio');await form.getByLabel('City, region, or service area',{exact:true}).fill('Columbus, Ohio');await form.getByLabel('About your work',{exact:true}).fill('I love sewing and can help turn original drawings into garments with careful fitting.');
 await form.getByLabel(/Bring sketches to life/).check();await form.getByLabel('Work with designers',{exact:true}).check();await form.getByLabel(/Publish this profile publicly/).check();await form.getByRole('button',{name:'Save service profile',exact:true}).click();await expect(form.getByRole('status')).toHaveText('Service profile saved.');
 expect((await(await page.request.get('/api/my/design-projects')).json()).canBrowse).toBe(true);
 expect((await page.request.get('/api/design-projects')).status()).toBe(200);
});

const {test,expect}=require('@playwright/test');
const sharp=require('sharp');
for(const width of [390,1280])test(`free designer profile saves text and images and opens public page at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
 await page.goto('/account#designer-profile');
 const editor=page.getByRole('region',{name:'Edit public designer profile'});
 await expect(editor).toBeVisible();
 await editor.getByLabel('Brand name',{exact:true}).fill('Profile Test Atelier');
 await editor.getByLabel('About your work',{exact:true}).fill('Independent pieces made with care in our Ohio studio.');
 await editor.getByLabel('Public location',{exact:true}).fill('Columbus, Ohio');
 await editor.getByLabel('How you make your pieces',{exact:true}).fill('Small batch');
 await editor.getByRole('button',{name:'Save public profile',exact:true}).click();
 await expect(editor.getByRole('status')).toContainText('Public profile saved');
 const image=await sharp({create:{width:100,height:100,channels:3,background:'#997799'}}).png().toBuffer();
 for(const label of ['Choose profile photo','Choose brand logo']){
  await editor.getByLabel(label,{exact:true}).setInputFiles({name:'profile.png',mimeType:'image/png',buffer:image});
  if(label==='Choose profile photo'){
   await expect(editor.getByLabel('Circular profile photo preview')).toBeVisible();
   await editor.getByRole('button',{name:'Save photo position',exact:true}).click();
  }
  await expect(editor.getByRole('status')).toContainText('Image saved');
 }
 await editor.getByRole('button',{name:'Adjust photo in bubble',exact:true}).click();
 await editor.getByLabel('Zoom',{exact:true}).fill('2');
 await editor.getByLabel('Vertical position',{exact:true}).fill('20');
 await editor.getByRole('button',{name:'Reset position',exact:true}).click();
 await expect(editor.getByLabel('Zoom',{exact:true})).toHaveValue('1');
 await expect(editor.getByLabel('Vertical position',{exact:true})).toHaveValue('50');
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(editor.getByLabel('Circular profile photo preview')).toHaveCount(0);
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'View my page (opens in a new tab)'}).click();
 const publicPage=await popupPromise;
 await expect(publicPage.getByRole('heading',{name:'Profile Test Atelier',exact:true})).toBeVisible();
 await expect(publicPage.getByText('Independent pieces made with care in our Ohio studio.',{exact:true})).toBeVisible();
 await expect(publicPage.getByAltText('Profile Test Atelier portrait')).toBeVisible();
 await expect(publicPage.getByAltText('Profile Test Atelier logo')).toBeVisible();
 await expect(publicPage.getByRole('region',{name:'Earned designer badges'})).toContainText('Founding Designer');
 expect(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await publicPage.close();
});

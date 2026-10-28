const {test,expect}=require('@playwright/test');
for(const width of [390,1280])test(`try-on garment reference and consent at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');
 await page.evaluate(()=>{const button=houseTryOnButton({id:'preview-fixture',title:'Velvet evening dress',images:[{url:'/favicon.ico',position:0}]});document.body.append(button);button.click();});
 const dialog=page.locator('#house-tryon-dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('#house-tryon-reference strong')).toHaveText('Velvet evening dress');await expect(dialog.locator('#house-tryon-reference p')).toContainText('listing photo');await expect(dialog.locator('#house-tryon-reference img')).toHaveAttribute('src','/favicon.ico');await expect(dialog.locator('#house-tryon-consent')).not.toBeChecked();await expect(dialog.locator('.house-tryon-guidance')).toContainText('Best results');await expect(dialog).not.toContainText('[object');await dialog.locator('#house-tryon-close').click();await expect(dialog).not.toBeVisible();
});

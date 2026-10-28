const {test,expect}=require('@playwright/test');
for(const width of [390,1280])for(const theme of ['light','dark'])test(`outfit choices undo, redo and branch safely at ${width}px in ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.addInitScript(t=>localStorage.setItem('house-of-briar-theme',t),theme);
 await page.goto('/design-projects.html#creator-room');
 await expect(page.locator('#creator-undo')).toBeDisabled();await expect(page.locator('#creator-redo')).toBeDisabled();
 await page.getByRole('button',{name:'Berry & blush',exact:true}).click();await expect(page.locator('#creator-color')).toHaveValue('#87355d');await expect(page.locator('#creator-secondary-color')).toHaveValue('#e6b4c8');
 await page.getByLabel('Sleeves',{exact:true}).selectOption('Long');
 await page.locator('#creator-undo').click();await expect(page.getByLabel('Sleeves',{exact:true})).toHaveValue('Short');await expect(page.locator('#creator-color')).toHaveValue('#87355d');
 await page.locator('#creator-undo').click();await expect(page.locator('#creator-color')).toHaveValue('#b7d9cc');await expect(page.locator('#creator-undo')).toBeDisabled();
 await page.locator('#creator-redo').click();await expect(page.getByRole('button',{name:'Berry & blush',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Jade & cream',exact:true}).click();await expect(page.locator('#creator-redo')).toBeDisabled();
 await page.getByRole('button',{name:'Review & save design',exact:true}).click();await expect(page.locator('#project-details')).toHaveValue(/Preview color: #216650/);await expect(page.locator('#creator-include-preview')).toBeEnabled();
 await page.locator('#creator-include-preview').check();await page.locator('#creator-undo').click();await expect(page.locator('#creator-include-preview')).toBeDisabled();await expect(page.locator('#creator-include-preview')).not.toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('history restores avatars locally without restoring image consent',async({page})=>{
 let posts=0;page.on('request',r=>{if(r.method()==='POST')posts++;});await page.goto('/design-projects.html');
 const image=await require('sharp')({create:{width:90,height:160,channels:4,background:'#dd8666'}}).png().toBuffer();
 await page.getByLabel('Upload your avatar image',{exact:true}).setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:image});await expect(page.locator('#creator-avatar-status')).toContainText('Avatar added locally');
 await page.locator('.creator-concept-panel summary').click();await page.locator('#creator-concept-consent').check();await page.getByRole('button',{name:'Remove avatar',exact:true}).click();
 await page.locator('#creator-undo').click();await expect(page.locator('#creator-preview image')).toHaveCount(1);await expect(page.locator('#creator-concept-consent')).not.toBeChecked();expect(posts).toBe(0);
 await page.reload();await expect(page.locator('#creator-preview image')).toHaveCount(0);await expect(page.locator('#creator-undo')).toBeDisabled();
});
for(const theme of ['light','dark'])test(`designer invitation text remains readable in ${theme}`,async({page})=>{
 await page.addInitScript(t=>localStorage.setItem('house-of-briar-theme',t),theme);await page.goto('/');
 const ratios=await page.locator('#designers-wanted h2,#designers-wanted p').evaluateAll(elements=>elements.map(el=>{const lum=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>(n/=255)<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);let paper='';for(let p=el;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){paper=c;break;}}const a=lum(getComputedStyle(el).color),b=lum(paper);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
 expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});

test('copy includes current fabric choices and rejects unsafe fabric links',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/design-projects.html');
 await page.getByRole('button',{name:'Jade & cream',exact:true}).click();await page.getByLabel('Fabric name and notes',{exact:true}).fill('Cotton twill');await page.getByLabel('Fabric product link',{exact:true}).fill('https://example.com/fabric');
 await page.getByRole('button',{name:'Copy design brief',exact:true}).click();await expect(page.locator('#creator-status')).toContainText('Design brief copied');
 const text=await page.evaluate(()=>navigator.clipboard.readText());expect(text).toContain('Cotton twill');expect(text).toContain('Preview color: #216650');expect(text).toContain('https://example.com/fabric');
 await page.getByLabel('Fabric product link',{exact:true}).fill('http://example.com/fabric');await page.getByRole('button',{name:'Copy design brief',exact:true}).click();await expect(page.locator('#creator-status')).toContainText('secure https://');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(text);
});

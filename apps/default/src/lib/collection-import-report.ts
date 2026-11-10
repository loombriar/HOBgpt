export type ImportCandidate = {name:string;description:string;price:number|null;sizes:string;colors:string;sku?:string;imageUrls?:string[]};
export type ImportIssue = {row:number;name:string;problems:string[]};
const normalize = (value:string) => value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase();
const urls = (value:string) => value.split(',').map(s=>s.trim()).filter(Boolean);
export function collectionImportReport(text:string, garments:ImportCandidate[]) {
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const headers=(lines[0]||'').split(' | ').map(x=>x.trim().toLowerCase());
  const col=(names:string[])=>names.map(n=>headers.indexOf(n)).find(i=>i>=0)??-1;
  const nameCol=col(['name','product name','title','garment name']);
  if(nameCol<0)return {supported:false,sourceCount:0,matched:0,issues:[] as ImportIssue[],truncated:false};
  const priceCol=col(['sale_price','base_price','price','retail price']);
  const descriptionCol=col(['short_description','description','product description']);
  const colorCol=col(['colour','color','colors','colours']);
  const sizeCol=col(['size','sizes']);
  const skuCol=col(['sku']);
  const imageCol=col(['image_urls','image urls','images']);
  const bySku=new Map<string,number[]>();
  const byName=new Map<string,number[]>();
  garments.forEach((g,i)=>{
    const sku=normalize(g.sku||''),name=normalize(g.name);
    if(sku)bySku.set(sku,[...(bySku.get(sku)||[]),i]);
    byName.set(name,[...(byName.get(name)||[]),i]);
  });
  const used=new Set<number>(),seenSku=new Set<string>(),seenName=new Set<string>();
  const issues:ImportIssue[]=[];
  let matched=0,sourceCount=0;
  lines.slice(1).forEach((line,index)=>{
    const cells=line.split(' | ');
    const name=(cells[nameCol]||'').trim();
    if(!name)return;
    sourceCount++;
    const key=normalize(name),sku=skuCol>=0?normalize(cells[skuCol]||''):'';
    const problems:string[]=[];
    if(seenName.has(key))problems.push('Duplicate product name in source');
    seenName.add(key);
    if(skuCol>=0){
      if(!sku)problems.push('Missing SKU in source');
      else if(seenSku.has(sku))problems.push('Duplicate SKU in source');
      seenSku.add(sku);
    }
    // When SKU is provided it is authoritative: never silently match a different SKU by name.
    const candidates=skuCol>=0 && sku ? bySku.get(sku)||[] : byName.get(key)||[];
    const matches=candidates.filter(i=>!used.has(i));
    if(matches.length>1)problems.push('Ambiguous matching private review entries');
    const draftIndex=matches.length===1?matches[0]:undefined;
    if(draftIndex===undefined)problems.push('Missing or ambiguous in private review');
    else {
      used.add(draftIndex); matched++;
      const draft=garments[draftIndex];
      if(normalize(draft.name)!==key)problems.push('Name differs from source SKU');
      if(skuCol>=0 && normalize(draft.sku||'')!==sku)problems.push('SKU differs from source');
      if(priceCol>=0){
        const raw=(cells[priceCol]||'').replace(/[$,]/g,'').trim();
        const price=raw&&/^\d+(?:\.\d{1,2})?$/.test(raw)?Number(raw):null;
        if(price===null)problems.push('Source price missing or unrecognized');
        else if(draft.price===null||Math.abs(draft.price-price)>0.001)problems.push('Price differs from source');
      }
      if(descriptionCol>=0 && normalize(cells[descriptionCol]||'')!==normalize(draft.description))problems.push('Description differs from source');
      if(colorCol>=0 && normalize(cells[colorCol]||'')!==normalize(draft.colors))problems.push('Color differs from source');
      if(sizeCol>=0 && normalize(cells[sizeCol]||'')!==normalize(draft.sizes))problems.push('Size differs from source');
      if(imageCol>=0){
        const sourceUrls=urls(cells[imageCol]||'');
        const draftUrls=draft.imageUrls||[];
        if(sourceUrls.length!==draftUrls.length)problems.push('Image URL count differs from source');
        if(sourceUrls.length===draftUrls.length && sourceUrls.some((url,i)=>url!==draftUrls[i]))problems.push('Image URLs differ from source');
      }
    }
    if(problems.length)issues.push({row:index+2,name,problems});
  });
  garments.forEach((draft,i)=>{if(!used.has(i))issues.push({row:0,name:draft.name,problems:['Private review entry has no matching source row']});});
  return {supported:true,sourceCount,matched,issues,truncated:sourceCount>300};
}

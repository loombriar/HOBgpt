export type ImportCandidate = {name:string;description:string;price:number|null;sizes:string;colors:string};
export type ImportIssue = {row:number;name:string;problems:string[]};
const normalize = (value:string) => value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase();
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
  const byName=new Map<string,ImportCandidate[]>();
  garments.forEach(g=>{const key=normalize(g.name);byName.set(key,[...(byName.get(key)||[]),g]);});
  const seen=new Set<string>();
  const issues:ImportIssue[]=[];
  let matched=0,sourceCount=0;
  lines.slice(1).forEach((line,index)=>{
    const cells=line.split(' | ');
    const name=(cells[nameCol]||'').trim();
    if(!name)return;
    sourceCount++;
    const key=normalize(name), problems:string[]=[];
    if(seen.has(key))problems.push('Duplicate product name in source');
    seen.add(key);
    const candidates=byName.get(key)||[];
    const draft=candidates.shift();
    if(!draft)problems.push('Missing from private review');
    else {
      matched++;
      if(priceCol>=0){
        const raw=(cells[priceCol]||'').replace(/[$,]/g,'').trim();
        const price=raw&&/^\d+(?:\.\d{1,2})?$/.test(raw)?Number(raw):null;
        if(price===null)problems.push('Source price missing or unrecognized');
        else if(draft.price===null||Math.abs(draft.price-price)>0.001)problems.push('Price differs from source');
      }
      if(descriptionCol>=0 && normalize(cells[descriptionCol]||'')!==normalize(draft.description))problems.push('Description differs from source');
      if(colorCol>=0 && normalize(cells[colorCol]||'')!==normalize(draft.colors))problems.push('Color differs from source');
      if(sizeCol>=0 && normalize(cells[sizeCol]||'')!==normalize(draft.sizes))problems.push('Size differs from source');
    }
    if(problems.length)issues.push({row:index+2,name,problems});
  });
  return {supported:true,sourceCount,matched,issues,truncated:sourceCount>=300 && garments.length<=300};
}

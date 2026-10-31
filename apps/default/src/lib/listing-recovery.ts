// Recover unfinished new listing text only. Never persist photos, credentials or consent.
const defaults = {
  name:'', price:'', description:'', garmentMeasurements:'', fitNotes:'', materials:'', careInstructions:'',
  aesthetic:'', seoTitle:'', seoDescription:'', seoTags:'', shareImageUrl:'', handlingMin:'', handlingMax:'',
  internationalShipping:false, sku:'', stockQuantity:'1', lowStockThreshold:'1', category:'', style:'',
  stockPlacement:'floor' as 'floor'|'backstock', pieceType:'One of a Kind' as 'One of a Kind'|'Limited Quantity'|'Made to Order', step:0,
};
export type ListingRecovery = typeof defaults;
export function readListingRecovery(raw:string|null):ListingRecovery|null {
  if(!raw)return null;
  try {
    const input=JSON.parse(raw);
    if(!input||input.version!==1||!input.values||typeof input.values!=='object')return null;
    const values={...defaults};
    for(const key of Object.keys(defaults) as Array<keyof ListingRecovery>) {
      const value=input.values[key];
      if(typeof value!==typeof defaults[key])return null;
      if(typeof value==='string'&&value.length>20000)return null;
      Object.assign(values,{[key]:value});
    }
    if(!Number.isInteger(values.step)||values.step<0||values.step>4)return null;
    if(!['floor','backstock'].includes(values.stockPlacement)||!['One of a Kind','Limited Quantity','Made to Order'].includes(values.pieceType))return null;
    return values;
  }catch{return null;}
}
export function writeListingRecovery(storage:Pick<Storage,'setItem'|'removeItem'>,key:string,values:ListingRecovery) {
  const hasContent=['name','price','description','garmentMeasurements','fitNotes','materials','careInstructions','aesthetic','seoTitle','seoDescription','seoTags','shareImageUrl','handlingMin','handlingMax','sku','style'].some(field=>String(values[field as keyof ListingRecovery]).trim());
  if(!hasContent){storage.removeItem(key);return;}
  storage.setItem(key,JSON.stringify({version:1,values}));
}

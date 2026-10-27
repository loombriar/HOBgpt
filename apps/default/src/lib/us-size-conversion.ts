export type SizeSystem = 'US'|'UK'|'EU'|'International';
export type SizeCategory = 'women'|'men';
export type SizeSuggestion = {label:string;source:string;note:string};

// These conversions are labelled approximations, not measurements or fit guarantees.
const womensUS=[0,2,4,6,8,10,12,14,16,18,20,22,24];
export function convertLabelToUS(raw:string,system:SizeSystem,category:SizeCategory):SizeSuggestion|null {
  const value=raw.trim().toUpperCase().replace(/^(?:SIZE\s*)/,'');
  if(!value)return null;
  if(system==='International'){
    const map:Record<string,string>={XXS:'00–0',XS:'0–2',S:'4–6',M:'8–10',L:'12–14',XL:'16–18',XXL:'20–22', '2XL':'20–22',XXXL:'24–26','3XL':'24–26'};
    return map[value]?{label:map[value],source:raw,note:'Approximate US size range; check the maker’s chart and garment measurements.'}:null;
  }
  const numeric=Number(value);
  if(!Number.isInteger(numeric)||numeric<0||numeric>80)return null;
  if(system==='US')return {label:String(numeric),source:raw,note:'Entered US label; verify garment measurements.'};
  if(category==='men'){
    if(system==='UK')return {label:String(numeric),source:raw,note:'Men’s UK/US numeric labels often match; confirm the garment type and maker’s chart.'};
    return null; // EU men's conversion depends on garment type.
  }
  const us=system==='UK'?numeric-4:system==='EU'?numeric-32:NaN;
  if(!womensUS.includes(us))return null;
  return {label:String(us),source:raw,note:'Approximate women’s US conversion; brands and garment types differ.'};
}

export function formatUSSizeSuggestion(suggestion:SizeSuggestion,system:SizeSystem):string{
  return 'Approximate US size '+suggestion.label+' (from '+system+' '+suggestion.source+'). '+suggestion.note;
}

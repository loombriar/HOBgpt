type Badge = {type:string;label:string};
export default function DesignerBadges({badges=[]}:{badges?:Badge[]}) {
 if(!badges.length)return null;
 const unique=badges.filter((badge,index)=>badges.findIndex(other=>other.type===badge.type)===index);
 return <section aria-label="Earned designer badges" className="mt-5"><h2 className="text-sm font-semibold">Earned badges</h2><ul className="mt-3 flex flex-wrap gap-3">{unique.map(badge=><li key={badge.type} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold">{badge.type==='founding_designer'&&<img src="/founding-designer-berry-v1.webp" alt="" className="size-10 rounded-full"/>}{badge.label}</li>)}</ul></section>;
}

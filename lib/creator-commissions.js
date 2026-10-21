'use strict';
const STANDARD_BPS=700;
const FOUNDING_BPS=500;
function studentDiscountExpiresAt(assignedAt) {
  const start=new Date(assignedAt);
  if(!Number.isFinite(start.getTime()))throw new Error('Invalid student activation date');
  const year=start.getUTCFullYear()+1;
  const month=start.getUTCMonth();
  const day=Math.min(start.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return new Date(Date.UTC(year,month,day,start.getUTCHours(),start.getUTCMinutes(),start.getUTCSeconds(),start.getUTCMilliseconds())).toISOString();
}
function commissionBasisPoints(db,designerId,at=new Date()) {
  if(!designerId)throw new Error('Designer required');
  const when=at instanceof Date?at:new Date(at);
  if(!Number.isFinite(when.getTime()))throw new Error('Invalid checkout time');
  const generalFounder=db.prepare('SELECT founder_number FROM founding_creator_assignments WHERE creator_id=?').get(designerId);
  if(generalFounder)return FOUNDING_BPS;
  const student=db.prepare('SELECT assigned_at FROM founding_school_commissions WHERE creator_id=?').get(designerId);
  return student&&when.toISOString()<studentDiscountExpiresAt(student.assigned_at)?FOUNDING_BPS:STANDARD_BPS;
}
function platformCommissionCents(merchandiseCents,basisPoints) {
  if(!Number.isSafeInteger(merchandiseCents)||merchandiseCents<0)throw new Error('Invalid merchandise subtotal');
  if(![FOUNDING_BPS,STANDARD_BPS].includes(basisPoints))throw new Error('Invalid commission rate');
  return Math.round(merchandiseCents*basisPoints/10000);
}
module.exports={STANDARD_BPS,FOUNDING_BPS,studentDiscountExpiresAt,commissionBasisPoints,platformCommissionCents};

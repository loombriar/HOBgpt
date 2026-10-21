'use strict';
const STANDARD_BPS=700;
const FOUNDING_BPS=500;
function commissionBasisPoints(db,designerId){
  if(!designerId)throw new Error('Designer required');
  const assignment=db.prepare('SELECT rate_basis_points FROM founding_school_commissions WHERE creator_id=?').get(designerId);
  const bps=assignment?.rate_basis_points ?? STANDARD_BPS;
  if(!Number.isInteger(bps)||![FOUNDING_BPS,STANDARD_BPS].includes(bps))throw new Error('Invalid commission assignment');
  return bps;
}
function platformCommissionCents(merchandiseCents,basisPoints){
  if(!Number.isSafeInteger(merchandiseCents)||merchandiseCents<0)throw new Error('Invalid merchandise subtotal');
  if(![FOUNDING_BPS,STANDARD_BPS].includes(basisPoints))throw new Error('Invalid commission rate');
  return Math.round(merchandiseCents*basisPoints/10000);
}
module.exports={STANDARD_BPS,FOUNDING_BPS,commissionBasisPoints,platformCommissionCents};

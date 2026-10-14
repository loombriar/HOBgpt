import {expect,it} from 'vitest';
import {estimateDesignerEarnings} from './DesignerPricingHelper';
it('deducts the marketplace fee and private delivery costs',()=>{expect(estimateDesignerEarnings('100','8','2')).toEqual({fee:900,earnings:9100,remaining:8100});});
it('matches checkout rounding and leaves negative estimates visible',()=>{expect(estimateDesignerEarnings('89.99','100','')).toEqual({fee:810,earnings:8189,remaining:-1811});});
it('requires a positive price and rejects invalid costs',()=>{for(const value of ['','-1','NaN','Infinity','10.001'])expect(estimateDesignerEarnings(value,'','')).toBeNull();expect(estimateDesignerEarnings('10','-2','')).toBeNull();});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShippingSummary from './ShippingSummary';
import {dispatchEstimate, type ShippingQuote} from '@/lib/shipping';
const quote:ShippingQuote={shippingReady:true,shippingCents:795,merchandiseCents:6000,totalBeforeTaxCents:6795,discountCents:0,designers:[{designerId:'a',designerName:'Atelier A',shippingCents:795,shippingReady:true}],items:[{id:'a1',title:'Moon skirt',handlingDaysMin:2,handlingDaysMax:4}]};
describe('shipping disclosure',()=>{
  it('shows exact cents, designer charges and preparation separately from transit',()=>{
    const html=renderToStaticMarkup(<ShippingSummary quote={quote}/>);
    expect(html).toContain('$7.95');expect(html).toContain('$67.95');expect(html).toContain('Atelier A');expect(html).toContain('2–4 business days');expect(html).toContain('excludes carrier transit');expect(html).toContain('Tax calculation is not enabled');expect(html).toContain('/shipping.html');
  });
  it('distinguishes explicitly free shipping from a missing rate',()=>{
    expect(renderToStaticMarkup(<ShippingSummary quote={{...quote,designers:[{...quote.designers[0],shippingCents:0}]}}/>)).toContain('Free shipping');
    const html=renderToStaticMarkup(<ShippingSummary quote={{...quote,shippingReady:false,totalBeforeTaxCents:null,designers:[{...quote.designers[0],shippingReady:false}]}}/>);
    expect(html).toContain('checkout unavailable');expect(html).not.toContain('Total before tax:');
  });
  it('keeps zero-day preparation and missing or partial estimates accurate',()=>{
    expect(dispatchEstimate(0,0)).toContain('0 business days');expect(dispatchEstimate(null,null)).toContain('not provided');expect(dispatchEstimate(null,4)).toContain('Up to 4');expect(dispatchEstimate(2,null)).toContain('At least 2');
  });
});

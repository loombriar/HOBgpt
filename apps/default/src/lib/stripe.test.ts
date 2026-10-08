import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelCheckoutOrder, createCheckoutSession, verifyCheckoutSession } from './stripe';

describe('checkout API regression safeguards', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sends only server-authoritative listing identifiers, quantities, gift notes and codes', async () => {
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({url:'https://checkout.stripe.com/test'})} as Response);
    const url=await createCheckoutSession([{id:'listing-1',name:'Untrusted title',amount:1,quantity:1,giftNote:'Happy birthday'}], 'token', ['DESIGNER10'], 12500);
    expect(url).toBe('https://checkout.stripe.com/test');
    const [path,options]=vi.mocked(fetch).mock.calls[0];
    expect(path).toBe('/api/checkout/session');
    expect(options?.method).toBe('POST');
    expect((options?.headers as Record<string,string>).Authorization).toBe('Bearer token');
    expect(JSON.parse(String(options?.body))).toEqual({items:[{id:'listing-1',quantity:1,giftNote:'Happy birthday'}],promoCodes:['DESIGNER10'],expectedTotalBeforeTaxCents:12500});
  });

  it('rejects checkout links missing from successful API responses', async () => {
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({})} as Response);
    await expect(createCheckoutSession([{id:'piece',name:'Piece',amount:99}])).rejects.toThrow('Stripe did not return a checkout link.');
  });

  it('surfaces safe API errors when checkout session creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ok:false,json:async()=>({error:{message:'Listing is no longer available.'}})} as Response);
    await expect(createCheckoutSession([{id:'sold',name:'Sold',amount:99}])).rejects.toThrow('Listing is no longer available.');
  });

  it('refuses invalid receipt references without calling the server', async () => {
    await expect(verifyCheckoutSession('not-a-stripe-session')).rejects.toThrow('not valid');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks Stripe payment status without assuming the return URL means paid', async () => {
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({paid:false,orderId:'order-1',status:'open'})} as Response);
    await expect(verifyCheckoutSession('cs_test_123')).resolves.toMatchObject({paid:false});
    expect(fetch).toHaveBeenCalledWith('/api/checkout/session/cs_test_123',expect.any(Object));
  });

  it('does not attempt cancellation without both order ID and cancellation token', async () => {
    await cancelCheckoutOrder('', 'token');
    await cancelCheckoutOrder('order-1', '');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses a cancellation token only in the request header', async () => {
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({status:'canceled'})} as Response);
    await cancelCheckoutOrder('order/1','private-token');
    const [url,options]=vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/checkout/cancel/order%2F1');
    expect((options?.headers as Record<string,string>)['X-Checkout-Cancel-Token']).toBe('private-token');
  });
});

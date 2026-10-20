import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import DesignerSetupChecklist from './DesignerSetupChecklist';
const base={profileReady:false,hasListing:false,hasPendingPiece:false,termsAccepted:false,paymentReady:false,paymentConnected:false,hasApprovedPiece:false,busy:false,error:'',onPaymentSetup:()=>{},onRefresh:()=>{}};
it('shows clear next actions and explains private drafts',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base}/>);
 expect(html).toContain('Review and accept terms');expect(html).toContain('Set up payments');expect(html).toContain('You cover postage');expect(html).toContain('drafts stay private');expect(html).not.toContain('>Selling setup complete<');
});
it('requires both current terms and verified payment setup for ready status',()=>{
 expect(renderToStaticMarkup(<DesignerSetupChecklist {...base} paymentReady={true}/>)).not.toContain('>Selling setup complete<');
 expect(renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true}/>)).not.toContain('>Selling setup complete<');
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true} paymentReady={true} hasListing hasApprovedPiece/>);
 expect(html).toContain('>Selling setup complete<');expect(html).toContain('4 of 4 required');expect(html).toContain('stock is available');
});
it('never claims readiness when verification fails or is still loading',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true} paymentReady={null} error="Please try again."/>);
 expect(html).toContain('Checking your setup');expect(html).toContain('role="alert"');expect(html).not.toContain('>Selling setup complete<');
});

it('does not confuse an account ready for payments with an approved first piece',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted paymentReady hasListing hasPendingPiece/>);
 expect(html).toContain('Account ready');expect(html).toContain('awaiting review');expect(html).not.toContain('>Selling setup complete<');expect(html).toContain('3 of 4 required');
});

it('groups setup into four milestones while preserving both required payout checks',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base}/>);
 expect((html.match(/<h3 /g)||[])).toHaveLength(4);
 expect(html).toContain('2. Connect your payouts');
 expect(html).toContain('3. List your first piece');
 expect(html).toContain('4. Get ready to sell');
 expect(html).toContain('Delivery terms: Action needed');
 expect(html).toContain('Stripe verification: Action needed');
 const verified=renderToStaticMarkup(<DesignerSetupChecklist {...base} paymentReady/>);
 expect(verified).toContain('Delivery terms: Action needed');
 expect(verified).toContain('Stripe verification: Complete');
 expect(verified).not.toContain('>Selling setup complete<');
});

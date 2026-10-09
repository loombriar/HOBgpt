import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import DesignerSetupChecklist from './DesignerSetupChecklist';
const base={termsAccepted:false,paymentReady:false,paymentConnected:false,hasApprovedPiece:false,busy:false,error:'',onPaymentSetup:()=>{},onRefresh:()=>{}};
it('shows clear next actions and explains private drafts',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base}/>);
 expect(html).toContain('Review and accept terms');expect(html).toContain('Set up payments');expect(html).toContain('You cover postage');expect(html).toContain('drafts stay private');expect(html).not.toContain('>Ready to sell<');
});
it('requires both current terms and verified payment setup for ready status',()=>{
 expect(renderToStaticMarkup(<DesignerSetupChecklist {...base} paymentReady={true}/>)).not.toContain('>Ready to sell<');
 expect(renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true}/>)).not.toContain('>Ready to sell<');
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true} paymentReady={true}/>);
 expect(html).toContain('>Ready to sell<');expect(html).toContain('2 of 2');expect(html).toContain('approval is required');
});
it('never claims readiness when verification fails or is still loading',()=>{
 const html=renderToStaticMarkup(<DesignerSetupChecklist {...base} termsAccepted={true} paymentReady={null} error="Please try again."/>);
 expect(html).toContain('Checking your setup');expect(html).toContain('role="alert"');expect(html).not.toContain('>Ready to sell<');
});

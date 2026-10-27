import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AcceptedPayments from './AcceptedPayments';
it('shows compact payment logos with accessible eligibility text',()=>{const html=renderToStaticMarkup(<AcceptedPayments compact/>);for(const name of ['Visa','Mastercard','American Express','Apple Pay','Google Pay'])expect(html).toContain(`alt="${name}"`);expect(html).not.toContain('Ways to pay');expect(html).not.toContain('Donations only');expect(html).toContain('depend on your device');});

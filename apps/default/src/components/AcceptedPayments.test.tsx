import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AcceptedPayments from './AcceptedPayments';
it('shows familiar enabled payment names and separates PayPal donations',()=>{const html=renderToStaticMarkup(<AcceptedPayments/>);for(const name of ['Apple Pay','Google Pay','Cash App Pay','Klarna','Afterpay','PayPal donations only'])expect(html).toContain(name);expect(html).not.toContain('Affirm');expect(html).toContain('depend on your device');});

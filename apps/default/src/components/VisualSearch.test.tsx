import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import VisualSearch from './VisualSearch';
import HouseSupportAgent from './HouseSupportAgent';
describe('customer AI controls',()=>{
 it('makes photo consent, cloud processing and clearing accessible',()=>{const html=renderToStaticMarkup(<MemoryRouter><VisualSearch token="buyer"/></MemoryRouter>);expect(html).toContain('Send this photo to OpenAI');expect(html).toContain('Clear photo and results');expect(html).toContain('House does not save');expect(html).toContain('disabled');expect(html).toContain('exact matches and fit are not guaranteed');});
 it('requires sign-in for photo search and offers ordinary text search',()=>{const html=renderToStaticMarkup(<MemoryRouter><VisualSearch token=""/></MemoryRouter>);expect(html).toContain('Sign in');expect(html).toContain('text search below');});
 it('separates support processing consent from permission to open a ticket',()=>{const html=renderToStaticMarkup(<HouseSupportAgent token="buyer"/>);expect(html).toContain('Send my question and relevant order summary to OpenAI');expect(html).toContain('Allow the assistant to open a House support ticket');expect(html).toContain('Refunds, payouts and account changes require human help');expect(html).toContain('disabled');});
});

import {expect,it} from 'vitest';import {renderToStaticMarkup} from 'react-dom/server';import AdminEmailStatus from './AdminEmailStatus';
it('shows retries without claiming inbox delivery',()=>{const html=renderToStaticMarkup(<AdminEmailStatus onRefresh={()=>{}} data={{configured:true,counts:{pending:1,failed:1,sent:0},messages:[{id:'1',subject:'Order confirmation',status:'failed',attempts:2,nextAttemptAt:'2026-10-09T00:00:00Z',createdAt:'2026-10-09T00:00:00Z',sentAt:null}]}}/>);expect(html).toContain('Failed — retry scheduled');expect(html).toContain('2 attempt');expect(html).toContain('not that it reached an inbox');});

it('distinguishes paused invalid messages from scheduled retries',()=>{
 const html=renderToStaticMarkup(<AdminEmailStatus onRefresh={()=>{}} data={{configured:true,counts:{pending:0,failed:1,sent:0},messages:[{id:'invalid',subject:'Invalid notification',status:'failed',attempts:1,retryBlocked:true,nextAttemptAt:null,createdAt:'2026-11-11T00:00:00Z',sentAt:null}]}}/>);
 expect(html).toContain('Failed — review required');
 expect(html).toContain('Automatic retries paused.');
 expect(html).not.toContain('Failed — retry scheduled');
 expect(html).not.toContain('Next send attempt:');
 expect(html).not.toContain('Invalid Date');
});

import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {StudioDashboard,ListingStatusTabs,type StudioSummary} from './StudioDashboard';
const counts={Active:2,Draft:1,Expired:0,'Sold Out':1,Inactive:3};
describe('Designer Studio overview',()=>{
 it('shows all listing counts and confirms the selected filter',()=>{const html=renderToStaticMarkup(<ListingStatusTabs counts={counts} selected="Inactive" onSelect={()=>{}}/>);for(const status of Object.keys(counts))expect(html).toContain(status);expect(html).toContain('display only inactive listings');expect(html).toContain('aria-pressed="true"');expect(html).toContain('All <strong>7</strong>');});
 it('links orders, limited item requests, alerts and shared access, with truthful analytics labels',()=>{const summary:StudioSummary={counts,ordersCount:105,orders:[],messages:4,items:[],views:{events:12,sessions:5,days:30}};const html=renderToStaticMarkup(<StudioDashboard summary={summary} selected="All" onSelect={()=>{}}/>);for(const id of ['orders','designer-item-requests','messages','shared-access'])expect(html).toContain(`href="#${id}"`);expect(html).toContain('105');expect(html).toContain('not verified people');expect(html).toContain('last 30 days');});
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DesignerNotifications from './DesignerNotifications';

describe('Designer Studio notification surface', () => {
  it('renders operational destinations, unread controls and House notices', () => {
    const html = renderToStaticMarkup(<DesignerNotifications unread={2} onRead={()=>{}} onReadAll={()=>{}} onRefresh={()=>{}} items={[
      {id:'sale',type:'shipping_needed',title:'Shipment needed',body:'Add tracking',actionPath:'/account#orders',createdAt:'2026-10-06T00:00:00Z',priority:'important'},
      {id:'stock',type:'low_stock',title:'Low stock',body:'One available',actionPath:'/account#products',createdAt:'2026-10-06T00:00:00Z'},
      {id:'house',type:'house_notice',title:'House notice',body:'Private notice',actionPath:'/account#messages',createdAt:'2026-10-06T00:00:00Z',source:'admin',adminLabel:'House of Briar'},
    ]}/>);
    expect(html).toContain('id="messages"');
    for(const target of ['orders','products','messages']) expect(html).toContain(`href="/account#${target}"`);
    expect(html).toContain('2 unread');
    expect(html).toContain('Mark all read');
    expect(html).toContain('important');
    expect(html).toContain('Private notice');
  });
  it('renders an empty inbox without requiring a notification', () => {
    const html = renderToStaticMarkup(<DesignerNotifications items={[]} unread={0} onRead={()=>{}} onReadAll={()=>{}} onRefresh={()=>{}}/>);
    expect(html).toContain('Sales, shipping steps, inventory alerts');
    expect(html).toContain('disabled');
  });
});

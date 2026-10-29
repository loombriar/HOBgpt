import { expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DesignerBadges from './DesignerBadges';
it('shows every server-awarded badge once without exposing award source details',()=>{
 const html=renderToStaticMarkup(<DesignerBadges badges={[{type:'supporter',label:'House Supporter'},{type:'verified_buyer',label:'Verified Buyer'},{type:'founding_designer',label:'Founding Designer'},{type:'supporter',label:'House Supporter'}]}/>);
 expect(html).toContain('House Supporter');expect(html).toContain('Verified Buyer');expect(html).toContain('Founding Designer');
 expect(html.match(/House Supporter/g)).toHaveLength(1);
 expect(html).toContain('Earned designer badges');
});
it('does not invent badges for a profile with none',()=>{expect(renderToStaticMarkup(<DesignerBadges/>)).toBe('');});

import {describe,it,expect,vi,afterEach} from 'vitest';
import {validateHouseSession} from './house-auth';
afterEach(()=>vi.unstubAllGlobals());
describe('House credential bridge',()=>{
 it('keeps anonymous and server-rejected credentials unauthenticated',async()=>{const request=vi.fn(async()=>new Response('{}',{status:401}));expect(await validateHouseSession('',request)).toBeNull();expect(request).not.toHaveBeenCalled();expect(await validateHouseSession('rejected',request)).toBeNull();expect(request.mock.calls[0][0]).toBe('/api/my/designer-profile');});
 it('uses server-verified identity and sends the credential only to the House endpoint',async()=>{vi.stubGlobal('window',{location:{origin:'https://houseofbriar.shop'}});const request=vi.fn(async()=>new Response(JSON.stringify({designer:{id:'maker',status:'active',email:'maker@example.test',displayName:'Maker'}})));const user=await validateHouseSession('private-test-token',request);expect(user?.profile.sub).toBe('maker');expect(user?.access_token).toBe('private-test-token');expect(request.mock.calls[0][0]).toBe('/api/my/designer-profile');expect(request.mock.calls[0][1]?.headers).toEqual({Authorization:'Bearer private-test-token'});});
 it('rejects an inactive profile even if a provider mistakenly returns HTTP 200',async()=>{expect(await validateHouseSession('token',async()=>new Response(JSON.stringify({designer:{id:'maker',status:'suspended'}})))).toBeNull();});
});

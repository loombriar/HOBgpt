import {describe,it,expect,vi,afterEach} from 'vitest';
import {validateHouseSession,revokeHouseSessions} from './house-auth';
afterEach(()=>vi.unstubAllGlobals());
it('sign-out revokes both customer and designer sessions on the server',async()=>{
 const request=vi.fn(async()=>new Response('{}'));
 await revokeHouseSessions(request as typeof fetch);
 expect(request.mock.calls.map(call=>call[0])).toEqual(['/api/session','/api/customer/session']);
 for(const call of request.mock.calls)expect(call[1]).toMatchObject({method:'DELETE',credentials:'same-origin'});
});
it('sign-out does not claim success if customer session revocation fails',async()=>{
 const request=vi.fn(async(url:string)=>new Response('{}',{status:url==='/api/customer/session'?503:200}));
 await expect(revokeHouseSessions(request as typeof fetch)).rejects.toThrow('Sign-out could not be completed');
});
describe('House session bridge',()=>{
 it('keeps a rejected cookie session unauthenticated',async()=>{const request=vi.fn(async()=>new Response('{}',{status:401}));expect(await validateHouseSession('',request)).toBeNull();expect(request.mock.calls[0][0]).toBe('/api/my/designer-profile');});
 it('exchanges a legacy credential once, then validates with the HttpOnly cookie',async()=>{vi.stubGlobal('window',{location:{origin:'https://houseofbriar.shop'}});const request=vi.fn(async(url:string)=>url==='/api/session'?new Response(JSON.stringify({ok:true})):new Response(JSON.stringify({designer:{id:'maker',status:'active',email:'maker@example.test',displayName:'Maker'}})));const user=await validateHouseSession('private-test-token',request as typeof fetch);expect(user?.profile.sub).toBe('maker');expect(user?.access_token).toBe('');expect(request.mock.calls[0][0]).toBe('/api/session');expect(request.mock.calls[0][1]?.headers).toEqual({Authorization:'Bearer private-test-token'});expect(request.mock.calls[1][0]).toBe('/api/my/designer-profile');expect(request.mock.calls[1][1]).not.toHaveProperty('headers');});
 it('rejects an inactive profile even when the profile endpoint returns HTTP 200',async()=>{expect(await validateHouseSession('',async()=>new Response(JSON.stringify({designer:{id:'maker',status:'suspended'}})))).toBeNull();});
});

it('recognizes an email-verified customer session without granting a designer identity',async()=>{vi.stubGlobal('window',{location:{origin:'https://houseofbriar.shop'}});const request=vi.fn(async(url:string)=>url==='/api/my/designer-profile'?new Response('{}',{status:401}):new Response(JSON.stringify({customer:{id:'guest',name:'Guest',email:'guest@example.test'}})));const user=await validateHouseSession('',request as typeof fetch);expect(user?.profile.sub).toBe('customer:guest');expect(user?.access_token).toBe('');});

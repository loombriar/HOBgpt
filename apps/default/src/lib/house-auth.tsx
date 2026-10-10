import { clearHouseCartOnSignOut } from './cart-signout';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AuthContext,type AuthContextProps} from 'react-oidc-context';
import {User,UserManager} from 'oidc-client-ts';

export async function revokeHouseSessions(request:typeof fetch=fetch):Promise<void>{
 for(const endpoint of ['/api/session','/api/customer/session']){
  const response=await request(endpoint,{method:'DELETE',credentials:'same-origin'});
  if(!response.ok)throw new Error('Sign-out could not be completed. Please try again.');
 }
}

export async function validateHouseSession(token='',request:typeof fetch=fetch):Promise<User|null>{
 if(token){
  const exchange=await request('/api/session',{method:'POST',headers:{Authorization:`Bearer ${token}`},cache:'no-store',credentials:'same-origin'});
  if(!exchange.ok)return null;
 }
 const response=await request('/api/my/designer-profile',{cache:'no-store',credentials:'same-origin'});
 if(!response.ok){
  if(![401,403,404].includes(response.status))return null;
  const buyerResponse=await request('/api/customer/session',{cache:'no-store',credentials:'same-origin'});if(!buyerResponse.ok)return null;
  const {customer}=await buyerResponse.json();if(!customer?.id)return null;
  return new User({access_token:'',token_type:'Bearer',profile:{sub:'customer:'+customer.id,email:customer.email||'',name:customer.name||'House guest',iss:window.location.origin,aud:'house',exp:0,iat:0}});
 }
 const {designer}=await response.json();if(!designer?.id||designer.status!=='active')return null;
 return new User({access_token:'',token_type:'Bearer',profile:{sub:designer.id,email:designer.email||'',name:designer.displayName||designer.brandName||designer.id,iss:window.location.origin,aud:'house',exp:0,iat:0}});
}
// House authentication uses a server-managed HttpOnly cookie. A legacy bearer
// credential is accepted only long enough to exchange it for that cookie.
export function HouseAuth({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);
 const version=useRef(0);
 const [manager]=useState(()=>new UserManager({authority:window.location.origin,client_id:'house',redirect_uri:window.location.origin+'/designers/room',automaticSilentRenew:false}));
 useEffect(()=>{let active=true;async function refresh(){const attempt=++version.current;setUser(null);setLoading(true);const token=localStorage.getItem('briarDesignerToken')||sessionStorage.getItem('briarDesignerToken')||'';try{const next=await validateHouseSession(token);if(next){localStorage.removeItem('briarDesignerToken');sessionStorage.removeItem('briarDesignerToken');}if(active&&attempt===version.current)setUser(next);}catch{if(active&&attempt===version.current)setUser(null);}finally{if(active&&attempt===version.current)setLoading(false);}}void refresh();window.addEventListener('storage',refresh);return()=>{active=false;version.current++;window.removeEventListener('storage',refresh);};},[]);
 async function removeUser(){version.current++;await revokeHouseSessions();localStorage.removeItem('briarDesignerToken');sessionStorage.removeItem('briarDesignerToken');clearHouseCartOnSignOut();setUser(null);setLoading(false);}
 async function signinRedirect(){window.location.assign('/designers/room');}
 async function signoutRedirect(){await removeUser();window.location.assign('/');}
 const unsupported=async()=>{throw Error('Use your existing House Designer’s Room to sign in.');};
 const value:AuthContextProps={user,isLoading:loading,isAuthenticated:Boolean(user),settings:manager.settings,events:manager.events,clearStaleState:async()=>{},removeUser,signinRedirect,signoutRedirect,signinPopup:unsupported,signinSilent:async()=>user,signinResourceOwnerCredentials:unsupported,signoutPopup:signoutRedirect,signoutSilent:removeUser,querySessionStatus:async()=>null,revokeTokens:async()=>{},startSilentRenew:()=>{},stopSilentRenew:()=>{}};
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

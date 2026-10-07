import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AuthContext,type AuthContextProps} from 'react-oidc-context';
import {User,UserManager} from 'oidc-client-ts';

export async function validateHouseSession(token:string,request:typeof fetch=fetch):Promise<User|null>{
 if(!token)return null;
 const response=await request('/api/my/designer-profile',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 if(!response.ok)return null;
 const {designer}=await response.json();if(!designer?.id||designer.status!=='active')return null;
 return new User({access_token:token,token_type:'Bearer',profile:{sub:designer.id,email:designer.email||'',name:designer.displayName||designer.brandName||designer.id,iss:window.location.origin,aud:'house',exp:0,iat:0}});
}
// Reuse the existing House credential only after server-side validation. It is
// never sent to Taskade, a gateway, an external auth realm or a URL parameter.
export function HouseAuth({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);
 const version=useRef(0);
 const [manager]=useState(()=>new UserManager({authority:window.location.origin,client_id:'house',redirect_uri:window.location.origin+'/designers/room',automaticSilentRenew:false}));
 useEffect(()=>{let active=true;async function refresh(){const attempt=++version.current;setUser(null);setLoading(true);const token=localStorage.getItem('briarDesignerToken')||sessionStorage.getItem('briarDesignerToken')||'';try{const next=await validateHouseSession(token);if(active&&attempt===version.current)setUser(next);}catch{if(active&&attempt===version.current)setUser(null);}finally{if(active&&attempt===version.current)setLoading(false);}}void refresh();window.addEventListener('storage',refresh);return()=>{active=false;version.current++;window.removeEventListener('storage',refresh);};},[]);
 async function removeUser(){version.current++;localStorage.removeItem('briarDesignerToken');sessionStorage.removeItem('briarDesignerToken');setUser(null);setLoading(false);}
 async function signinRedirect(){window.location.assign('/designers/room');}
 async function signoutRedirect(){await removeUser();window.location.assign('/');}
 const unsupported=async()=>{throw Error('Use your existing House Designer’s Room to sign in.');};
 const value:AuthContextProps={user,isLoading:loading,isAuthenticated:Boolean(user),settings:manager.settings,events:manager.events,clearStaleState:async()=>{},removeUser,signinRedirect,signoutRedirect,signinPopup:unsupported,signinSilent:async()=>user,signinResourceOwnerCredentials:unsupported,signoutPopup:signoutRedirect,signoutSilent:removeUser,querySessionStatus:async()=>null,revokeTokens:async()=>{},startSilentRenew:()=>{},stopSilentRenew:()=>{}};
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

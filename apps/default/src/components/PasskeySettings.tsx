import {useEffect,useRef,useState} from 'react';

type PasskeyClient={mountManage:(host:HTMLElement,kind:'customer'|'designer')=>()=>void};
declare global {interface Window {HousePasskeys?:PasskeyClient;}}
let loading:Promise<void>|undefined;
function loadPasskeys(){
 if(window.HousePasskeys)return Promise.resolve();
 if(!loading)loading=(async()=>{
  for(const [id,src] of [['house-passkey-vendor','/passkey-vendor.js'],['house-passkey-client','/passkey-client.js']]){
   await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.id=id;script.src=src;script.onload=()=>resolve();script.onerror=()=>reject(Error('Passkey controls could not load.'));document.head.append(script);});
  }
 })().catch(error=>{loading=undefined;throw error;});
 return loading;
}
export default function PasskeySettings({kind}:{kind:'customer'|'designer'}){
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true,cleanup:(()=>void)|undefined;void loadPasskeys().then(()=>{if(active&&host.current)cleanup=window.HousePasskeys?.mountManage(host.current,kind);}).catch(()=>{if(active)setError('Passkey settings could not load. You can still sign in by email.');});return()=>{active=false;cleanup?.();};},[kind]);
 return <section aria-label="Passkey settings" className="mb-5 rounded-3xl border border-border bg-card p-5"><div ref={host}/>{error&&<p role="status" className="text-sm">{error}</p>}</section>;
}

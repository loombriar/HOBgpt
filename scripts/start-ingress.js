'use strict';
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const {createIngressProxy}=require('../ingress-proxy');

// Opt-in launcher: public proxy, authenticated backend on loopback only.
// Keep the existing origin, cookies, and webhook URLs on the public port.
const publicPort=Number(process.env.PORT||3000);
if(!Number.isInteger(publicPort)||publicPort<0||publicPort>65535) throw new Error('Invalid public PORT');
const secret=randomBytes(32).toString('hex');
const backend=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{
  env:{...process.env,PORT:'0',HOB_LOOPBACK_BACKEND:'true',INGRESS_HMAC_SECRET:secret},
  stdio:['ignore','inherit','inherit','ipc']
});
let proxy;
let stopping=false;
const startupTimer=setTimeout(()=>{console.error('Backend readiness timed out');stop(1);},60000);
function stop(code=0){
  if(stopping)return;
  stopping=true;
  clearTimeout(startupTimer);
  if(proxy)proxy.close();
  backend.kill('SIGTERM');
  const deadline=setTimeout(()=>{backend.kill('SIGKILL');process.exit(code);},10000);
  backend.once('exit',()=>{clearTimeout(deadline);process.exit(code);});
  if(backend.exitCode!==null||backend.signalCode!==null){clearTimeout(deadline);process.exit(code);}
}
backend.once('error',error=>{console.error('Backend startup failed:',error.message);stop(1);});
backend.once('exit',code=>{if(!stopping){console.error('Backend exited unexpectedly');stop(code||1);}});
backend.once('message',message=>{
  if(message?.type!=='backend-ready'||!Number.isInteger(message.port)||message.port<1||message.port>65535)return stop(1);
  clearTimeout(startupTimer);
  proxy=createIngressProxy({upstream:`http://127.0.0.1:${message.port}`,secret});
  proxy.once('error',error=>{console.error('Ingress startup failed:',error.message);stop(1);});
  proxy.listen(publicPort,'0.0.0.0',()=>{
    console.log(`Authenticated ingress listening on port ${proxy.address().port}; backend is loopback-only`);
    if(process.send)process.send({type:'ingress-ready',port:proxy.address().port,backendPort:message.port});
  });
});
process.on('SIGTERM',()=>stop());
process.on('SIGINT',()=>stop());

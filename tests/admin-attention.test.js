const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function adminAttentionCounts('),source.indexOf('function renderAdminAttention(')),ctx);

test('admin attention distinguishes unshipped paid orders, failures and ordinary payout holds',()=>{
 const operations={orders:[{id:'multi',status:'paid'},{id:'refunded',status:'paid',refund_status:'succeeded'},{id:'pending',status:'pending'}],payouts:[
  {order_id:'multi',status:'pending',tracking_number:'tracked'},
  {order_id:'multi',status:'pending'},
  {order_id:'refunded',status:'pending'},
  {order_id:'pending',status:'pending'},
  {order_id:'failed',status:'failed'},
  {order_id:'error',status:'pending',error_message:'Retry needed'},
  {order_id:'released',status:'paid',error_message:'Historical issue'},
  {order_id:'reversed',status:'failed',stripe_reversal_id:'reversed'}
 ]};
 const counts=ctx.adminAttentionCounts([{status:'pending_review'},{status:'published'}],operations,{messages:[{status:'open'},{status:'auto_replied'},{status:'replied'},{status:'resolved'},{status:'closed'}]});
 assert.equal(counts.approvals,1);assert.equal(counts.shipping,1);assert.equal(counts.payouts,2);assert.equal(counts.support,2);
});

test('unavailable or malformed admin data cannot masquerade as an empty queue',()=>{
 const unknown=ctx.adminAttentionCounts(null,{},{});
 for(const count of Object.values(unknown))assert.equal(count,null);
 const empty=ctx.adminAttentionCounts([],{orders:[],payouts:[]},{messages:[]});
 for(const count of Object.values(empty))assert.equal(count,0);
});

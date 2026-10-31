const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function customerShipmentLabel('),source.indexOf('let customerOrdersRequest=')),context);

test('customer tracking links exclude unpaid, unknown-carrier and simulated shipments',()=>{
 const real={trackingCarrier:'USPS',trackingNumber:'123 & 456',trackingStatus:'in_transit'};
 assert.equal(context.customerShipmentLabel(real,true),'Shipped · In transit');
 assert.equal(context.customerTrackingLink(real,true),'https://tools.usps.com/go/TrackConfirmAction?tLabels=123%20%26%20456');
 assert.equal(context.customerTrackingLink(real,false),null);
 assert.equal(context.customerShipmentLabel(real,false),'Payment not confirmed');
 assert.equal(context.customerTrackingLink({...real,trackingCarrier:'https://untrusted.invalid'},true),null);
 assert.equal(context.customerTrackingLink({...real,trackingNumber:'SHIPPO_TRANSIT'},true),null);
 assert.equal(context.customerTrackingLink({...real,trackingStatus:'test_transit'},true),null);
 assert.equal(context.customerShipmentLabel({...real,trackingNumber:'SHIPPO_TRANSIT'},true),'Simulated tracking · test order');
 assert.equal(context.customerShipmentLabel({},true),'Paid · Awaiting shipment');
});

test('a purchase response arriving after sign-out cannot restore private orders',async()=>{
 let resolve;
 const status={textContent:''},list={children:[],replaceChildren(){this.children=[];}};
 const ctx=vm.createContext({customerSignedIn:true,byId:id=>id==='visitor-orders-status'?status:list,apiRequest:()=>new Promise(r=>resolve=r)});
 vm.runInContext(source.slice(source.indexOf('let customerOrdersRequest='),source.indexOf("byId('visitor-orders-refresh')")),ctx);
 const first=vm.runInContext('refreshCustomerPurchases()',ctx);
 ctx.customerSignedIn=false;
 await vm.runInContext('refreshCustomerPurchases()',ctx);
 resolve({orders:[{id:'private-order',items:[]}]});await first;
 assert.equal(status.textContent,'Sign in to see your purchases.');
 assert.deepEqual(list.children,[]);
});

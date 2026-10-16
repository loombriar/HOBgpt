const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function designerListingGroup('),source.indexOf('let designerListingsLoad =')),context);

test('designer groups distinguish approval, sold inventory, reservations and made-to-order stock',()=>{
 const published={status:'published',moderationStatus:'approved',productionType:'One of a Kind',availableQuantity:1,soldQuantity:0,reservedQuantity:0};
 const cases=[
  [{...published,status:'draft'},'Drafts'],
  [{...published,status:'pending_review'},'Pending approval'],
  [published,'Live'],
  [{...published,availableQuantity:0,soldQuantity:1},'Sold'],
  [{...published,availableQuantity:0,soldQuantity:0},'Other'],
  [{...published,availableQuantity:0,reservedQuantity:1},'Live'],
  [{...published,productionType:'Made to Order',availableQuantity:0,soldQuantity:5},'Live'],
  [{...published,pausedByDesigner:true},'Other'],
  [{...published,status:'rejected'},'Other'],
  [{...published,moderationStatus:'pending'},'Other']
 ];
 for(const [item,expected]of cases)assert.equal(context.designerListingGroup(item),expected);
});

test('order attention excludes unpaid and refunded orders and normal payout holds',()=>{
 const reasons=order=>Array.from(context.designerOrderAttention(order));
 assert.deepEqual(reasons({orderStatus:'paid',fulfillmentStatus:'awaiting_shipment',payoutStatus:'pending'}),['Add shipment tracking']);
 assert.deepEqual(reasons({orderStatus:'paid',fulfillmentStatus:'tracking_verified',payoutStatus:'failed'}),['Review failed payout']);
 assert.deepEqual(reasons({orderStatus:'paid',fulfillmentStatus:'tracking_submitted',payoutStatus:'pending'}),[]);
 for(const orderStatus of ['pending','failed','refunded','expired'])assert.deepEqual(reasons({orderStatus,fulfillmentStatus:'awaiting_shipment',payoutStatus:'failed'}),[]);
});

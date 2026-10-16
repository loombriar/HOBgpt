const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function calculateDesignerPriceEstimate('),source.indexOf('function renderDesignerPriceEstimate(')),ctx);
const estimate=values=>ctx.calculateDesignerPriceEstimate(values);
test('designer estimates account for nine-percent commission, materials, labor and delivery',()=>{
 const result=estimate({price:'100',materials:'20',hours:'2',rate:'15',postage:'8',packaging:'2'});
 assert.equal(result.fee,900);assert.equal(result.labor,3000);assert.equal(result.remaining,3100);assert.equal(result.price,10000);
 assert.equal(estimate({price:'100',hours:'1.5',rate:'10.01'}).labor,1502);
 assert.equal(estimate({price:'0.50'}).fee,5);
 assert.equal(estimate({price:'10',materials:'20'}).remaining,-1090);
 assert.equal(estimate({price:'100'}).remaining,9100);
});
test('invalid costs and unsupported precision never produce a misleading remainder',()=>{
 for(const [key,value]of [['price','0'],['price','Infinity'],['materials','-1'],['hours','0.001'],['rate','NaN'],['postage','1.999'],['packaging','1000001'],['hours','10001']])assert.equal(estimate({price:'100',[key]:value}),null);
});

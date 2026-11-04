const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function preview(template,secondary){
 const nodes=new Map(),fills=[];let draw;
 const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),fill(){fills.push(this.fillStyle);}}, {get:(target,key)=>key in target?target[key]:()=>{}});
 function node(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,dataset:{},textContent:'',addEventListener(){},setAttribute(){},toggleAttribute(){},querySelector:()=>null});return nodes.get(id);}
 node('creator-3d-canvas').getContext=()=>context;
 for(const [id,val]of Object.entries({'creator-template':template,'creator-color':'#226644','creator-secondary-color':secondary,'creator-length':'Midi','creator-sleeves':'Short'}))node(id).value=val;
 vm.runInNewContext(fs.readFileSync(require.resolve('../outfit-3d.js'),'utf8'),{document:{getElementById:node},MutationObserver:class{observe(){}},requestAnimationFrame(fn){draw=fn;return 1;}});
 draw();return {fills,canvas:node('creator-3d-canvas')};
}
test('separates render the selected bottom color in actual canvas faces',()=>{
 for(const template of ['Top & skirt','Top & trousers']){
  const green=preview(template,'#226644'),red=preview(template,'#cc2233');
  assert.notDeepEqual(green.fills,red.fills,template+' should change rendered faces');
  assert.equal(red.canvas.dataset.bottomColor,'#cc2233');
  assert.ok(Number(red.canvas.dataset.meshTriangles)>1000);
 }
});
test('one-piece garments retain one fabric color when the secondary color changes',()=>{
 for(const template of ['A-line','Fitted','Full skirt','Jumpsuit'])assert.deepEqual(preview(template,'#226644').fills,preview(template,'#cc2233').fills,template);
});

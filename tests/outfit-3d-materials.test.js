const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function preview(template,secondary,bottomStyle="Classic",{topStyle="Classic",neckline="Scoop",sleeves="Short"}={}){
 const nodes=new Map(),fills=[];let draw;
 const gradient=(kind,coordinates)=>({kind,coordinates,stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}});
 const context=new Proxy({
  createLinearGradient:(...coordinates)=>gradient('linear',coordinates),
  createRadialGradient:(...coordinates)=>gradient('radial',coordinates),
  fill(){const style=this.fillStyle;fills.push(typeof style==='string'?style:{kind:style.kind,coordinates:[...style.coordinates],stops:style.stops.map(stop=>[...stop])});},
 }, {get:(target,key)=>key in target?target[key]:()=>{}});
 function node(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,dataset:{},textContent:'',addEventListener(){},setAttribute(){},toggleAttribute(){},querySelector:()=>null});return nodes.get(id);}
 node('creator-3d-canvas').getContext=()=>context;
 for(const [id,val]of Object.entries({'creator-template':template,'creator-bottom-style':bottomStyle,'creator-color':'#226644','creator-secondary-color':secondary,'creator-length':'Midi','creator-sleeves':sleeves,'creator-top-style':topStyle,'creator-neckline':neckline}))node(id).value=val;
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
test('dresses and jumpsuits render the selected bottom color like the editable sketch',()=>{
 for(const template of ['A-line','Fitted','Full skirt','Jumpsuit']){
  const green=preview(template,'#226644'),red=preview(template,'#cc2233');
  assert.notDeepEqual(green.fills,red.fills,template+' should change rendered bottom faces');
  assert.equal(red.canvas.dataset.topColor,'#226644');
  assert.equal(red.canvas.dataset.bottomColor,'#cc2233');
 }
});

test('straight and flared separates produce different rendered shapes',()=>{
 for(const template of ['Top & skirt','Top & trousers'])assert.notDeepEqual(preview(template,'#cc2233','Straight').fills,preview(template,'#cc2233','Flared').fills,template);
});

test('tailored necklines change the rendered geometry',()=>{
 const scoop=preview('A-line','#226644','Classic',{neckline:'Scoop'});
 for(const neckline of ['V-neck','Square']){
  const changed=preview('A-line','#226644','Classic',{neckline});
  assert.notDeepEqual(changed.fills,scoop.fills,neckline);
  assert.equal(changed.canvas.dataset.bodice,'tailored-neck-and-shoulders');
 }
});
test('cropped and longline separates change the rendered top length',()=>{
 for(const template of ['Top & skirt','Top & trousers']){
  const classic=preview(template,'#cc2233');
  for(const topStyle of ['Cropped','Longline']){
   const changed=preview(template,'#cc2233','Classic',{topStyle});
   assert.notDeepEqual(changed.fills,classic.fills,topStyle);
   assert.equal(changed.canvas.dataset.topStyle,topStyle);
  }
 }
});

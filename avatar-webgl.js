/* House of Briar: zero-cost, self-hosted WebGL mannequin. No remote services or personal data transmission. */
(() => {
  const vertex = `attribute vec3 position; attribute vec3 normal; uniform mat4 projection; uniform mat4 view; uniform float turn; varying vec3 vNormal; varying vec3 vPos; void main(){float c=cos(turn),s=sin(turn);mat3 r=mat3(c,0.,-s,0.,1.,0.,s,0.,c);vNormal=r*normal;vPos=r*position;gl_Position=projection*view*vec4(vPos,1.);}`;
  const fragment = `precision mediump float; varying vec3 vNormal; varying vec3 vPos; void main(){vec3 n=normalize(vNormal);vec3 light=normalize(vec3(-.55,.8,1.));float diffuse=max(dot(n,light),0.);float fill=max(dot(n,normalize(vec3(.9,.3,-.7))),0.)*.25;float shade=.40+.48*diffuse+fill;vec3 color=vec3(.79,.77,.74)*shade+vec3(.08,.075,.07)*pow(1.-abs(dot(n,normalize(vec3(0.,.05,1.)))),3.);gl_FragColor=vec4(color,1.);}`;
  const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  const matPerspective=(fov,aspect,near,far)=>{const f=1/Math.tan(fov/2),d=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,0,0,2*far*near*d,0]);};
  const matView=(distance)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-distance,1]);
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const num=(profile,key,defaultValue)=>{const n=Number(profile[key]);return Number.isFinite(n)&&n>0?n:defaultValue;};
  function makeMesh(profile){
    const bust=clamp(num(profile,'bust',36)/36,.7,1.5),waist=clamp(num(profile,'waist',30)/30,.7,1.5),hips=clamp(num(profile,'hips',39)/39,.7,1.5);
    const height=clamp(num(profile,'height',67)/67,.83,1.2),inseam=clamp(num(profile,'inseam',30)/30,.8,1.22);
    const vertices=[],normals=[],indices=[];const N=24;
    function loft(rings){
      const start=vertices.length/3;
      for(let i=0;i<rings.length;i++){
        const [y,cx,cz,rx,rz]=rings[i];
        for(let j=0;j<N;j++){const a=j*Math.PI*2/N;vertices.push(cx+rx*Math.cos(a),y,cz+rz*Math.sin(a));normals.push(Math.cos(a)/Math.max(rx,.01),0,Math.sin(a)/Math.max(rz,.01));}
      }
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<N;j++){const a=start+i*N+j,b=start+i*N+(j+1)%N,c=a+N,d=b+N;indices.push(a,c,b,b,c,d);}
    }
    function ellipsoid(x,y,z,rx,ry,rz){const rings=[];for(let k=0;k<=16;k++){const t=Math.PI*k/16,scale=Math.max(.008,Math.sin(t));rings.push([y+ry*Math.cos(t),x,z,rx*scale,rz*scale]);}loft(rings);}
    const leg=1.18*inseam,torso=1.20*height,hipY=-.30+leg-1.18,shoulder=hipY+torso;
    loft([[hipY-.22,0,0,.23*hips,.15],[hipY-.11,0,0,.32*hips,.21],[hipY+.10,0,0,.35*hips,.22],[hipY+.34,0,0,.27*waist,.17],[hipY+.55,0,0,.245*waist,.165],[hipY+.79,0,0,.35*bust,.22],[shoulder-.15,0,0,.37*bust,.23],[shoulder,0,0,.23*bust,.17],[shoulder+.08,0,0,.095,.10]]);
    ellipsoid(0,shoulder+.31,0,.17,.235,.15);
    loft([[shoulder+.12,0,0,.085,.09],[shoulder+.19,0,0,.09,.09]]);
    for(const side of [-1,1]){
      const x=side*.21*hips;
      loft([[hipY-.09,x,0,.145*hips,.15],[hipY-.31,x,0,.14*hips,.15],[hipY-.64,x,0,.115*hips,.12],[hipY-1.01*inseam,x,0,.092*hips,.1],[hipY-1.13*inseam,x,0,.07,.075]]);
      ellipsoid(x,hipY-1.13*inseam,-.07,.09,.07,.18);
      const armX=side*.40*bust;
      loft([[shoulder-.13,armX,0,.13,.14],[shoulder-.34,armX+side*.05,0,.115,.12],[shoulder-.63,armX+side*.10,0,.09,.095],[shoulder-.89,armX+side*.12,0,.072,.078],[shoulder-1.04,armX+side*.13,0,.07,.075]]);
      ellipsoid(armX+side*.13,shoulder-1.09,0,.077,.115,.07);
    }
    return {vertices:new Float32Array(vertices),normals:new Float32Array(normals),indices:new Uint16Array(indices)};
  }
  window.createBriarWebGLAvatar=function(profile,angle=0){
    const canvas=document.createElement('canvas');canvas.className='fitting-webgl-canvas';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Interactive three-dimensional measurement mannequin. Drag to rotate, scroll to zoom.');
    const gl=canvas.getContext('webgl',{antialias:true,alpha:true});if(!gl)return null;
    try{
      const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL link failed');gl.useProgram(program);
      const mesh=makeMesh(profile);
      const bind=(name,data)=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);};
      bind('position',mesh.vertices);bind('normal',mesh.normals);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
      let rotation=angle*Math.PI/180,zoom=4.9,dragging=false,lastX=0,frame=0;
      function render(){frame=0;const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(gl.getUniformLocation(program,'projection'),false,matPerspective(.75,w/h,.1,30));gl.uniformMatrix4fv(gl.getUniformLocation(program,'view'),false,matView(zoom));gl.uniform1f(gl.getUniformLocation(program,'turn'),rotation);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);}
      const schedule=()=>{if(!frame)frame=requestAnimationFrame(render);};canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;rotation+=(e.clientX-lastX)*.012;lastX=e.clientX;schedule();});canvas.addEventListener('pointerup',()=>{dragging=false;});canvas.addEventListener('pointercancel',()=>{dragging=false;});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom+Math.sign(e.deltaY)*.25,3.4,7);schedule();},{passive:false});
      canvas.setView=degrees=>{rotation=degrees*Math.PI/180;schedule();};
      requestAnimationFrame(render);return canvas;
    }catch(error){console.warn('3D preview unavailable; using fallback',error);return null;}
  };
})();

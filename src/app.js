import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#output'),stage=$('#stage'),ctx=canvas.getContext('2d');
let loopCapture=null,videoUrl=null;
const enabled={style:true,color:true,noise:true,type:true};
const state={textOutline:true,outlineColor:'#080808',outlineWidth:2,innerShadow:false,shadowColor:'#000000',shadowStrength:65,shadowSoftness:18,shadowX:10,shadowY:10,noiseLow:'#070708',noiseHigh:'#ffffff',textFont:'google',background:'#070708',noiseWarp:1.5,noiseSwirl:0,noiseOctaves:4,noiseRoughness:.5,gradientStops:['#ff248f','#6236ff','#00e7ed'],gradientMap:'lighting',gradientSpeed:0,textColor:'#244dff',transparent:false,noiseScale:115,noiseSpeed:0,noiseBlend:'screen',mode:'ascii',finish:'cmyk',poster:true,posterText:'COMMON GROUND',density:80,contrast:1.4,grain:12,threshold:72,color:'#e9ff57',rotate:!matchMedia('(prefers-reduced-motion: reduce)').matches,invert:false};
let renderer,scene,camera,orbit,root,model,tracked=[],nextId=1,rotation=0,lastTime=0,lastStats=0,frames=0,width=1,height=1,toastTimer,importId=0;
const sample=document.createElement('canvas'),sc=sample.getContext('2d',{willReadFrequently:true});
const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.5,metalness:.15,side:THREE.DoubleSide});
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200)}
function dispose(object){object?.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==material){for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose()}}})}
function setModel(object,name,imported=false){if(model){root.remove(model);dispose(model)}model=object;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());const scale=3.3/Math.max(size.x,size.y,size.z);model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);const center=new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());model.position.sub(center);root.add(model);root.rotation.set(.2,0,.1);rotation=0;tracked=[];nextId=1;let count=0;model.traverse(o=>{if(o.isMesh){count+=o.geometry.attributes.position?.count||0;o.material=material}});$('#vertices').textContent=count.toLocaleString();$('#object-caption').textContent=name.toUpperCase();$('#source-tag').textContent=imported?'IMPORTED':'BUILT-IN';resetCamera()}
function chooseObject(name){let geometry;if(name==='knot')geometry=new THREE.TorusKnotGeometry(1,.36,220,36,2,3);if(name==='torus')geometry=new THREE.TorusGeometry(1,.4,48,120);if(name==='cube')geometry=new THREE.BoxGeometry(1.8,1.8,1.8,20,20,20);if(name==='sphere'){geometry=new THREE.SphereGeometry(1.25,96,64);const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const f=1+.1*Math.sin(x*5)*Math.cos(y*4)*Math.sin(z*5);p.setXYZ(i,x*f,y*f,z*f)}geometry.computeVertexNormals()}setModel(new THREE.Mesh(geometry,material),{knot:'Torus knot',torus:'Soft ring',sphere:'Distorted orb',cube:'Cube'}[name]);$$('[data-object]').forEach(b=>b.classList.toggle('active',b.dataset.object===name));$('#file-hint').textContent='GLB, GLTF, OBJ or STL · up to 25 MB'}
function resetCamera(){if(!camera)return;camera.position.set(0,.2,6.5);orbit.target.set(0,0,0);orbit.update()}
function resize(){if(loopCapture)return;const box=stage.getBoundingClientRect();const side=Math.max(1,Math.floor(Math.min(box.width,box.height)));stage.style.setProperty('--preview-size',side+'px');width=1080;height=1080;if(canvas.width!==1080||canvas.height!==1080){canvas.width=1080;canvas.height=1080}if(camera){camera.aspect=1;camera.updateProjectionMatrix()}if($('#shadow-handle'))updateShadowHandle()}

function setMode(mode){state.mode=mode;tracked=[];$$('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});$('#mode-label').textContent=mode==='blob'?'BLOB TRACKING':mode.toUpperCase();$('#mode-description').textContent={ascii:'Light and shadow, translated into characters.',blob:'Bright regions, tracked through motion.',pixel:'A little less resolution. A lot more character.'}[mode];$('#threshold-control').hidden=mode!=='blob'}
function setRotation(value){state.rotate=value;$('#rotate').checked=value;$('#pause').innerHTML=value?'Ⅱ <span>PAUSE</span>':'▷ <span>PLAY</span>';$('#pause').setAttribute('aria-label',value?'Pause rotation':'Resume rotation')}
function updateRanges(){for(const name of ['density','contrast','grain','threshold']){const input=$('#'+name);input.value=state[name];input.style.setProperty('--fill',`${(input.value-input.min)/(input.max-input.min)*100}%`);$('#'+name+'-value').textContent=state[name]+(['grain','threshold'].includes(name)?'%':'')}}
function rgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function blobs(values,cols,rows,cellW,cellH){const visited=new Uint8Array(values.length),regions=[],queue=new Int32Array(values.length),cut=state.threshold/100;for(let i=0;i<values.length;i++){if(visited[i]||values[i]<cut)continue;let tail=1,head=0,count=0,x0=cols,y0=rows,x1=0,y1=0,cx=0,cy=0;queue[0]=i;visited[i]=1;while(head<tail){const p=queue[head++],x=p%cols,y=Math.floor(p/cols);count++;cx+=x;cy+=y;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const n of [x>0?p-1:-1,x<cols-1?p+1:-1,y>0?p-cols:-1,y<rows-1?p+cols:-1])if(n>=0&&!visited[n]&&values[n]>=cut){visited[n]=1;queue[tail++]=n}}if(count>=4)regions.push({x:x0*cellW,y:y0*cellH,w:(x1-x0+1)*cellW,h:(y1-y0+1)*cellH,cx:cx/count*cellW,cy:cy/count*cellH,count})}regions.sort((a,b)=>b.count-a.count);const used=new Set();tracked=regions.slice(0,12).map(r=>{let closest=null,distance=90;for(const old of tracked){const d=Math.hypot(old.cx-r.cx,old.cy-r.cy);if(!used.has(old.id)&&d<distance){closest=old;distance=d}}r.id=closest?.id||nextId++;used.add(r.id);return r});ctx.font='10px "IBM Plex Mono", monospace';ctx.lineWidth=1;for(const r of tracked){ctx.strokeStyle=state.invert?'#272d19':state.color;ctx.fillStyle=ctx.strokeStyle;ctx.strokeRect(Math.round(r.x)-4.5,Math.round(r.y)-4.5,Math.round(r.w)+9,Math.round(r.h)+9);const label=`ID:${String(r.id).padStart(3,'0')}  ${r.count}`;ctx.fillText(label,r.x-4,Math.max(15,r.y-12));ctx.beginPath();ctx.moveTo(r.cx-5,r.cy);ctx.lineTo(r.cx+5,r.cy);ctx.moveTo(r.cx,r.cy-5);ctx.lineTo(r.cx,r.cy+5);ctx.stroke()}ctx.fillText(`${tracked.length} REGIONS DETECTED`,24,height-60)}
const ramps={
  cmyk:['#080808','#00ffff','#ff00ff','#ffff00'],
  heat:['#120818','#2510a6','#143cff','#00caff','#dbfbff','#ff0c44','#ff3908','#ff9c00','#faff30'],
  pink:['#160911','#500518','#c20024','#ff123b','#fa1398','#ff6fd4','#fff0f6'],
  chrome:['#101328','#414966','#b9c6e3','#f9feff','#a6b5d0','#18234c','#4963a0','#dce3f3','#ffffff']
};
let colorLut=[],gradientLut=[];
// Seeded gradient Perlin noise: coherent across neighboring pixels and frames.
const permutation=Array.from({length:256},(_,i)=>i);
let noiseSeed=173;
for(let i=255;i>0;i--){noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;const j=noiseSeed%(i+1);[permutation[i],permutation[j]]=[permutation[j],permutation[i]]}
const perm=[...permutation,...permutation];
const fade=t=>t*t*t*(t*(t*6-15)+10);
const mix=(a,b,t)=>a+(b-a)*t;
function gradient(hash,x,y){switch(hash&7){case 0:return x+y;case 1:return -x+y;case 2:return x-y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y}}
function perlin(x,y){
  const fx=Math.floor(x),fy=Math.floor(y),X=fx&255,Y=fy&255;
  x-=fx;y-=fy;const u=fade(x),v=fade(y);
  return mix(mix(gradient(perm[perm[X]+Y],x,y),gradient(perm[perm[X+1]+Y],x-1,y),u),mix(gradient(perm[perm[X]+Y+1],x,y-1),gradient(perm[perm[X+1]+Y+1],x-1,y-1),u),v);
}
const noiseOverlay=document.createElement('canvas'),noiseContext=noiseOverlay.getContext('2d');
const alphaComposite=document.createElement('canvas'),alphaContext=alphaComposite.getContext('2d');
let noiseWidth=0,noiseHeight=0,noiseOffset=0,lastNoiseUpdate=0,gradientPhase=0;
function updateNoiseOverlay(time=0){
  if(!loopCapture&&state.noiseSpeed>0&&state.rotate&&time-lastNoiseUpdate>80){noiseOffset+=Math.min(time-lastNoiseUpdate,200)*state.noiseSpeed/20000;noiseWidth=0;lastNoiseUpdate=time}else if(!state.rotate||!state.noiseSpeed)lastNoiseUpdate=time;
  if(noiseWidth===width&&noiseHeight===height)return;
  noiseWidth=width;noiseHeight=height;
  noiseOverlay.width=Math.max(1,Math.ceil(width/5));noiseOverlay.height=Math.max(1,Math.ceil(height/5));
  const pixels=noiseContext.createImageData(noiseOverlay.width,noiseOverlay.height);
  const low=rgb(state.noiseLow),high=rgb(state.noiseHigh);
  for(let y=0;y<noiseOverlay.height;y++)for(let x=0;x<noiseOverlay.width;x++){
    let px=x*5/state.noiseScale+19.3,py=y*5/state.noiseScale+7.1;
    const wx=perlin(px*.65+noiseOffset,py*.65+3.7),wy=perlin(px*.65+8.2,py*.65-noiseOffset);
    px+=wx*state.noiseWarp;py+=wy*state.noiseWarp;
    const angle=state.noiseSwirl*perlin(px*.3+noiseOffset*.4,py*.3);
    const u=px*Math.cos(angle)-py*Math.sin(angle),v=px*Math.sin(angle)+py*Math.cos(angle);
    let value=0,amplitude=1,frequency=1,totalAmplitude=0;
    for(let octave=0;octave<state.noiseOctaves;octave++){value+=perlin(u*frequency+noiseOffset,v*frequency+noiseOffset*.6)*amplitude;totalAmplitude+=amplitude;amplitude*=state.noiseRoughness;frequency*=2}
    value/=totalAmplitude;
    const shade=Math.max(0,Math.min(255,Math.round((.5+value*1.5)*255))),i=(y*noiseOverlay.width+x)*4;
    for(let channel=0;channel<3;channel++)pixels.data[i+channel]=Math.round(low[channel]+(high[channel]-low[channel])*shade/255);pixels.data[i+3]=255;
  }
  noiseContext.putImageData(pixels,0,0);
}
function rebuildColors(){
  const stops=(state.finish==='gradient'?state.gradientStops:ramps[state.finish]||['#070708',state.color]).map(rgb);
  gradientLut=Array.from({length:256},(_,i)=>{const t=i/255*(stops.length-1),a=Math.min(stops.length-2,Math.floor(t)),f=t-a;return stops[a].map((c,k)=>Math.round(c+(stops[a+1][k]-c)*f))});
  colorLut=Array.from({length:256},(_,i)=>{const t=i/255*(stops.length-1),a=Math.min(stops.length-2,Math.floor(t)),f=t-a;return `rgb(${stops[a].map((c,k)=>Math.round(c+(stops[a+1][k]-c)*f)).join(',')})`});
}
function setFinish(finish){state.finish=finish;$$('[data-finish]').forEach(b=>{const active=b.dataset.finish===finish;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});rebuildColors();if($('#gradient-strip'))gradientStrip()}
const letteringCanvas=document.createElement('canvas'),letteringContext=letteringCanvas.getContext('2d');
const textMask=document.createElement('canvas'),maskContext=textMask.getContext('2d');
const textShadow=document.createElement('canvas'),shadowContext=textShadow.getContext('2d');
let letteringKey='';
function drawPoster(target=ctx,textOnly=false){
  if((!textOnly&&(!enabled.type||!state.poster))||!state.posterText.replaceAll('/','').trim())return;
  const key=JSON.stringify([width,height,state.posterText,state.textFont,state.textColor,state.innerShadow,state.shadowColor,state.shadowStrength,state.shadowSoftness,state.shadowX,state.shadowY,state.textOutline,state.outlineColor,state.outlineWidth,document.fonts.status]);
  if(key!==letteringKey){
    letteringKey=key;
    for(const c of [letteringCanvas,textMask,textShadow]){c.width=width;c.height=height}
    const parts=state.posterText.toUpperCase().split('/').map(t=>t.trim()).filter(Boolean);
    maskContext.save();maskContext.textBaseline='alphabetic';maskContext.textAlign='left';
    maskContext.font=`500 ${Math.min(width*.19,height*.22)}px ${state.textFont==='slab'?'"Roboto Slab",Rockwell,Georgia,serif':state.textFont==='google'?'"Google Sans",Arial,sans-serif':'"Space Grotesk",sans-serif'}`;
    maskContext.fillStyle=state.textColor;maskContext.translate(width*.07,height*.28);maskContext.transform(1,-.04,-.08,1,0,0);
    if(state.textOutline&&state.outlineWidth>0){
      letteringContext.save();letteringContext.setTransform(maskContext.getTransform());letteringContext.font=maskContext.font;letteringContext.textBaseline='alphabetic';letteringContext.textAlign='left';letteringContext.lineJoin='round';letteringContext.strokeStyle=state.outlineColor;letteringContext.lineWidth=state.outlineWidth*2;
      letteringContext.strokeText(parts[0],0,0,width*.88);
      if(parts.length>1){letteringContext.textAlign='right';letteringContext.strokeText(parts.slice(1).join(' '),width*.86,height*.48,width*.88)}
      letteringContext.restore();
    }
    maskContext.fillText(parts[0],0,0,width*.88);
    if(parts.length>1){maskContext.textAlign='right';maskContext.fillText(parts.slice(1).join(' '),width*.86,height*.48,width*.88)}
    maskContext.restore();letteringContext.drawImage(textMask,0,0);
    if(state.innerShadow){
      shadowContext.fillStyle=state.shadowColor;shadowContext.fillRect(0,0,width,height);
      shadowContext.globalCompositeOperation='destination-out';
      if('filter' in shadowContext)shadowContext.filter=`blur(${state.shadowSoftness}px)`;
      else{shadowContext.shadowColor='#000';shadowContext.shadowBlur=state.shadowSoftness}
      shadowContext.drawImage(textMask,state.shadowX,state.shadowY);
      shadowContext.filter='none';shadowContext.shadowBlur=0;
      shadowContext.globalCompositeOperation='destination-in';shadowContext.drawImage(textMask,0,0);shadowContext.globalCompositeOperation='source-over';
      letteringContext.save();letteringContext.globalAlpha=state.shadowStrength/100;letteringContext.drawImage(textShadow,0,0);letteringContext.restore();
    }
  }
  target.save();target.globalAlpha=state.invert?.4:.83;target.shadowColor=state.textColor;target.shadowBlur=state.invert?0:7;target.drawImage(letteringCanvas,0,0);target.restore();
}
function render(time){
  requestAnimationFrame(render);if(!renderer)return;
  const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
  if(loopCapture){
    if(loopCapture.stopping)return;
    if(loopCapture.start===null)loopCapture.start=time;
    const phase=(time-loopCapture.start)/(loopCapture.seconds*1000);
    if(phase>=1){finishLoop();return}
    const angle=phase*Math.PI*2,base=loopCapture.base;
    root.rotation.y=base.y+(state.rotate?angle:0);
    root.rotation.x=base.x+(state.rotate?Math.sin(angle)*.15:0);
    if(state.gradientSpeed>0)gradientPhase=base.gradient+phase*Math.max(1,Math.round(state.gradientSpeed));
    if(state.noiseSpeed>0){noiseOffset=base.noise+state.noiseSpeed*(Math.sin(angle)+(1-Math.cos(angle))*.4);noiseWidth=0}
    $('#video-progress').value=phase;$('#video-status').textContent=`Rendering ${Math.round(phase*100)}% · keep this tab open`;
  }else if(state.rotate){gradientPhase+=dt*state.gradientSpeed*.1;rotation+=dt*.25;root.rotation.y=rotation;root.rotation.x=.2+Math.sin(rotation*.7)*.15}
  if(!loopCapture)orbit.update();
  const cell=state.mode==='pixel'?Math.round(20-state.density*.15):Math.round(14-state.density*.095);
  const cols=enabled.style?Math.max(20,Math.floor(width/cell)):Math.min(width,1024),rows=enabled.style?Math.max(20,Math.floor(height/(state.mode==='ascii'?cell*1.4:cell))):Math.max(1,Math.round(cols*height/width));
  if(sample.width!==cols||sample.height!==rows){sample.width=cols;sample.height=rows;renderer.setSize(cols,rows,false);$('#resolution').textContent='1080 × 1080'}
  renderer.render(scene,camera);sc.clearRect(0,0,cols,rows);sc.drawImage(renderer.domElement,0,0,cols,rows);
  const data=sc.getImageData(0,0,cols,rows).data;
  ctx.clearRect(0,0,width,height);
  if(!state.transparent){ctx.fillStyle=state.background;ctx.fillRect(0,0,width,height);}
  ctx.strokeStyle=state.invert?'#20202008':'#a6aad205';ctx.lineWidth=.5;
  for(let x=width%60;!state.transparent&&x<width;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}
  for(let y=height%60;!state.transparent&&y<height;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
  const cw=width/cols,ch=height/rows,chars=' .,:;i1tfLCG08@';
  const vals=new Float32Array(cols*rows);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.ceil(ch*.93)}px "IBM Plex Mono",monospace`;
  if(!enabled.style){ctx.imageSmoothingEnabled=true;ctx.drawImage(renderer.domElement,0,0,width,height)}
  for(let y=0;enabled.style&&y<rows;y++)for(let x=0;x<cols;x++){
    const index=y*cols+x,p=index*4;if(data[p+3]<20)continue;
    const light=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/255;
    let v=Math.max(.035,Math.min(1,(light-.4)*state.contrast+.46));vals[index]=v;
    const mapped=state.finish==='heat'?Math.pow(v,1.7):v;const tone=state.mode==='pixel'?Math.round(mapped*12)/12:mapped;
    ctx.fillStyle=enabled.color?colorLut[Math.min(255,Math.round(tone*255))]:`rgb(${Math.round(v*255)},${Math.round(v*255)},${Math.round(v*255)})`;
    if(enabled.color&&state.finish==='gradient'){
      let t=state.gradientMap==='vertical'?y/Math.max(1,rows-1):state.gradientMap==='horizontal'?x/Math.max(1,cols-1):state.gradientMap==='radial'?Math.min(1,Math.hypot((x/cols-.5)*2,(y/rows-.5)*2)):v;
      if(state.gradientSpeed>0)t=(Math.sin(t*Math.PI-Math.PI/2+gradientPhase*Math.PI*2)+1)/2;
      const col=gradientLut[Math.max(0,Math.min(255,Math.round(t*255)))];ctx.fillStyle=`rgb(${col.map(c=>Math.round(c*(.28+.72*v))).join(',')})`;
    }
    if(enabled.color&&state.invert&&state.finish==='mono')ctx.fillStyle=`rgb(${rgb(state.color).map(c=>Math.round(c*.32*(1-v)+20*v)).join(',')})`;
    if(state.mode==='ascii'){
      // Clear each character cell before drawing the glyph.
      const ink=ctx.fillStyle;ctx.fillStyle=state.background;if(state.transparent)ctx.clearRect(x*cw,y*ch,Math.ceil(cw),Math.ceil(ch));else ctx.fillRect(x*cw,y*ch,Math.ceil(cw),Math.ceil(ch));ctx.fillStyle=ink;
      ctx.fillText(chars[Math.max(1,Math.floor(v*(chars.length-1)))],(x+.5)*cw,(y+.5)*ch);
    }else if(state.mode==='pixel'){
      ctx.fillRect(Math.floor(x*cw),Math.floor(y*ch),Math.ceil(cw)-.5,Math.ceil(ch)-.5);
    }else{
      ctx.globalAlpha=.35+v*.4;ctx.fillRect(x*cw,y*ch,cw-.5,ch-.5);ctx.globalAlpha=1;
    }
  }
  if(enabled.noise&&state.grain>0){
    updateNoiseOverlay(time);
    // Blend on an opaque working surface, then restore the original alpha mask.
    // This keeps noise on the artwork without filling the transparent background.
    let target=ctx;
    if(state.transparent){
      if(alphaComposite.width!==width||alphaComposite.height!==height){alphaComposite.width=width;alphaComposite.height=height}
      target=alphaContext;target.fillStyle=state.background;target.fillRect(0,0,width,height);target.drawImage(canvas,0,0);
    }
    target.save();target.globalAlpha=state.grain/100;target.globalCompositeOperation=state.noiseBlend==='screen'&&state.invert?'multiply':state.noiseBlend;target.imageSmoothingEnabled=true;target.drawImage(noiseOverlay,0,0,width,height);target.restore();
    if(state.transparent){target.save();target.globalCompositeOperation='destination-in';target.drawImage(canvas,0,0);target.restore();ctx.clearRect(0,0,width,height);ctx.drawImage(alphaComposite,0,0)}
  }
  if(enabled.style&&state.mode==='blob'){if(loopCapture){tracked=[];nextId=1}ctx.textAlign='left';ctx.textBaseline='alphabetic';blobs(vals,cols,rows,cw,ch)}
  drawPoster();
  if(loopCapture){
    const recording=loopCapture;recording.context.fillStyle=state.background;recording.context.fillRect(0,0,recording.canvas.width,recording.canvas.height);recording.context.drawImage(canvas,0,0,recording.canvas.width,recording.canvas.height);
    if(recording.recorder.state==='inactive')recording.recorder.start();
  }
  updateNodePreviews(time);
  frames++;if(time-lastStats>1000){$('#frame-rate').textContent=`${Math.round(frames*1000/(time-lastStats))} FPS`;frames=0;lastStats=time}
}
async function importFile(file){if(!file)return;if(file.size>25*1024*1024){toast('This model is too large. Please choose a file under 25 MB.');return}const ext=file.name.split('.').pop().toLowerCase();if(!['glb','gltf','obj','stl'].includes(ext)){toast('Choose a GLB, GLTF, OBJ or STL model.');return}const id=++importId;$('#file-hint').textContent='Loading your form…';try{let object;if(ext==='obj')object=new OBJLoader().parse(await file.text());else if(ext==='stl')object=new THREE.Mesh(new STLLoader().parse(await file.arrayBuffer()),material);else{const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('data:')||url.startsWith('blob:'))return url;throw new Error('External resources are not supported. Export a self-contained GLB instead.')});object=(await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(),'' )).scene}if(id!==importId){dispose(object);return}let count=0;object.traverse(o=>{if(o.isMesh){count+=o.geometry.attributes.position?.count||0;const old=Array.isArray(o.material)?o.material:[o.material];for(const m of old){if(m){for(const val of Object.values(m))if(val?.isTexture)val.dispose();m.dispose()}}o.material=material}});if(!count||count>2000000){dispose(object);throw new Error(!count?'This file has no visible mesh.':'Please simplify this model to under 2 million vertices.')}const box=new THREE.Box3().setFromObject(object),sz=box.getSize(new THREE.Vector3());if(!Number.isFinite(sz.length())||sz.length()===0){dispose(object);throw new Error('This file does not contain a valid 3D form.')}setModel(object,file.name,true);$$('[data-object]').forEach(b=>b.classList.remove('active'));$('#file-hint').textContent=file.name;toast('Your form is ready. Find its signal.')}catch(e){if(id!==importId)return;$('#file-hint').textContent='Could not load model. Try a self-contained GLB.';toast(e.message?.includes('External')||e.message?.includes('Please simplify')?e.message:'Could not read this model. Try exporting it as a self-contained GLB.')}finally{$('#file').value=''}}
$$('[data-object]').forEach(b=>b.onclick=()=>{++importId;chooseObject(b.dataset.object)});$$('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$$('[data-color]').forEach(b=>b.onclick=()=>{state.color=b.dataset.color;setFinish('mono');$('#custom-color').value=state.color;$$('[data-color]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b)})});$('#custom-color').oninput=e=>{state.color=e.target.value;setFinish('mono');$$('[data-color]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')})};for(const name of ['density','contrast','grain','threshold'])$('#'+name).oninput=e=>{state[name]=+e.target.value;updateRanges()};$('#rotate').onchange=e=>setRotation(e.target.checked);$('#pause').onclick=()=>setRotation(!state.rotate);$('#invert').onchange=e=>{state.invert=e.target.checked;state.background=state.invert?'#f2f1ee':'#070708';$('#background-color').value=state.background;$('#background-value').textContent=state.background.toUpperCase();stage.classList.toggle('light',state.invert)};$('#reset-view').onclick=()=>{resetCamera();toast('Camera reset')};$('#reset').onclick=()=>{Object.assign(state,{density:80,contrast:1.4,grain:12,threshold:72});updateRanges();toast('Signal adjustments reset')};$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen()}catch{toast('Fullscreen is unavailable in this browser.')}};$('#import').onclick=()=>$('#file').click();$('#file').onchange=e=>importFile(e.target.files[0]);stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('dragging')});stage.addEventListener('dragleave',e=>{if(!stage.contains(e.relatedTarget))stage.classList.remove('dragging')});stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('dragging');importFile(e.dataTransfer.files[0])});$('#export').onclick=()=>{if(!renderer){toast('The renderer must be available before exporting.');return}canvas.toBlob(blob=>{if(!blob){toast('Could not export this frame. Please try again.');return}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`form-signal-${state.mode}-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Frame exported. Make something with it.')},'image/png')};$('#about').onclick=()=>$('#help').showModal();$('#close-help').onclick=()=>$('#help').close();$('#help').onclick=e=>{if(e.target===$('#help')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}};canvas.onkeydown=e=>{if(e.code==='Space'){e.preventDefault();setRotation(!state.rotate)}if(e.key.toLowerCase()==='r')resetCamera()};
$$('[data-finish]').forEach(b=>b.onclick=()=>setFinish(b.dataset.finish));$('#poster').onchange=e=>{state.poster=e.target.checked;$('#poster-text').disabled=!state.poster};$('#poster-text').oninput=e=>state.posterText=e.target.value;rebuildColors();
try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,100);orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.enablePan=false;orbit.minDistance=3;orbit.maxDistance=14;const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,5);scene.add(key);const rim=new THREE.DirectionalLight(0xffffff,1.2);rim.position.set(4,-1,-2);scene.add(rim);scene.add(new THREE.AmbientLight(0xffffff,.12));root=new THREE.Group();scene.add(root);resize();new ResizeObserver(resize).observe(stage);chooseObject('knot');setRotation(state.rotate);updateRanges();requestAnimationFrame(render)}catch(e){$('#stage-error').hidden=false;$('#stage-error').textContent='This browser could not start the 3D renderer. Enable hardware acceleration or try another browser.';$('#frame-rate').textContent='RENDERER UNAVAILABLE';$$('.controls button').forEach(b=>b.disabled=true);console.error(e)}

// A fixed, inspectable processing chain. Node placement does not change routing.
const nodes=[
 {id:'source',name:'geometry1',type:'SOURCE',color:'#7baf91',help:'Choose or import a mesh. Adjust its X, Y, Z position and scale below; drag in the viewer to orbit.'},
 {id:'style',name:'style1',type:'EFFECT',color:'#929bce',help:'Convert the rendered form into characters, pixels, or tracked regions. Bypass to view the original shaded mesh.'},
 {id:'color',name:'color1',type:'COLOR',color:'#bd91bd',help:'Map brightness to a color palette. Bypass for grayscale. Color mapping applies while style1 is enabled.'},
 {id:'noise',name:'perlin1',type:'NOISE',color:'#929bce',help:'Layer coherent Perlin noise over the image. Motion follows the viewer’s play/pause control.'},
 {id:'type',name:'type1',type:'COMPOSITE',color:'#929bce',help:'Composite editable poster lettering in front of the form.'},
 {id:'output',name:'out1',type:'OUTPUT',color:'#b4b8bf',help:'Final composited output. Export saves the image without the interface.'}
];
const inspector=$('.controls-scroll'),panels={};
const sections=$$('.controls-scroll > .control-section');
[panels.source,panels.style,panels.color,panels.adjustments]=sections;
// Transform the normalized model as a whole, independent of orbit and animation.
const objectTransform={x:0,y:0,z:0,scale:1};
panels.source.insertAdjacentHTML('beforeend','<div class="toggle-row"><label for="show-object">Show 3D object</label><input id="show-object" class="switch" type="checkbox" checked></div>');
$('#show-object').onchange=e=>{if(root)root.visible=e.target.checked;tracked=[]};

panels.source.insertAdjacentHTML('beforeend',`<div class="noise-controls"><div class="section-label"><h3>3D POSITION & SCALE</h3></div>${['x','y','z','scale'].map(key=>`<label for="object-${key}">${key==='scale'?'Scale':key.toUpperCase()+' position'} <output id="object-${key}-value">${key==='scale'?'1.00×':'0.00'}</output></label><input id="object-${key}" type="range" min="${key==='scale'?'.1':'-4'}" max="${key==='scale'?'3':'4'}" step=".01" value="${objectTransform[key]}">`).join('')}<button id="reset-transform" class="export-button text-export">Reset position & scale ↺</button><p class="helper">X: left / right · Y: down / up · Z: depth. Applies to the object and all image and video exports.</p></div>`);
function applyObjectTransform(){if(root){root.position.set(objectTransform.x,objectTransform.y,objectTransform.z);root.scale.setScalar(objectTransform.scale)}tracked=[];for(const key of ['x','y','z','scale']){$('#object-'+key).value=objectTransform[key];$('#object-'+key+'-value').textContent=objectTransform[key].toFixed(2)+(key==='scale'?'×':'')}}
for(const key of ['x','y','z','scale'])$('#object-'+key).oninput=e=>{objectTransform[key]=+e.target.value;applyObjectTransform()};
$('#reset-transform').onclick=()=>{Object.assign(objectTransform,{x:0,y:0,z:0,scale:1});applyObjectTransform()};

function panel(id,title){const el=document.createElement('section');el.className='control-section';el.innerHTML=`<div class="section-label"><h3>${title}</h3></div>`;inspector.append(el);panels[id]=el;return el}
function moveRange(id,target){target.append($(`label[for="${id}"]`),$('#'+id))}
moveRange('density',panels.style);moveRange('contrast',panels.style);panels.style.append($('#threshold-control'),$('#reset'));
const noisePanel=panel('noise','PERLIN NOISE');moveRange('grain',noisePanel);
noisePanel.insertAdjacentHTML('afterbegin','<div class="noise-color-controls"><div class="text-color-row"><label for="noise-low">Dark areas</label><input id="noise-low" type="color" value="#070708"><output id="noise-low-value">#070708</output></div><div class="text-color-row"><label for="noise-high">Light areas</label><input id="noise-high" type="color" value="#ffffff"><output id="noise-high-value">#FFFFFF</output></div><button id="noise-color-demo" class="export-button text-export">Try pink / blue</button><p class="helper">These colors belong to the warped texture. Increase Perlin overlay to make them stronger. Normal blend shows the exact colors.</p></div>');
for(const [id,key] of [['noise-low','noiseLow'],['noise-high','noiseHigh']])$('#'+id).oninput=e=>{state[key]=e.target.value;$('#'+id+'-value').textContent=e.target.value.toUpperCase();noiseWidth=0};
$('#noise-color-demo').onclick=()=>{state.noiseLow='#180745';state.noiseHigh='#ff287e';state.noiseBlend='source-over';state.grain=60;$('#noise-low').value=state.noiseLow;$('#noise-high').value=state.noiseHigh;$('#noise-low-value').textContent=state.noiseLow.toUpperCase();$('#noise-high-value').textContent=state.noiseHigh.toUpperCase();$('#noise-blend').value=state.noiseBlend;noiseWidth=0;updateRanges()};

noisePanel.insertAdjacentHTML('beforeend','<div class="noise-controls"><label for="noise-scale">Scale <output id="noise-scale-value">115</output></label><input id="noise-scale" type="range" min="25" max="350" value="115"><label for="noise-speed">Motion <output id="noise-speed-value">0.0</output></label><input id="noise-speed" type="range" min="0" max="3" step="0.1" value="0"><label for="noise-blend">Blend</label><select id="noise-blend"><option value="source-over">Normal</option><option value="screen" selected>Screen</option><option value="multiply">Multiply</option><option value="overlay">Overlay</option><option value="soft-light">Soft light</option></select></div>');
const typePanel=panel('type','POSTER LETTERING');typePanel.append($('.poster-row'),$('#poster-text'));
typePanel.insertAdjacentHTML('beforeend','<div class="noise-controls"><label for="text-font">Font</label><select id="text-font"><option value="google" selected>Google Sans</option><option value="sans">Sans serif · Space Grotesk</option><option value="slab">Slab serif · Roboto Slab</option></select></div>');
$('#text-font').onchange=async e=>{state.textFont=e.target.value;if(['slab','google'].includes(state.textFont)){try{await document.fonts.load(state.textFont==='google'?'500 48px "Google Sans"':'500 48px "Roboto Slab"')}catch{toast('Font could not load. Using the available fallback font.')}}};

typePanel.insertAdjacentHTML('beforeend','<div class="text-color-row"><label for="text-color">Text color</label><input id="text-color" type="color" value="#244dff" aria-label="Text color"><output id="text-color-value">#244DFF</output></div>');
$('#text-color').oninput=e=>{state.textColor=e.target.value;$('#text-color-value').textContent=state.textColor.toUpperCase()};

typePanel.insertAdjacentHTML('beforeend','<button id="export-text" class="export-button text-export">Export text only <span>↓</span></button><p class="helper">Transparent PNG at 1080 × 1080. Includes only your lettering, with its current color and glow.</p>');
$('#export-text').onclick=()=>{
 if(!state.posterText.trim()||!state.posterText.replaceAll('/','').trim()){toast('Enter some lettering to export.');return}
 const textCanvas=document.createElement('canvas');textCanvas.width=width;textCanvas.height=height;
 drawPoster(textCanvas.getContext('2d'),true);
 textCanvas.toBlob(blob=>{
  if(!blob){toast('Could not export the lettering. Please try again.');return}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`form-signal-text-${Date.now()}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Text exported with a transparent background.');
 },'image/png');
};

panels.color.append($('.palette-row'));
panels.color.insertAdjacentHTML('beforeend',`<div class="gradient-controls noise-controls"><div class="section-label"><h3>CUSTOM GRADIENT</h3><button id="use-gradient" class="reset-button">APPLY</button></div><div class="gradient-stops">${state.gradientStops.map((color,i)=>`<label>Stop ${i+1}<input type="color" id="gradient-${i}" value="${color}" aria-label="Gradient stop ${i+1}"></label>`).join('')}</div><div id="gradient-strip"></div><label for="gradient-map">Mapping</label><select id="gradient-map"><option value="lighting">Light & shadow</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="radial">Radial</option></select><label for="gradient-speed">Color flow <output id="gradient-speed-value">0.0</output></label><input id="gradient-speed" type="range" min="0" max="3" step="0.1" value="0"><p class="helper">Edit any stop to apply the gradient. Color flow follows play/pause.</p></div>`);
function gradientStrip(){ $('#gradient-strip').style.background=`linear-gradient(90deg,${state.gradientStops.join(',')})`;$('#use-gradient').textContent=state.finish==='gradient'?'ACTIVE':'APPLY' }
for(let i=0;i<3;i++)$('#gradient-'+i).oninput=e=>{state.gradientStops[i]=e.target.value;setFinish('gradient');gradientStrip()};
$('#use-gradient').onclick=()=>{setFinish('gradient');gradientStrip()};
$('#gradient-map').onchange=e=>{state.gradientMap=e.target.value;setFinish('gradient');gradientStrip()};
$('#gradient-speed').oninput=e=>{state.gradientSpeed=+e.target.value;$('#gradient-speed-value').textContent=state.gradientSpeed.toFixed(1);noiseFill(e.target);setFinish('gradient');gradientStrip()};gradientStrip();

const outPanel=panel('output','OUTPUT');outPanel.insertAdjacentHTML('beforeend','<p class="node-description">1080 × 1080 PNG image. Includes the enabled effects, Perlin overlay, and lettering.</p>');outPanel.append($('.toggle-row'));
outPanel.insertAdjacentHTML('beforeend','<div class="text-color-row"><label for="background-color">Background color</label><input type="color" id="background-color" value="#070708"><output id="background-value">#070708</output></div>');
$('#background-color').oninput=e=>{state.background=e.target.value;$('#background-value').textContent=state.background.toUpperCase();const c=rgb(state.background);state.invert=(c[0]*.2126+c[1]*.7152+c[2]*.0722)>150;$('#invert').checked=state.invert;stage.classList.toggle('light',state.invert)};

outPanel.insertAdjacentHTML('beforeend','<div class="poster-row"><label for="transparent">Transparent background</label><input id="transparent" class="switch" type="checkbox"></div><p class="helper">PNG alpha transparency. The checkerboard is preview-only; Perlin noise stays within the artwork. Disable type1 to export the object without lettering.</p>');
$('#transparent').onchange=e=>{state.transparent=e.target.checked;stage.classList.toggle('transparent',state.transparent);$('#invert').disabled=state.transparent;$('#background-color').disabled=state.transparent;$('.export-note').textContent=state.transparent?'PNG · TRANSPARENT BACKGROUND':'PNG · WHAT YOU SEE IS WHAT YOU GET'};
panels.adjustments.remove();delete panels.adjustments;
function noiseFill(el){el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`)}
noiseFill($('#noise-scale'));noiseFill($('#noise-speed'));
$('#noise-scale').oninput=e=>{noiseFill(e.target);state.noiseScale=+e.target.value;$('#noise-scale-value').textContent=e.target.value;noiseWidth=0};
$('#noise-speed').oninput=e=>{noiseFill(e.target);state.noiseSpeed=+e.target.value;$('#noise-speed-value').textContent=state.noiseSpeed.toFixed(1)};
$('#noise-blend').onchange=e=>state.noiseBlend=e.target.value;
const warpParams=[['noiseWarp','Warp',0,6,.1],['noiseSwirl','Swirl',0,3,.1],['noiseOctaves','Detail',1,6,1],['noiseRoughness','Roughness',.2,.8,.05]];
const warpBox=document.createElement('div');warpBox.className='noise-controls';
warpBox.innerHTML=warpParams.map(([key,label,min,max,step])=>`<label for="${key}">${label}<output id="${key}-value">${state[key]}</output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}">`).join('');
noisePanel.querySelector('.noise-controls').prepend(warpBox);
for(const [key] of warpParams){const input=$('#'+key);noiseFill(input);input.oninput=e=>{state[key]=+e.target.value;$('#'+key+'-value').textContent=state[key];noiseWidth=0;noiseFill(input)}}noiseFill($('#gradient-speed'));

const network=$('#network'),wires=$('#connections');let selectedNode='style',lastNodePreview=0;
function selectNode(id){selectedNode=id;for(const n of nodes){n.element.classList.toggle('selected',n.id===id);n.element.setAttribute('aria-pressed',n.id===id);panels[n.id].hidden=n.id!==id}const n=nodes.find(n=>n.id===id);$('#inspector-name').textContent=n.name;$('#inspector-type').textContent=n.type;$('#inspector-help').textContent=n.help;$('#selected-path').textContent='/project1/'+n.name;inspector.scrollTop=0}
function drawWires(){wires.replaceChildren();for(let i=0;i<nodes.length-1;i++){const a=nodes[i],b=nodes[i+1],path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M${a.x+148},${a.y+63} C${a.x+175},${a.y+63} ${b.x-28},${b.y+63} ${b.x},${b.y+63}`);path.setAttribute('fill','none');path.setAttribute('stroke','#788ca7');path.setAttribute('stroke-width','2');wires.append(path)}}
for(const [i,n] of nodes.entries()){
 n.x=25+i*182;n.y=32;
 const el=document.createElement('div');n.element=el;el.className='operator';el.style.setProperty('--op',n.color);el.style.left=n.x+'px';el.style.top=n.y+'px';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Edit '+n.name);el.innerHTML=`<div class="operator-header"><span>${n.name}</span><span>↗</span></div><canvas width="146" height="64" aria-hidden="true"></canvas><div class="operator-bottom"><span class="operator-tag">${n.type}</span>${n.id in enabled?`<input type="checkbox" checked aria-label="Enable ${n.name}">`:'<span>●</span>'}</div>`;
 network.append(el);n.preview=el.querySelector('canvas').getContext('2d');
 el.onclick=e=>{if(e.target.tagName!=='INPUT')selectNode(n.id)};
 el.onkeydown=e=>{if(e.target!==el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(n.id)}if(e.key.startsWith('Arrow')){e.preventDefault();n.x=Math.max(5,Math.min(967,n.x+({ArrowLeft:-10,ArrowRight:10}[e.key]||0)));n.y=Math.max(5,Math.min(65,n.y+({ArrowUp:-10,ArrowDown:10}[e.key]||0)));el.style.left=n.x+'px';el.style.top=n.y+'px';drawWires()}};
 const toggle=el.querySelector('input');if(toggle)toggle.onchange=()=>{enabled[n.id]=toggle.checked;el.classList.toggle('bypassed',!toggle.checked);selectNode(n.id)};
 const header=el.querySelector('.operator-header');header.onpointerdown=e=>{if(e.button!==0)return;selectNode(n.id);const x=e.clientX,y=e.clientY,ox=n.x,oy=n.y;header.setPointerCapture(e.pointerId);header.onpointermove=m=>{n.x=Math.max(5,Math.min(967,ox+m.clientX-x));n.y=Math.max(5,Math.min(65,oy+m.clientY-y));el.style.left=n.x+'px';el.style.top=n.y+'px';drawWires()};header.onpointerup=header.onpointercancel=()=>{header.onpointermove=null}};
}
$('#arrange-nodes').onclick=()=>{nodes.forEach((n,i)=>{n.x=25+i*182;n.y=32;n.element.style.left=n.x+'px';n.element.style.top=n.y+'px'});drawWires()};
function updateNodePreviews(time){
 if(time-lastNodePreview<150)return;lastNodePreview=time;
 for(const n of nodes){const c=n.preview;if(!c)continue;c.fillStyle='#090b0f';c.fillRect(0,0,146,64);
 if(n.id==='source')c.drawImage(renderer.domElement,35,0,76,64);
 else if(n.id==='noise'){if(noiseOverlay.width)c.drawImage(noiseOverlay,0,0,146,64)}
 else if(n.id==='color'){for(let x=0;x<146;x++){c.fillStyle=colorLut[Math.floor(x/146*255)];c.fillRect(x,7,1,50)}}
 else if(n.id==='type'){c.fillStyle=state.textColor;c.font=state.textFont==='slab'?'500 18px \"Roboto Slab\",Georgia,serif':state.textFont==='google'?'500 18px "Google Sans",Arial,sans-serif':'18px monospace';c.fillText(state.posterText.slice(0,14),7,37,130)}
 else{const scale=Math.min(146/width,64/height),w=width*scale,h=height*scale;c.drawImage(canvas,(146-w)/2,(64-h)/2,w,h)}
 }
}
drawWires();selectNode('style');

// Canvas-only video capture: no camera, microphone, or screen permissions.
outPanel.insertAdjacentHTML('beforeend','<div class="video-options noise-controls"><div class="section-label"><h3>LOOPING VIDEO</h3></div><label for="video-duration">Loop length</label><select id="video-duration"><option value="4">4 seconds</option><option value="6" selected>6 seconds</option><option value="8">8 seconds</option><option value="12">12 seconds</option></select><label for="video-format">Format</label><select id="video-format"></select><p class="helper">One full turn when auto-rotate is on. Animated noise and colors return to their starting point. 1080 × 1080 video uses your background color; PNG supports transparency.</p></div>');
$('.export-area').insertAdjacentHTML('beforeend','<button id="export-video" class="export-button video-export">Export loop video <span>▷</span></button><progress id="video-progress" value="0" max="1" hidden></progress><p id="video-status" class="helper" role="status"></p><button id="cancel-video" class="reset-button" hidden>Cancel export</button>');
document.body.insertAdjacentHTML('beforeend','<dialog id="video-result"><button id="close-video" aria-label="Close video preview">×</button><h2>Your loop is ready.</h2><video id="loop-preview" controls loop playsinline></video><a id="download-video" class="export-button">Download video ↓</a><p class="helper">Loop playback is enabled in this preview. Enable repeat in your video player to keep it looping.</p></dialog>');
const videoFormats=[];
if(typeof MediaRecorder!=='undefined'&&canvas.captureStream){
 for(const format of [{label:'MP4',ext:'mp4',types:['video/mp4;codecs=avc1.42E01E','video/mp4']},{label:'WebM',ext:'webm',types:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']}]){
  const mime=format.types.find(t=>MediaRecorder.isTypeSupported(t));if(mime)videoFormats.push({...format,mime});
 }
}
for(const f of videoFormats){const option=document.createElement('option');option.value=f.mime;option.textContent=f.label;$('#video-format').append(option)}
if(!videoFormats.length){$('#export-video').disabled=true;$('#video-status').textContent='Video export is unavailable in this browser. Try a current Chrome or Safari browser.'}
$('#close-video').onclick=()=>{$('#loop-preview').pause();$('#video-result').close()};
$('#video-result').addEventListener('cancel',()=>$('#loop-preview').pause());
function finishLoop(reason=null){
 const capture=loopCapture;if(!capture||capture.stopping)return;
 capture.stopping=true;capture.error=reason;
 if(capture.recorder.state!=='inactive')capture.recorder.stop();else restoreLoop(capture);
}
function restoreLoop(capture){
 clearTimeout(capture.timeout);capture.stream.getTracks().forEach(t=>t.stop());
 rotation=capture.base.rotation;root.rotation.set(capture.base.x,capture.base.y,capture.base.z);gradientPhase=capture.base.gradient;noiseOffset=capture.base.noise;noiseWidth=0;lastNoiseUpdate=performance.now();tracked=[];nextId=1;
 loopCapture=null;orbit.enabled=true;
 for(const [el,disabled] of capture.controls)el.disabled=disabled;
 document.body.classList.remove('recording');$('#video-progress').hidden=true;$('#cancel-video').hidden=true;$('#export-video').textContent='Export loop video ▷';resize();
}
$('#cancel-video').onclick=()=>finishLoop('Export cancelled.');
document.addEventListener('visibilitychange',()=>{if(document.hidden&&loopCapture)finishLoop('Export stopped because the tab was hidden. Keep this tab visible while exporting.')});
$('#export-video').onclick=async()=>{
 if(loopCapture||!renderer)return;
 const button=$('#export-video');button.disabled=true;button.textContent='Preparing loop…';
 try{
  await document.fonts.ready;
  const format=videoFormats.find(f=>f.mime===$('#video-format').value);if(!format)throw new Error('No supported video format is available.');
  const recordingCanvas=document.createElement('canvas');recordingCanvas.width=1080;recordingCanvas.height=1080;
  const recordingContext=recordingCanvas.getContext('2d');recordingContext.fillStyle=state.background;recordingContext.fillRect(0,0,recordingCanvas.width,recordingCanvas.height);recordingContext.drawImage(canvas,0,0,recordingCanvas.width,recordingCanvas.height);
  const stream=recordingCanvas.captureStream(30);
  let recorder;try{recorder=new MediaRecorder(stream,{mimeType:format.mime,videoBitsPerSecond:8000000})}catch(error){stream.getTracks().forEach(t=>t.stop());throw error}
  button.disabled=false;
  const capture={recorder,stream,canvas:recordingCanvas,context:recordingContext,seconds:+$('#video-duration').value,format,chunks:[],start:null,stopping:false,error:null,base:{rotation,x:root.rotation.x,y:root.rotation.y,z:root.rotation.z,noise:noiseOffset,gradient:gradientPhase},controls:$$('button,input,select').filter(el=>el.id!=='cancel-video').map(el=>[el,el.disabled])};
  loopCapture=capture;orbit.enabled=false;
  for(const [el] of capture.controls)el.disabled=true;
  document.body.classList.add('recording');$('#video-progress').hidden=false;$('#video-progress').value=0;$('#cancel-video').hidden=false;$('#video-status').textContent='Preparing the first frame…';button.textContent='Rendering loop…';
  recorder.ondataavailable=e=>{if(e.data.size)capture.chunks.push(e.data)};
  recorder.onerror=()=>finishLoop('Video encoding failed. Try another format or a smaller viewer.');
  recorder.onstop=()=>{
   const blob=new Blob(capture.chunks,{type:recorder.mimeType||format.mime});restoreLoop(capture);
   if(capture.error||!blob.size){$('#video-status').textContent=capture.error||'No video frames were recorded. Please try again.';return}
   if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(blob);
   $('#loop-preview').src=videoUrl;$('#download-video').href=videoUrl;$('#download-video').download=`form-signal-loop-${capture.seconds}s-${Date.now()}.${format.ext}`;
   $('#video-status').textContent=`${capture.seconds}-second ${format.label} loop ready.`;$('#video-result').showModal();$('#loop-preview').play().catch(()=>{});
  };
  capture.timeout=setTimeout(()=>finishLoop('Export took too long. Keep the tab visible and try a shorter loop.'),(capture.seconds+15)*1000);
 }catch(error){if(loopCapture){const capture=loopCapture;capture.error=error.message;restoreLoop(capture)}button.disabled=false;button.textContent='Export loop video ▷';$('#video-status').textContent='Could not start video export. '+error.message}
};

const shadowPanel=document.createElement('div');shadowPanel.className='noise-controls gradient-controls';
shadowPanel.innerHTML='<div class="poster-row"><label for="inner-shadow">Text inner shadow</label><input type="checkbox" class="switch" id="inner-shadow"></div><div class="text-color-row"><label for="shadow-color">Shadow color</label><input type="color" id="shadow-color" value="#000000"></div>'+[['shadowStrength','Strength',0,100],['shadowSoftness','Softness',1,80],['shadowX','Horizontal offset',-60,60],['shadowY','Vertical offset',-60,60]].map(([key,label,min,max])=>`<label for="${key}">${label}<output id="${key}-value">${state[key]}${key==='shadowStrength'?'%':' px'}</output></label><input type="range" id="${key}" min="${min}" max="${max}" value="${state[key]}">`).join('')+'<p class="helper">Shades inside the letters. Included in full-image, text-only, and video exports.</p>';
typePanel.prepend(shadowPanel);
$('#inner-shadow').onchange=e=>state.innerShadow=e.target.checked;
$('#shadow-color').oninput=e=>state.shadowColor=e.target.value;
for(const key of ['shadowStrength','shadowSoftness','shadowX','shadowY']){const input=$('#'+key);noiseFill(input);input.oninput=e=>{state[key]=+e.target.value;$('#'+key+'-value').textContent=state[key]+(key==='shadowStrength'?'%':' px');noiseFill(input)}}

// A viewer-only handle positions the shadow without appearing in exports.
shadowPanel.insertAdjacentHTML('beforeend','<button id="place-shadow" class="export-button text-export" aria-pressed="false">Position shadow in viewer</button><p class="helper">Enable Inner shadow, then drag the crosshair to choose its direction and distance from the center. Turn Inner shadow off to remove it.</p>');
stage.insertAdjacentHTML('beforeend','<div id="shadow-positioner" hidden><span class="shadow-origin">+</span><button id="shadow-handle" aria-label="Shadow position. Drag or use arrow keys." title="Drag to position shadow">✥</button><span class="shadow-placement-hint">DRAG TO PLACE SHADOW · ARROW KEYS TO ADJUST</span></div>');
let placingShadow=false;
function updateShadowHandle(){const handle=$('#shadow-handle'),scale=canvas.getBoundingClientRect().width/1080;handle.style.left=`calc(50% + ${state.shadowX*2*scale}px)`;handle.style.top=`calc(50% + ${state.shadowY*2*scale}px)`}
function setShadowPlacement(active){placingShadow=active&&state.innerShadow;$('#shadow-positioner').hidden=!placingShadow;$('#place-shadow').setAttribute('aria-pressed',placingShadow);$('#place-shadow').textContent=placingShadow?'Done positioning':'Position shadow in viewer';updateShadowHandle()}
$('#place-shadow').onclick=()=>{if(!state.innerShadow){state.innerShadow=true;$('#inner-shadow').checked=true}setShadowPlacement(!placingShadow)};
$('#inner-shadow').onchange=e=>{state.innerShadow=e.target.checked;if(!state.innerShadow)setShadowPlacement(false)};
for(const key of ['shadowX','shadowY'])$('#'+key).addEventListener('input',updateShadowHandle);
function moveShadow(x,y){state.shadowX=Math.round(Math.max(-60,Math.min(60,x)));state.shadowY=Math.round(Math.max(-60,Math.min(60,y)));for(const key of ['shadowX','shadowY']){$('#'+key).value=state[key];$('#'+key+'-value').textContent=state[key]+' px';noiseFill($('#'+key))}updateShadowHandle()}
const shadowHandle=$('#shadow-handle');
shadowHandle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();shadowHandle.setPointerCapture(e.pointerId);const move=event=>{const r=canvas.getBoundingClientRect(),scale=r.width/1080;moveShadow((event.clientX-r.left-r.width/2)/(2*scale),(event.clientY-r.top-r.height/2)/(2*scale))};move(e);shadowHandle.onpointermove=move;shadowHandle.onpointerup=shadowHandle.onpointercancel=()=>shadowHandle.onpointermove=null};
shadowHandle.onkeydown=e=>{const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(steps[e.key]){e.preventDefault();const step=e.shiftKey?10:1;moveShadow(state.shadowX+steps[e.key][0]*step,state.shadowY+steps[e.key][1]*step)}if(e.key==='Escape')setShadowPlacement(false)};

shadowPanel.querySelector('.poster-row').after($('#place-shadow'));

const outlinePanel=document.createElement('div');outlinePanel.className='noise-controls gradient-controls';
outlinePanel.innerHTML='<div class="poster-row"><label for="text-outline">Text outline</label><input id="text-outline" type="checkbox" class="switch" checked></div><div class="text-color-row"><label for="outline-color">Outline color</label><input id="outline-color" type="color" value="#080808"></div><label for="outline-width">Thickness<output id="outline-width-value">2 px</output></label><input id="outline-width" type="range" min="0.5" max="12" step="0.5" value="2">';
typePanel.prepend(outlinePanel);
$('#text-outline').onchange=e=>state.textOutline=e.target.checked;
$('#outline-color').oninput=e=>state.outlineColor=e.target.value;
noiseFill($('#outline-width'));
$('#outline-width').oninput=e=>{state.outlineWidth=+e.target.value;$('#outline-width-value').textContent=state.outlineWidth+' px';noiseFill(e.target)};

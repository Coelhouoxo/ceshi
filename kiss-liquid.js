/* Refraction is rendered from the visible chat scene so the same optics work
   on browsers that cannot run an SVG filter on the native backdrop. */
(() => {
'use strict';
let instanceId=0;

function rimGeometry(x,y,w,h,r){
 const px=x-w/2,py=y-h/2;
 const qx=Math.abs(px)-(w/2-r),qy=Math.abs(py)-(h/2-r);
 const ox=Math.max(qx,0),oy=Math.max(qy,0),length=Math.hypot(ox,oy);
 const distance=length+Math.min(Math.max(qx,qy),0)-r;
 if(length)return [distance,ox/length*Math.sign(px),oy/length*Math.sign(py)];
 return qx>qy?[distance,Math.sign(px),0]:[distance,0,Math.sign(py)];
}
function rimBend(distance,r,rimWidth=10){
 const t=Math.max(0,Math.min(1,1+distance/Math.min(rimWidth,r*.82)));
 return t*t*(3-2*t);
}
function lensVector(x,y,w,h,r){
 const [distance,nx,ny]=rimGeometry(x,y,w,h,r);
 const bend=rimBend(distance,r);
 return [-nx*bend,-ny*bend];
}
function luminance(data){
 let sum=0,weight=0;
 for(let i=0;i<data.length;i+=4){
  if(data[i+3]<128)continue;
  sum+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;
  weight++;
 }
 return weight?sum/weight:1;
}

const profiles={
 control:{blur:.45,saturation:1.12,displacement:11,rimWidth:2.6},
 contact:{blur:.6,saturation:1.16,displacement:14,rimWidth:3.2},
 composer:{blur:.65,saturation:1.14,displacement:13,rimWidth:3.1},
 panel:{blur:5.2,saturation:1.17,displacement:17,rimWidth:10}
};
function create({host,root}){
 const doc=host.ownerDocument,view=doc.defaultView,ns='http://www.w3.org/2000/svg';
 const prefix='ki-lens-'+(++instanceId)+'-';
 const records=new Map(),maps=new Map();
 const transparency=view.matchMedia('(prefers-reduced-transparency: reduce)');
 let nextFilter=0,frame=0,warmup=0,started=false,disposed=false,background='',probe=null;
 const element=(tag,attrs)=>{
  const node=doc.createElementNS(ns,tag);
  for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
 };
 const svg=element('svg',{'aria-hidden':true,width:0,height:0});
 svg.classList.add('liquid-definitions');
 const defs=element('defs',{});svg.append(defs);root.append(svg);

 function shader(w,h,r,profile){
  const key=[w,h,r,profile].join('-');
  const material=profiles[profile];
  const cached=maps.get(key);
  if(cached)return cached;
  const scale=Math.min(profile==='panel'?1:1.5,Math.max(1,view.devicePixelRatio||1));
  const canvas=doc.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  const displacement=ctx.createImageData(canvas.width,canvas.height);
  const reflections=ctx.createImageData(canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++){
   for(let x=0;x<canvas.width;x++){
    const [distance,nx,ny]=rimGeometry((x+.5)/scale,(y+.5)/scale,w,h,r);
    const bend=rimBend(distance,r,material.rimWidth),depth=Math.max(0,-distance);
    const i=(y*canvas.width+x)*4;
    const map=displacement.data;
    map[i]=128-nx*bend*120;map[i+1]=128-ny*bend*120;map[i+2]=128;map[i+3]=255;
    if(distance>0||depth>8)continue;
    const direction=(-nx*.36-ny*.93);
    const band=Math.exp(-((depth-.65)**2)/.49);
    const broadGlint=Math.exp(-((depth-1.9)**2)/3.6)*.075*Math.max(0,direction)**4;
    const glint=band*(.035+.51*Math.max(0,direction)**3+.37*Math.max(0,-direction)**5)+broadGlint;
    const bevel=Math.exp(-((depth-2.6)**2)/2.9)*(.01+.10*Math.max(0,-direction)**2);
    const shade=reflections.data;
    const highlight=glint>=bevel;
    shade[i]=highlight?255:16;
    shade[i+1]=highlight?255:22;
    shade[i+2]=highlight?255:36;
    shade[i+3]=Math.round(255*(highlight?glint:bevel));
   }
  }
  ctx.putImageData(displacement,0,0);
  const field=canvas.toDataURL();
  ctx.putImageData(reflections,0,0);
  const reflection=canvas.toDataURL();
  const id=prefix+(++nextFilter);
  const filter=element('filter',{id,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse',x:-28,y:-28,width:w+56,height:h+56,'color-interpolation-filters':'sRGB'});
  filter.append(
   element('feImage',{href:field,x:0,y:0,width:w,height:h,preserveAspectRatio:'none',result:'lensField'}),
   element('feGaussianBlur',{in:'SourceGraphic',stdDeviation:material.blur,result:'softScene'}),
   element('feDisplacementMap',{in:'softScene',in2:'lensField',scale:material.displacement,xChannelSelector:'R',yChannelSelector:'G',result:'bentScene'})
  );
  filter.append(element('feColorMatrix',{in:'bentScene',type:'saturate',values:material.saturation}));
  defs.append(filter);
  const result={id,filter,reflection};
  maps.set(key,result);
  return result;
 }

 function makeRecord(target){
  const optics=doc.createElement('span');optics.className='liquid-optics';optics.setAttribute('aria-hidden','true');
  const lens=doc.createElement('span');lens.className='liquid-lens';
  const wall=doc.createElement('span');wall.className='liquid-wallpaper';
  const historyScene=doc.createElement('span');historyScene.className='liquid-history';
  const replyScene=doc.createElement('span');replyScene.className='liquid-reply';
  lens.append(wall,historyScene,replyScene);optics.append(lens);target.prepend(optics);
  const record={optics,lens,wall,historyScene,replyScene,rows:new Map(),material:null};
  records.set(target,record);
  return record;
 }
 function capture(record,rect,surfaceRect,surface,rows){
  const xScale=surface.offsetWidth/surfaceRect.width,yScale=surface.offsetHeight/surfaceRect.height;
  const sx=(rect.left-surfaceRect.left)*xScale,sy=(rect.top-surfaceRect.top)*yScale;
  for(const layer of [record.wall,record.historyScene,record.replyScene]){
   layer.style.width=surface.offsetWidth+'px';
   layer.style.height=surface.offsetHeight+'px';
   layer.style.left=-sx+'px';
   layer.style.top=-sy+'px';
  }
  record.wall.style.backgroundImage=background?'url('+JSON.stringify(background)+')':'none';
  record.optics.classList.toggle('liquid-in-reply',surface.classList.contains('replying'));
  const visible=rows.filter(({rect:row})=>row.bottom>rect.top-24&&row.top<rect.bottom+24&&row.right>rect.left-24&&row.left<rect.right+24);
  const keep=new Set(visible.map(({node})=>node));
  for(const [node,copy]of record.rows){
   if(!keep.has(node)){copy.remove();record.rows.delete(node);}
  }
  for(const {node,rect:row,reply}of visible){
   let copy=record.rows.get(node);
   if(!copy){
    if(node.querySelector('.debug-visible'))continue;
    copy=node.cloneNode(true);
    copy.querySelectorAll('.liquid-optics,script,style,iframe,video,object,embed').forEach(el=>el.remove());
    copy.classList.add('liquid-row-copy');
    copy.setAttribute('aria-hidden','true');
    copy.inert=true;
    record.rows.set(node,copy);
    (reply?record.replyScene:record.historyScene).append(copy);
   }
   copy.style.left=(row.left-surfaceRect.left)*xScale+'px';
   copy.style.top=(row.top-surfaceRect.top)*yScale+'px';
   copy.style.width=row.width*xScale+'px';
  }
 }
 function removeRecord(target,record){
  target.removeAttribute('data-liquid-ready');
  record.optics.remove();
  records.delete(target);
 }
 function update(){
  frame=0;
  if(disposed||!host.isConnected)return;
  const surface=root.querySelector('.surface'),history=root.querySelector('.history');
  if(!surface||!history||!surface.offsetWidth||!surface.offsetHeight)return;
  const surfaceRect=surface.getBoundingClientRect();
  if(!surfaceRect.width||!surfaceRect.height)return;
  const sources=transparency.matches?[]:[...root.querySelectorAll('.glass')].filter(node=>!node.closest('.liquid-optics'));
  const visibleTargets=new Set();
  const usedMaps=new Set();
  const reply=root.querySelector('.reply-focus:not([hidden]) .reply-feed');
  const rows=[...history.children,...(reply?[...reply.children]:[])].map(node=>({node,rect:node.getBoundingClientRect(),reply:node.parentElement===reply}));
  for(const target of sources){
   const rect=target.getBoundingClientRect(),w=target.offsetWidth,h=target.offsetHeight;
   if(w<8||h<8||rect.bottom<surfaceRect.top||rect.top>surfaceRect.bottom)continue;
   visibleTargets.add(target);
   const record=records.get(target)||makeRecord(target);
   const borderRadius=view.getComputedStyle(target).borderTopLeftRadius;
   const radius=Math.round(borderRadius.includes('%')?Math.min(w,h)/2:Math.min(parseFloat(borderRadius)||20,w/2,h/2));
   const profile=target.matches('.tools')?'panel':target.matches('.input-capsule')?'composer':target.matches('.name')?'contact':'control';
   const material=shader(w,h,radius,profile);
   if(!material)continue;
   usedMaps.add(material);
   if(record.material!==material){
    record.lens.style.filter='url("#'+material.id+'")';
    record.optics.style.setProperty('--liquid-reflection','url("'+material.reflection+'")');
    record.material=material;
    target.setAttribute('data-liquid-ready','');
   }
   capture(record,rect,surfaceRect,surface,rows);
  }
  for(const [target,record]of records)if(!visibleTargets.has(target))removeRecord(target,record);
  if(maps.size>14){
   for(const [key,map]of maps){
    if(!usedMaps.has(map)){map.filter.remove();maps.delete(key);}
    if(maps.size<=14)break;
   }
  }
 }
 function schedule(){if(!disposed&&started&&!frame)frame=view.requestAnimationFrame(update);}
 function setBackground(src){
  src=src||'';
  if(background===src)return;
  background=src;host.removeAttribute('dark-backdrop');
  if(probe){probe.onload=probe.onerror=null;probe=null;}
  schedule();
  if(!src)return;
  const image=probe=new view.Image();
  if(/^https?:/i.test(src))image.crossOrigin='anonymous';
  image.onload=()=>{
   if(disposed||probe!==image)return;
   try{
    const canvas=doc.createElement('canvas');canvas.width=24;canvas.height=40;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0,24,40);
    host.toggleAttribute('dark-backdrop',luminance(ctx.getImageData(0,0,24,40).data)<.48);
   }catch{}
   schedule();
  };
  image.onerror=schedule;image.src=src;
 }
 root.addEventListener('scroll',schedule,true);
 root.addEventListener('load',schedule,true);
 view.addEventListener('resize',schedule);
 transparency.addEventListener('change',schedule);
 const resize=typeof view.ResizeObserver==='function'?new view.ResizeObserver(schedule):null;
 resize?.observe(root.querySelector('.surface'));
 // Paint the CSS material first and build the displacement maps after entry.
 warmup=view.requestAnimationFrame(()=>{
  warmup=view.requestAnimationFrame(()=>{started=true;schedule();});
 });
 function invalidate(row){
  for(const record of records.values()){
   const copy=record.rows.get(row);
   if(copy){copy.remove();record.rows.delete(row);}
  }
  schedule();
 }
 return {schedule,setBackground,invalidate,dispose(){
  disposed=true;
  view.cancelAnimationFrame(frame);view.cancelAnimationFrame(warmup);
  resize?.disconnect();
  root.removeEventListener('scroll',schedule,true);
  root.removeEventListener('load',schedule,true);
  view.removeEventListener('resize',schedule);
  transparency.removeEventListener('change',schedule);
  if(probe)probe.onload=probe.onerror=null;
  for(const [target,record]of records)removeRecord(target,record);
  maps.clear();svg.remove();
 }};
}
window.KissIMessageLiquid={create,lensVector,luminance};
})();

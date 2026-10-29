import {PixelPen} from '../../engine/pixels.js';
export const config={id:'transfer-studies',title:'Three different stories',grid:96,loop:6,fps:60,palette:[[91,111,83],[174,187,146],[218,223,196],[111,83,60],[213,166,111],[242,237,222],[101,117,114],[187,128,92],[71,85,62],[115,152,162],[223,193,126],[165,156,131]]};
export function state(t){return{time:((t%6)+6)%6,phase:Math.sin(t*Math.PI/3)}}
export function createRenderer(canvas){canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');let dead=false;return{canvas,ctx,draw(t,o={}){
 if(dead)throw Error('Renderer destroyed');ctx.clearRect(0,0,96,96);if(o.opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,96,96)}const s=state(t),p=new PixelPen(ctx),c=config.palette;
 p.polygon([[18,62],[43,52],[78,63],[55,78],[26,73]],c[1]);p.ellipse([49,66],19,5,c[0]);
 if(o.subject==='cat'){
  // Species cues are ears, muzzle, low chest and curled tail; no human rig.
  p.polygon([[27,60],[48,54],[65,59],[65,67],[43,74],[27,68]],c[11]);p.polygon([[27,64],[43,69],[65,62],[65,67],[43,74],[27,68]],c[3]);
  p.ellipse([47,55],10,6,c[7]);p.ellipse([39,51],5,5,c[4]);p.polygon([[35,49],[35,43],[39,47],[42,44],[44,51]],c[4]);p.polygon([[35,50],[33,52],[37,54],[40,53]],c[5]);p.pixel(36,50,c[8]);p.line([42,58],[40,63],c[4],3);p.line([54,58],[55,62],c[4],3);
  p.polyline([[54,54],[61,53],[64,49],[62+s.phase,46]],c[7],3);p.line([44,55],[51,56],c[3]);
 }else if(o.subject==='lamp'){
  // Hard surfaces need thickness and joint overlap; the light follows the head.
  p.polygon([[29,55],[53,47],[71,55],[48,66]],c[4]);p.line([33,59],[33,72],c[3],2);p.line([63,59],[63,71],c[3],2);p.ellipse([48,56],6,2,c[6]);
  const hinge=[44,43],head=[56+2*s.phase,32];p.line([48,54],hinge,c[6],3);p.line(hinge,head,c[6],3);p.ellipse(hinge,2,2,c[8]);p.polygon([[head[0]-5,head[1]-3],[head[0]+3,head[1]-4],[head[0]+7,head[1]+2],[head[0]-5,head[1]+5]],c[6]);p.line([head[0]-3,head[1]+4],[head[0]+5,head[1]+2],c[10],2);p.ellipse([head[0]+2,55],7,2,c[10]);
 }else{
  // A tea pour is read through wrist/spout/cup alignment, not tiny fingers.
  p.line([34,59],[34,71],c[3],3);p.ellipse([33,57],7,3,c[3]);p.polygon([[31,39],[37,39],[40,55],[34,60],[27,56]],c[6]);p.ellipse([33,34],4,5,c[4]);p.polygon([[29,33],[29,29],[35,28],[37,31],[32,32]],c[8]);p.line([31,45],[40,49],c[5],3);p.line([40,49],[48,46],c[4],2);
  p.polygon([[46,43],[52,42],[55,45],[53,49],[47,48]],c[7]);p.line([53,44],[57,46],c[7],2);p.ellipse([46,45],2,2,c[7]);p.ellipse([46,45],1,1,c[1]);
  p.polygon([[44,58],[60,53],[70,58],[54,65]],c[4]);p.line([48,62],[48,73],c[3],2);p.line([65,61],[65,71],c[3],2);p.polygon([[57,53],[63,53],[62,58],[58,58]],c[5]);p.line([58,53],[62,53],c[3]);if(s.phase>-.5)p.line([57,47],[60,53],c[9]);
 }p.finish();return s;
 },capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('Integer scale required');const c=document.createElement('canvas');c.width=c.height=96*scale;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},destroy(){if(dead)return;dead=true;ctx.clearRect(0,0,96,96)}}}
export default{config,state,createRenderer};

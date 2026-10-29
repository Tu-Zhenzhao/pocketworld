import base,{colors as C} from './base.js';
import {PixelPen} from '../../engine/pixels.js';
// The artwork remains authored on192 cells. Only local life-motion is sampled at576 output pixels.
export const config={...base.config,id:'bicycle-life-smooth',grid:576,designGrid:192,localMotionScale:3};
const TAU=Math.PI*2,mj=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(6*x-15)+10)};
const pulse=(t,start,rise,fall)=>t<start||t>start+rise+fall?0:t<start+rise?mj((t-start)/rise):1-mj((t-start-rise)/fall);
export function state(t){const s=base.state(t);return{...s,lifeBreath:.6*(1-Math.cos(TAU*s.time/4)),lifeEar:pulse(s.time,7.2,.3,.5),lifeTail:pulse(s.time,9.5,1.0,1.3)}}
function sprite(draw,box){const n=document.createElement('canvas');n.width=n.height=192;const p=new PixelPen(n.getContext('2d'));const poly=(a,k)=>p.polygon(a,C[k]),line=(a,b,k,w=1)=>p.line(a,b,C[k],w),ell=(a,x,y,k)=>p.ellipse(a,x,y,C[k]),limb=(a,b,k,w)=>{line(a,b,k,w);ell(a,w/2,w/2,k);ell(b,w/2,w/2,k)};draw({poly,line,ell,limb});p.finish();const c=document.createElement('canvas');c.width=box[2]*3;c.height=box[3]*3;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(n,box[0],box[1],box[2],box[3],0,0,c.width,c.height);return{canvas:c,x:box[0]*3,y:box[1]*3,w:c.width,h:c.height};}
export function createRenderer(canvas){canvas.width=canvas.height=576;const ctx=canvas.getContext('2d'),low=document.createElement('canvas'),r=base.createRenderer(low);let dead=false;
const body=sprite(({poly})=>{poly([[137,131],[139,126],[147,125],[153,128],[153,133],[143,135],[136,134]],'catShade');poly([[138,130],[141,126],[147,126],[151,128],[150,131],[141,133]],'cat');poly([[145,127],[148,128],[149,130],[146,130]],'ochre');},[135,123,20,13]);
const head=sprite(({poly,line})=>{poly([[135,131],[135,124],[138,126],[141,125],[142,130],[139,133]],'ochre');poly([[136,128],[139,128],[140,131],[138,133],[135,131]],'cat');line([136,130],[137,130],'shoe');},[133,122,11,13]);
const paws=sprite(({poly})=>{poly([[134,133],[142,133],[142,135],[134,135]],'cat');poly([[145,133],[151,133],[151,135],[144,135]],'cat');},[133,132,20,4]);
const tail=sprite(({limb})=>{limb([151,132],[155,130],'ochre',2);limb([155,130],[155,126],'ochre',2);},[149,124,11,10]);
const gy=y=>116+.74*(y-116);
const tufts=[[0,30,117],[1,162,138],[2,66,153]].map(([i,x,y])=>{const root=gy(y);return{i,root,layer:sprite(({line})=>{line([x,root],[x-1,root-5],'mossDark');line([x+1,root],[x+3,root-3],'mossDark');line([x-1,root],[x-3,root-3.5],'mossDark')},[x-5,Math.floor(root)-7,12,9])}});
// Row-wise integer output-pixel deformation retains the authored block texture; no blur/alpha filter.
const warp=document.createElement('canvas');warp.width=96;warp.height=96;const wctx=warp.getContext('2d');
function shear(layer,shift,phase=()=>.5){wctx.clearRect(0,0,96,96);wctx.imageSmoothingEnabled=false;for(let y=0;y<layer.h;y++){const py=layer.y+y+.5,v=shift(py),dx=Math.sign(v)*Math.floor(Math.abs(v)+phase(py));wctx.drawImage(layer.canvas,0,y,layer.w,1,12+dx,y,layer.w,1)}ctx.drawImage(warp,0,0,96,layer.h,layer.x-12,layer.y,96,layer.h)}
return{canvas,ctx,draw(t,options={}){if(dead)throw Error('destroyed');const s=state(t);r.draw(t,options);ctx.clearRect(0,0,576,576);ctx.imageSmoothingEnabled=false;ctx.drawImage(low,0,0,576,576);
// Fixed baseline at the paws; a connected ribcage expansion, not a translating patch.
for(let x=0;x<body.w;x++){const nx=(body.x+x+.5)/3,w=Math.max(0,Math.sin(Math.PI*Math.max(0,Math.min(1,(nx-136)/18))));const dy=Math.floor(s.lifeBreath*3*w+.96*w);ctx.drawImage(body.canvas,x,0,1,body.h,body.x+x,body.y-dy,1,body.h+dy)}
// Only the left ear's upper rows shear; face, chin, and head root stay in place.
shear(head,py=>{const y=py/3;return y<127?-3*s.lifeEar*Math.max(0,Math.min(1,(127-y)/3)):0},py=>.96*Math.max(0,Math.min(1,(127-py/3)/3)));
ctx.drawImage(paws.canvas,paws.x,paws.y);
shear(tail,py=>{const f=Math.max(0,Math.min(1,(130-py/3)/5));return 4.2*s.lifeTail*f*f},py=>.96*Math.max(0,Math.min(1,(130-py/3)/5)));
for(const {i,root,layer} of tufts){const g=pulse(s.time,5.7+i*.18,1.15,1.45);shear(layer,py=>{const f=Math.max(0,Math.min(1,(root-py/3)/5));return 6.6*g*Math.pow(f,1.6)})}
return s;},capture(scale=1){if(!Number.isInteger(scale)||scale<1)throw Error('integer capture');if(scale===1)return canvas.toDataURL('image/png').split(',')[1];const c=document.createElement('canvas');c.width=c.height=576*scale;const d=c.getContext('2d');d.imageSmoothingEnabled=false;d.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},destroy(){if(dead)return;dead=true;r.destroy();ctx.clearRect(0,0,576,576)}}}
export default{config,state,createRenderer};

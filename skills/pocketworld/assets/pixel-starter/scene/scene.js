import {PixelPen} from '../../engine/pixels.js';
export const config={id:'wind-study',title:'A little wind',grid:96,loop:6,fps:60,palette:[[91,111,83],[174,187,146],[218,223,196],[111,83,60],[213,166,111]]};
export function state(t){return{time:((t%6)+6)%6,sway:Math.sin(t*Math.PI/3)}}
export function createRenderer(canvas){
 canvas.width=canvas.height=config.grid;const ctx=canvas.getContext('2d');let destroyed=false;
 return{canvas,ctx,draw(t,options={}){
  if(destroyed)throw Error('Renderer destroyed');ctx.clearRect(0,0,96,96);const s=state(t);
  if(options.opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,96,96)}
  const p=new PixelPen(ctx),c=config.palette;
  p.polygon([[21,63],[40,55],[74,63],[58,75],[29,71]],c[1]);
  p.polygon([[40,63],[48,61],[57,66],[48,69]],c[0]);
  p.line([45,63],[45,29],c[3],2);
  p.polygon([[46,30],[63,31+s.sway],[62,41+s.sway],[46,39]],c[4]);
  p.line([46,31],[46,38],c[3]);p.finish();return s;
 },capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('Integer capture scale required');const out=document.createElement('canvas');out.width=out.height=96*scale;const c=out.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,out.width,out.height);return out.toDataURL('image/png').split(',')[1]},destroy(){if(destroyed)return;destroyed=true;ctx.clearRect(0,0,96,96)}};
}
export default{config,state,createRenderer};

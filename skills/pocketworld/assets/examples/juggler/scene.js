import {GRID,LOOP,CAMERA,COMMON_PALETTE,VolumeRenderer,SoftwareVolumeRenderer,drawSprite,world} from './model.js';
import {HybridRenderer} from '../../engine/renderer.js';
export const config={id:'juggler',title:'Small acts, three balls',grid:GRID,loop:LOOP,fps:60,camera:CAMERA,palette:COMMON_PALETTE};
// A scene-owned renderer preserves the designed pixel character and linked ground shadows.
// Each mount has its own surface/resources; no module-global canvas or shared animation state.
export function createRenderer(canvas,execution={}){
 const surface=document.createElement('canvas');surface.width=surface.height=GRID;
 const volume=execution.backend==='cpu'?new SoftwareVolumeRenderer(surface):new VolumeRenderer(surface),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=GRID;
 return {canvas,ctx,destroyed:false,
  draw(t,options={}){if(this.destroyed)throw Error('Renderer destroyed');const s=world(t,options),sprite=options.representation!=='volume';volume.draw(s.t,{...options,noActor:sprite,noBalls:sprite});ctx.clearRect(0,0,GRID,GRID);if(options.opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,GRID,GRID)}ctx.drawImage(surface,0,0);if(sprite)drawSprite(ctx,s,options);return s},
  capture:HybridRenderer.prototype.capture,
  destroy(){if(this.destroyed)return;this.destroyed=true;volume.destroy()}
 };
}
export default {config,state:(time,options)=>({...world(time,options),time:((time%LOOP)+LOOP)%LOOP}),createRenderer};

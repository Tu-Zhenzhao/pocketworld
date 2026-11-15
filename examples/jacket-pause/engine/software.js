// Native-cell triangle rasterization. Shared authored geometry/state, no reference pixels.
import {cameraBasis,clamp} from './math.js';
const fract=x=>x-Math.floor(x),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
export function noise(x,y){const a=Math.floor(x),b=Math.floor(y);let u=fract(x),v=fract(y);u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v}
const b2=(x,y)=>fract(Math.floor(x)*.5+Math.floor(y)**2*.75);
export const threshold=(x,y)=>b2(x*.5,y*.5)*.25+b2(x,y);
export class TriangleRaster {
 constructor(canvas,camera){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera=camera;this.n=canvas.width;this.depth=new Float64Array(this.n*this.n)}
 begin(){this.depth.fill(-Infinity);this.image=this.ctx.createImageData(this.n,this.n)}
 mesh(vertices,{zoom=1,vertex=p=>p,shade}){
  const n=this.n,c=this.camera,b=cameraBasis(c),scale=n/c.span*zoom,depth=this.depth,pixels=this.image.data;
  const projected=[];
  for(let i=0;i<vertices.length;i+=7){const material=Math.round(vertices[i+6]),p=vertex([vertices[i],vertices[i+1],vertices[i+2]],material),q=p.map((v,k)=>v-c.target[k]);projected.push([n*.5+dot(q,b.right)*scale,n*.5-dot(q,b.up)*scale,dot(q,b.forward),...p,vertices[i+3],vertices[i+4],vertices[i+5],material])}
  for(let i=0;i<projected.length;i+=3){const a=projected[i],b=projected[i+1],c=projected[i+2],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;
   const xmin=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5)),xmax=Math.min(n-1,Math.floor(Math.max(a[0],b[0],c[0])-.5)),ymin=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5)),ymax=Math.min(n-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
   for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w=1-u-v;if(u< -1e-9||v< -1e-9||w< -1e-9)continue;const z=u*a[2]+v*b[2]+w*c[2],index=y*n+x;if(z<=depth[index]||z< -12||z>12)continue;
    const p=[3,4,5].map(k=>u*a[k]+v*b[k]+w*c[k]),normal=[6,7,8].map(k=>u*a[k]+v*b[k]+w*c[k]),color=shade(p,normal,c[9],threshold(x,n-1-y));if(!color)continue;depth[index]=z;const offset=index*4;for(let k=0;k<3;k++)pixels[offset+k]=color[k];pixels[offset+3]=255;
   }
  }
 }
 end(){this.ctx.putImageData(this.image,0,0)}
}
export class SoftwareRenderer {
 constructor(canvas,scene){this.canvas=canvas;this.scene=scene;canvas.width=canvas.height=scene.config.grid;this.ctx=canvas.getContext('2d');this.raster=new TriangleRaster(canvas,scene.config.camera);this.destroyed=false}
 draw(t,options={}){if(this.destroyed)throw Error('Renderer destroyed');const c=this.scene.config,s=this.scene.state(t,options),light=c.light||[-.6,1,.8],ll=Math.hypot(...light),r=this.raster;r.begin();
  r.mesh(this.scene.geometry(s),{zoom:options.zoom||1,shade:(p,normal,m,th)=>{const material=c.materials[m];if(!material)throw Error(`Unknown material ${m}`);let value=.23+.77*Math.max(0,dot(normal,light)/(Math.hypot(...normal)*ll||1));const field=c.field;
   if(m===0&&field){let x=(p[0]-p[2])*Math.SQRT1_2,y=(p[0]+p[2])*Math.SQRT1_2,angle=(field.angle||0)*Math.PI/180;[x,y]=[Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y];const edge=Math.hypot(x/field.radii[0],y/field.radii[1])+.065*(noise(x*4,y*4)-.5),u=clamp((edge-.77)/.31),coverage=1-u*u*(3-2*u);if(coverage<=th)return null;value=.52+.09*(noise(x*3.7,y*3.7)-.5)+.025*(noise(x*16,y*16)-.5);const sh=field.shadow;if(sh){const q=(x-sh.center[0])/Math.max(sh.radii[0],.001),v=(y-sh.center[1])/Math.max(sh.radii[1],.001);value-=Math.exp(-(q*q+v*v)*2.1)*sh.strength}}
   const f=clamp(value)*(material.colors.length-1),level=clamp(material.dither?Math.floor(f)+(fract(f)>th?1:0):Math.floor(f+.5),0,material.colors.length-1);return c.palette[material.colors[level]];
  }});r.end();if(options.opaque){this.ctx.save();this.ctx.globalCompositeOperation='destination-over';this.ctx.fillStyle='#fff';this.ctx.fillRect(0,0,c.grid,c.grid);this.ctx.restore()}this.scene.details?.(this.ctx,s,options.zoom||1,options);return s;
 }
 capture(scale=3){const c=document.createElement('canvas');c.width=c.height=this.canvas.width*scale;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]}
 destroy(){this.destroyed=true;this.raster=null}
}

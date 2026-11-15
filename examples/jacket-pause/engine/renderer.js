import {cameraBasis} from './math.js';
import {SoftwareRenderer} from './software.js';
const VS=`#version 300 es
precision highp float;
in vec3 aP,aN;in float aM;uniform vec3 uTarget,uRight,uUp,uForward;uniform float uSpan;
out vec3 vP,vN;flat out int vM;
void main(){vec3 q=aP-uTarget;gl_Position=vec4(2.*dot(q,uRight)/uSpan,2.*dot(q,uUp)/uSpan,-dot(q,uForward)/12.,1.);vP=aP;vN=aN;vM=int(aM+.5);}`;
const FS=`#version 300 es
precision highp float;
in vec3 vP,vN;flat in int vM;uniform vec3 uColors[64];uniform vec4 uMaterials[12];uniform vec3 uLight;
uniform vec4 uField,uShadow;uniform float uFieldRotation;uniform float uTime;out vec4 o;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float b2(vec2 p){p=floor(p);return fract(dot(p,vec2(.5,p.y*.75)));}
float b4(vec2 p){return b2(p*.5)*.25+b2(p);}
void main(){vec4 m=uMaterials[vM];float th=b4(floor(gl_FragCoord.xy));float shade=.23+.77*max(0.,dot(normalize(vN),normalize(uLight)));
 if(vM==0 && uField.z>.5){
  vec2 local=vec2(vP.x-vP.z,vP.x+vP.z)*.70710678;
  float cr=cos(uFieldRotation),sr=sin(uFieldRotation);local=vec2(cr*local.x-sr*local.y,sr*local.x+cr*local.y);
  float edge=length(local/uField.xy)+.065*(noise(local*4.)-.5);float coverage=1.-smoothstep(.77,1.08,edge);if(coverage<=th)discard;
  shade=.52+.09*(noise(local*3.7)-.5)+.025*(noise(local*16.)-.5);
  // Soft contact shade follows the authored resting body footprint, not an image cutout.
  vec2 q=(local-uShadow.xy)/max(uShadow.zw,vec2(.001));
  float shadow=exp(-dot(q,q)*2.1);shade-=shadow*uField.w;
 }
 float x=clamp(shade,0.,1.)*(m.y-1.);int level=int(floor(x));
 // m.z controls whether a material gets ordered transitions or clean toon clusters.
 if(m.z>.5){if(fract(x)>th)level++;}else level=int(floor(x+.5));
 level=clamp(level,0,int(m.y)-1);o=vec4(uColors[int(m.x)+level],1.);
}`;
export class HybridRenderer {
 constructor(canvas,scene){
  const c=scene.config;
  if(!Number.isInteger(c.grid)||c.grid<1||!(c.loop>0)||!(c.fps>0))throw Error('Invalid grid/loop/fps');
  if(!c.materials?.length||c.materials.length>12||c.materials.reduce((n,m)=>n+m.colors.length,0)>64||c.materials.some(m=>!m.colors.length||m.colors.some(i=>!c.palette[i])))throw Error('Invalid materials: maximum 12 materials and 64 ramp entries');
  this.canvas=canvas;this.scene=scene;this.surface=document.createElement('canvas');this.surface.width=this.surface.height=scene.config.grid;const gl=this.gl=this.surface.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('当前浏览器需要 WebGL2 才能预览场景。');
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};const p=this.program=gl.createProgram();const shaders=[shader(gl.VERTEX_SHADER,VS),shader(gl.FRAGMENT_SHADER,FS)];for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));for(const s of shaders)gl.deleteShader(s);gl.useProgram(p);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);for(const [name,size,offset]of [['aP',3,0],['aN',3,12],['aM',1,24]]){const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
  this.u=Object.fromEntries(['uTarget','uRight','uUp','uForward','uSpan','uColors','uMaterials','uLight','uField','uShadow','uFieldRotation','uTime'].map(n=>[n,gl.getUniformLocation(p,n)]));
  const {config}=scene,b=cameraBasis(config.camera),colors=[],mats=[];for(const mat of config.materials){mats.push(colors.length/3,mat.colors.length,mat.dither?1:0,0);for(const index of mat.colors)colors.push(...config.palette[index].map(v=>v/255))}while(colors.length<64*3)colors.push(1);while(mats.length<12*4)mats.push(0);
  gl.uniform3fv(this.u.uColors,new Float32Array(colors));gl.uniform4fv(this.u.uMaterials,new Float32Array(mats));gl.uniform3fv(this.u.uTarget,config.camera.target);gl.uniform3fv(this.u.uRight,b.right);gl.uniform3fv(this.u.uUp,b.up);gl.uniform3fv(this.u.uForward,b.forward);gl.uniform3fv(this.u.uLight,config.light);const f=config.field,shadow=f?.shadow;gl.uniform1f(this.u.uFieldRotation,(f?.angle||0)*Math.PI/180);gl.uniform4fv(this.u.uField,[...(f?.radii||[1,1]),f?1:0,shadow?.strength||0]);gl.uniform4fv(this.u.uShadow,[...(shadow?.center||[0,0]),...(shadow?.radii||[1,1])]);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  this.ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=config.grid;
 }
 draw(t,options={}){if(this.destroyed)throw Error('Renderer destroyed');const gl=this.gl,config=this.scene.config,n=config.grid,state=this.scene.state(t,options),zoom=options.zoom||1;gl.viewport(0,0,n,n);gl.useProgram(this.program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(this.u.uSpan,config.camera.span/zoom);gl.uniform1f(this.u.uTime,state.time);const mesh=this.scene.geometry(state);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,mesh.length/7);this.ctx.clearRect(0,0,n,n);this.ctx.imageSmoothingEnabled=false;if(options.opaque){this.ctx.fillStyle='#fff';this.ctx.fillRect(0,0,n,n)}this.ctx.drawImage(this.surface,0,0);this.scene.details?.(this.ctx,state,zoom,options);return state;}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
 capture(scale=3){const c=document.createElement('canvas');c.width=c.height=this.canvas.width*scale;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]}
}

export function mountRenderer(canvas,scene,options={}){return scene.createRenderer?scene.createRenderer(canvas,options):options.backend==='cpu'?new SoftwareRenderer(canvas,scene):new HybridRenderer(canvas,scene)}

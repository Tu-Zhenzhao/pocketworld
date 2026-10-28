// Authored native pixel character + geometry scene. No reference image pixels.
export const GRID = 240;
export const LOOP = 12;
export const CAMERA = Object.freeze({azimuth:45,elevation:30,span:6.15,target:[0,.63,0]});
const pi=Math.PI, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/Math.hypot(...a));
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const hex=s=>s.match(/\w\w/g).map(n=>parseInt(n,16)/255);
export const RAMPS=[
 ['495648','788262','a4ad87','c5cbaa'], // grass
 ['63665d','999b88','c2c1aa','dedbc5'], // stone
 ['383d3e','535e63','778384','a2adab'], // trousers
 ['283b49','3f5665','627886','93a2a3'], // navy
 ['a5a998','c5c8b9','e1e1d0','f5f1df'], // ivory
 ['925b43','be8664','dfa77d','f2c79b'], // skin
 ['302d29','514133','74573b','98724e'], // hair / bark
 ['614632','8c6543','b58b5c','d2ad78'], // wood
 ['234940','3e7864','68a38b','a0c2a4'], // jade ball
 ['873d33','b85843','df8055','f1ad78'], // coral ball
 ['9a702d','c99c3c','ebc35d','f5dda0'], // gold ball
 ['3c5137','617949','8da263','b4c489'], // tree
 ['3f3931','5e4b3b','80664d','a28663'], // shoes
].map(r=>r.map(hex));
export const COMMON_PALETTE=[[255,255,255],[61,73,51],[104,125,73],[153,173,109],[194,204,158],[100,101,88],[155,156,136],[207,205,180],[239,235,214],[40,59,73],[61,76,84],[94,115,127],[151,165,167],[146,91,67],[190,134,100],[223,167,125],[242,199,155],[57,46,35],[116,87,59],[181,139,92],[62,120,100],[104,163,139],[184,88,67],[235,195,93]];
// All three groups use the same 24 actual colors, including white.
for(const ramp of RAMPS)for(let i=0;i<ramp.length;i++){const c=ramp[i].map(v=>v*255);const best=COMMON_PALETTE.reduce((a,b)=>b.reduce((s,v,j)=>s+(v-c[j])**2,0)<a.reduce((s,v,j)=>s+(v-c[j])**2,0)?b:a);ramp[i]=best.map(v=>v/255)}
export const PALETTE=RAMPS.flat().map(c=>c.map(v=>Math.round(v*255)));
export const basis=(()=>{const az=pi/4,el=pi/6,forward=[Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)];const right=norm(cross([0,1,0],forward));return {forward,right,up:cross(forward,right)}})();
export function project(p,grid=GRID,zoom=1){const q=sub(p,CAMERA.target);return [grid*(.5+dot(q,basis.right)/CAMERA.span*zoom),grid*(.5-dot(q,basis.up)/CAMERA.span*zoom)]}
export function actorPoint(p,actorX=0){const c=Math.SQRT1_2;return [p[0]*c+p[2]*c+.12+actorX,p[1],-p[0]*c+p[2]*c+.14]}
const mod=(a,n)=>(a%n+n)%n;
// One cascade clock. Ball endpoints and hand targets come from these same functions.
const FLIGHT=1, CARRY=.2, HALF=FLIGHT+CARRY;
const hermite=(a,b,va,vb,u)=>{const u2=u*u,u3=u2*u;return (2*u3-3*u2+1)*a+(u3-2*u2+u)*va+(-2*u3+3*u2)*b+(u3-u2)*vb};
export function handAt(side,t){
 const releaseOffset=side<0?0:.4,phase=mod(t-releaseOffset,.8),base=.94;
 if(phase<.6){const u=phase/.6;return [side*(.20+.13*smooth(u)),base-.045*Math.sin(pi*u),.08]}
 const u=(phase-.6)/.2;
 return [side*hermite(.33,.20,.106,-.106,u),base-.84*u*(1-u),.08];
}
export function ballAt(i,t){
 const u=mod(t+i*.8,2*HALF),back=u>=HALF,q=back?u-HALF:u,side=back?1:-1;
 if(q<FLIGHT){const s=q/FLIGHT;return {p:[side*(.20-.53*s),.94+4*1.05*s*(1-s),.08],held:false,side,phase:s}}
 const s=(q-FLIGHT)/CARRY;
 return {p:[-side*hermite(.33,.20,.106,-.106,s),.94-.84*s*(1-s),.08],held:true,side:-side,phase:s};
}
export function world(t,opts={}){
 t=mod(t,LOOP);const ax=opts.actorX||0,lean=.022*Math.sin(t*2*pi/3),breath=.008*Math.sin(t*2*pi/4);
 const local={footL:[-.12,.06,.02],footR:[.12,.06,-.015],kneeL:[-.13,.38,.025],kneeR:[.10,.38,.0],hipL:[-.09+lean,.73,0],hipR:[.09+lean,.73,0],waist:[lean,.77,0],neck:[lean,1.22+breath,0],head:[lean+.008,1.39+breath,.005],shoulderL:[-.19+lean,1.16+breath,0],shoulderR:[.19+lean,1.16+breath,0],handL:handAt(-1,t),handR:handAt(1,t)};
 // Two-link analytic IK: hands meet the balls without stretching either arm segment.
 for(const side of [-1,1]){const key=side<0?'L':'R',h=local['hand'+key],a=local['shoulder'+key],d=sub(h,a),len=Math.hypot(...d),axis=norm(d),l1=.23,l2=.235,along=(l1*l1-l2*l2+len*len)/(2*len),height=Math.sqrt(Math.max(0,l1*l1-along*along)),preferred=[side,-.22,-.13],bend=norm(sub(preferred,mul(axis,dot(preferred,axis))));local['elbow'+key]=add(add(a,mul(axis,along)),mul(bend,height));}
 const joints=Object.fromEntries(Object.entries(local).map(([k,p])=>[k,actorPoint(p,ax)]));
 const balls=[0,1,2].map(i=>({...ballAt(i,t),id:i,p:actorPoint(ballAt(i,t).p,ax),mat:8+i}));
 return {t,joints,balls,actorX:ax,local};
}
function meshBuilder(){
 const a=[];
 const vertex=(p,n,m)=>a.push(...p,...n,m);
 const tri=(p,q,r,m,n)=>{n=n||norm(cross(sub(q,p),sub(r,p)));vertex(p,n,m);vertex(q,n,m);vertex(r,n,m)};
 const quad=(p,q,r,s,m,n)=>{tri(p,q,r,m,n);tri(p,r,s,m,n)};
 function box(c,s,m){const [x,y,z]=c,[a,b,d]=s.map(v=>v/2);quad([x-a,y+b,z-d],[x-a,y+b,z+d],[x+a,y+b,z+d],[x+a,y+b,z-d],m,[0,1,0]);quad([x-a,y-b,z+d],[x-a,y+b,z+d],[x+a,y+b,z+d],[x+a,y-b,z+d],m,[0,0,1]);quad([x+a,y-b,z-d],[x+a,y-b,z+d],[x+a,y+b,z+d],[x+a,y+b,z-d],m,[1,0,0]);quad([x-a,y-b,z-d],[x+a,y-b,z-d],[x+a,y+b,z-d],[x-a,y+b,z-d],m,[0,0,-1]);quad([x-a,y-b,z-d],[x-a,y+b,z-d],[x-a,y+b,z+d],[x-a,y-b,z+d],m,[-1,0,0]);}
 function ellipsoid(c,s,m,seg=12,rings=8){for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){
  const sample=(i,j)=>{const v=-pi/2+pi*i/rings,u=2*pi*j/seg,n=[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)];return [add(c,n.map((q,k)=>q*s[k])),norm(n.map((q,k)=>q/s[k]))]};
  const pts=[sample(y,x),sample(y+1,x),sample(y+1,x+1),sample(y,x+1)];for(const k of [0,1,2,0,2,3])vertex(pts[k][0],pts[k][1],typeof m==='function'?m(y,x):m);
 }}
 function tube(p,q,r0,r1,m,segments=10){const d=norm(sub(q,p)),v=norm(cross(d,Math.abs(d[1])>.95?[1,0,0]:[0,1,0])),w=cross(d,v);
  for(let k=0;k<segments;k++){const u=k*2*pi/segments,u2=(k+1)*2*pi/segments;const n=add(mul(v,Math.cos(u)),mul(w,Math.sin(u))),n2=add(mul(v,Math.cos(u2)),mul(w,Math.sin(u2)));const pts=[add(p,mul(n,r0)),add(q,mul(n,r1)),add(q,mul(n2,r1)),add(p,mul(n2,r0))];const ns=[n,n,n2,n2];for(const j of [0,1,2,0,2,3])vertex(pts[j],ns[j],m);tri(p,pts[3],pts[0],m,mul(d,-1));tri(q,pts[1],pts[2],m,d);}
 }
 function disc(c,rx,rz,m,segments=40){for(let i=0;i<segments;i++){const u=i*2*pi/segments,v=(i+1)*2*pi/segments;tri(c,add(c,[rx*Math.cos(u),0,rz*Math.sin(u)]),add(c,[rx*Math.cos(v),0,rz*Math.sin(v)]),m,[0,1,0])}}
 return {a,tri,quad,box,ellipsoid,tube,disc};
}
const random=i=>{const n=Math.sin(i*71.217+7.3)*43758.5453;return n-Math.floor(n)};
function background(t){const m=meshBuilder();
 m.disc([0,-.055,0],1.83,1.33,0,64);m.disc([.12,-.035,.14],1.2,.89,1,52);
 // Cobblestones are low-profile geometry. Gaps remain a designed cell-wide feature.
 for(let i=0;i<70;i++){const x=(random(i*4)-.5)*2.4,z=(random(i*4+1)-.5)*1.75;if((x*x/1.44+z*z/.77)>1)continue;
  m.box([x,-.018,z],[.15+random(i+302)*.10,.035,.10+random(i+402)*.09],1);}
 // Fine, sparse native grass: rooted on the same ground rather than a full-frame noise layer.
 for(let i=0;i<210;i++){const u=random(i*3)*2*pi,r=.88+.16*random(i*3+1),x=Math.cos(u)*1.83*r,z=Math.sin(u)*1.33*r;const h=.045+.08*random(i+32),s=.012*Math.sin(t*2*pi/3+i);m.tri([x-.008,-.03,z],[x+s,h,z],[x+.008,-.03,z],0,[.1,.7,.6]);}
 const tx=-1.00,tz=-.52;
 m.tube([tx,0,tz],[tx+.04,1.42,tz],.085,.044,6);m.tube([tx+.02,1.0,tz],[tx-.33,1.51,tz-.03],.045,.015,6);m.tube([tx+.025,1.12,tz],[tx+.30,1.57,tz+.04],.04,.015,6);
 for(let i=0;i<14;i++){const u=i*2.4,r=.18+.18*random(i+40),c=[tx+Math.cos(u)*r,1.65+.32*random(i+70),tz+Math.sin(u)*r*.7];c[0]+=.014*Math.sin(t*2*pi/6+i*.7);m.ellipsoid(c,[.27,.23,.25],11,9,6);}
 // Slatted bench and a small jug show whether narrow structures survive.
 for(const x of [.69,1.32])for(const z of [-.33,-.62])m.box([x,.17,z],[.055,.34,.055],6);
 for(let k=0;k<3;k++)m.box([1.0,.36,-.33-k*.12],[.92,.045,.085],7);
 for(const x of [.66,1.35])m.box([x,.57,-.67],[.045,.49,.045],6);
 for(let k=0;k<2;k++)m.box([1.,.57+k*.11,-.66],[.92,.075,.045],7);
 m.ellipsoid([.96,.46,-.43],[.055,.08,.055],9,10,6);
 return new Float32Array(m.a);
}
function character(s){const m=meshBuilder(),j=s.joints;
 for(const k of ['L','R']){m.tube(j['hip'+k],j['knee'+k],.095,.065,2);m.tube(j['knee'+k],j['foot'+k],.065,.05,2);m.ellipsoid(add(j['foot'+k],[.018,-.015,.035]),[.073,.045,.11],12,10,6);}
 const torso=actorPoint([s.local.waist[0],1.00,0],s.actorX);
 m.ellipsoid(torso,[.19,.255,.115],y=>y%2?3:4,16,16);
 m.tube(j.neck,add(j.neck,[0,.075,0]),.055,.052,5);
 m.ellipsoid(j.head,[.112,.139,.105],5,16,10);
 // Close-fitting sculpted hair, nose, and restrained one-cell facial marks.
 m.ellipsoid(add(j.head,[-.014,.065,-.018]),[.112,.095,.105],6,12,8);
 m.ellipsoid(add(j.head,[.065,-.005,.076]),[.035,.028,.035],5,8,6);
 m.ellipsoid(add(j.head,[.078,.032,.067]),[.010,.010,.009],6,6,4);
 for(const k of ['L','R']){
  const a=j['shoulder'+k],e=j['elbow'+k],h=j['hand'+k],sleeve=mix(a,e,.45);
  m.tube(a,sleeve,.068,.056,4);m.tube(sleeve,e,.048,.041,5);m.ellipsoid(e,[.041,.041,.041],5,8,6);m.tube(e,h,.040,.028,5);m.ellipsoid(h,[.047,.028,.040],5,10,6);
 }
 return new Float32Array(m.a);
}
const vs=`#version 300 es
precision highp float;
in vec3 aP;in vec3 aN;in float aM;uniform vec3 uTarget,uRight,uUp,uForward;uniform float uSpan,uTime;
out vec3 vP,vN;flat out int vM;
void main(){vec3 q=aP;if(aM>10.5&&aM<11.5)q.x+=.014*sin(uTime*6.2831853/6.+aP.z*2.);if(aM<.5&&aP.y>.01)q.x+=.012*(aP.y/.13)*sin(uTime*6.2831853/3.+aP.z*6.);vec3 p=q-uTarget;gl_Position=vec4(2.*dot(p,uRight)/uSpan,2.*dot(p,uUp)/uSpan,-dot(p,uForward)/12.,1.);vP=q;vN=aN;vM=int(aM+.5);}`;
const fs=`#version 300 es
precision highp float;in vec3 vP,vN;flat in int vM;uniform vec3 uPal[52];uniform float uTime,uFlat;uniform vec3 uBall[3];uniform vec3 uFoot;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float b2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
void main(){vec3 n=normalize(vN);float shade=.34+.66*max(0.,dot(n,normalize(vec3(-.6,1.,.8))));
 if(uFlat>.5)shade=.70;
 if(vM==1){shade+=.055*(hash(floor(vP.xz*22.))-.5);}
 if(vM==0||vM==11){shade+=.085*(hash(floor(vP.xz*31.))-.5);}
 if(vM==0||vM==1){shade=.70;
  vec2 q=vP.xz-uFoot.xz-vec2(.32,-.18);float sh=exp(-dot(q*vec2(.9,1.8),q*vec2(.9,1.8))*2.4);shade*=1.-.43*sh;
  vec2 tr=vP.xz-vec2(-.65,-.70);shade*=1.-.19*exp(-dot(tr,tr)*2.7);
  for(int i=0;i<3;i++){vec2 d=vP.xz-uBall[i].xz-vec2(.19,-.11)*uBall[i].y;float r=.075+uBall[i].y*.034;shade*=1.-.15*exp(-dot(d,d)/(r*r));}
 }
 float th=b4(floor(gl_FragCoord.xy));float x=clamp(shade,0.,1.)*3.;int ix=int(floor(x));
 // Preserve readable garment/skin clusters; reserve full ordered shading for foliage and ground.
 if(vM>=2&&vM<=6)ix=int(floor(x+.5));else if(fract(x)>th)ix++;
 ix=clamp(ix,0,3);
 outColor=vec4(uPal[vM*4+ix],1.);
}`;
export class VolumeRenderer{
 constructor(canvas){this.canvas=canvas;this.background=background(0);const gl=this.gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});if(!gl)throw Error('需要 WebGL2');
  const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const p=this.p=gl.createProgram(),shaders=[compile(gl.VERTEX_SHADER,vs),compile(gl.FRAGMENT_SHADER,fs)];for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));for(const s of shaders)gl.deleteShader(s);
  this.buf=gl.createBuffer();this.u={};for(const name of ['uTarget','uRight','uUp','uForward','uSpan','uPal','uTime','uFlat','uBall','uFoot'])this.u[name]=gl.getUniformLocation(p,name);
  gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);for(const [name,size,offset]of [['aP',3,0],['aN',3,12],['aM',1,24]]){let loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
  gl.uniform3fv(this.u.uPal,new Float32Array(RAMPS.flat(2)));gl.uniform3fv(this.u.uTarget,CAMERA.target);gl.uniform3fv(this.u.uRight,basis.right);gl.uniform3fv(this.u.uUp,basis.up);gl.uniform3fv(this.u.uForward,basis.forward);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
 }
 draw(t,opts={}){const gl=this.gl,s=world(t,opts),grid=opts.grid||GRID;if(this.canvas.width!==grid)this.canvas.width=this.canvas.height=grid;gl.viewport(0,0,grid,grid);gl.useProgram(this.p);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(this.u.uSpan,CAMERA.span/(opts.zoom||1));gl.uniform1f(this.u.uTime,t);gl.uniform1f(this.u.uFlat,opts.flat?1:0);gl.uniform3fv(this.u.uBall,new Float32Array(s.balls.flatMap(b=>b.p)));gl.uniform3fv(this.u.uFoot,actorPoint([0,0,0],s.actorX));
  this.drawMesh(this.background);
  if(!opts.noActor)this.drawMesh(character(s));
  if(!opts.noBalls){const b=meshBuilder();for(const ball of s.balls)b.ellipsoid(ball.p,[.047,.047,.047],ball.mat,12,8);this.drawMesh(new Float32Array(b.a));}
  return s;
 }
 drawMesh(a){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,a,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,a.length/7)}
 destroy(){this.gl.deleteBuffer(this.buf);this.gl.deleteProgram(this.p);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
 read(){const gl=this.gl,n=this.canvas.width,raw=new Uint8Array(n*n*4);gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,raw);const a=new Uint8ClampedArray(raw.length);for(let y=0;y<n;y++)a.set(raw.subarray((n-1-y)*n*4,(n-y)*n*4),y*n*4);return new ImageData(a,n,n)}
}
// Hard cell rasterizer. Shapes own cells; no Canvas antialiasing or image reduction.
class PixelPen{
 constructor(ctx,n){this.ctx=ctx;this.n=n;this.im=ctx.getImageData(0,0,n,n);this.a=this.im.data}
 pixel(x,y,c){x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=this.n||y>=this.n)return;let i=(y*this.n+x)*4;this.a[i]=c[0];this.a[i+1]=c[1];this.a[i+2]=c[2];this.a[i+3]=255}
 poly(p,c){let minX=Math.floor(Math.min(...p.map(a=>a[0]))),maxX=Math.ceil(Math.max(...p.map(a=>a[0]))),minY=Math.floor(Math.min(...p.map(a=>a[1]))),maxY=Math.ceil(Math.max(...p.map(a=>a[1])));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y+.5)!=(p[j][1]>y+.5)&&x+.5<(p[j][0]-p[i][0])*(y+.5-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside}if(inside)this.pixel(x,y,c)}}
 ellipse(c,rx,ry,col){for(let y=Math.floor(c[1]-ry);y<=Math.ceil(c[1]+ry);y++)for(let x=Math.floor(c[0]-rx);x<=Math.ceil(c[0]+rx);x++)if(((x+.5-c[0])/rx)**2+((y+.5-c[1])/ry)**2<=1)this.pixel(x,y,col)}
 limb(a,b,r0,r1,c){let d=sub(b,a),n=norm([-d[1],d[0]]);this.poly([add(a,mul(n,r0)),add(b,mul(n,r1)),add(b,mul(n,-r1)),add(a,mul(n,-r0))],c);this.ellipse(b,r1,r1,c)}
 finish(){this.ctx.putImageData(this.im,0,0)}
}
const rgb=(m,k)=>RAMPS[m][k].map(v=>Math.round(v*255));
export function drawSprite(ctx,s,opts={}){
 const n=ctx.canvas.width,scale=n/CAMERA.span*(opts.zoom||1),pen=new PixelPen(ctx,n),p=Object.fromEntries(Object.entries(s.joints).map(([k,v])=>[k,project(v,n,opts.zoom)]));
 const skin=rgb(5,2),shade=rgb(5,1),shirt=rgb(4,2),blue=rgb(3,1),pants=rgb(2,1);
 for(const k of ['L','R']){pen.limb(p['hip'+k],p['knee'+k],.087*scale,.064*scale,pants);pen.limb(p['knee'+k],p['foot'+k],.064*scale,.042*scale,k==='L'?rgb(2,2):pants);let f=p['foot'+k];pen.poly([[f[0]-2.2,f[1]-1],[f[0]+3.2,f[1]-1],[f[0]+3.8,f[1]+1],[f[0]-2.2,f[1]+1]],rgb(12,1))}
 const sl=p.shoulderL,sr=p.shoulderR,w=project(s.joints.waist,n,opts.zoom),body=[[sl[0]-1,sl[1]],[sr[0]+1,sr[1]],[w[0]+5.4,w[1]],[w[0]-5.4,w[1]]];pen.poly(body,shirt);
 // Author horizontal pixel clusters inside the actual silhouette, deliberately preserving gaps.
 const top=Math.min(sl[1],sr[1]);for(let y=Math.ceil(top);y<w[1];y++){if(Math.floor((y-top)/2)%2===0){let u=(y-top)/(w[1]-top),l=sl[0]-1+(w[0]-5.4-sl[0]+1)*u,r=sr[0]+1+(w[0]+5.4-sr[0]-1)*u;for(let x=Math.ceil(l);x<r;x++)pen.pixel(x,y,blue)}}
 pen.limb(p.neck,add(p.neck,[0,-3]),1.8,1.7,skin);
 const h=p.head;pen.ellipse(h,4.3,5.2,skin);pen.poly([[h[0]-4,h[1]-1],[h[0]-3,h[1]-5],[h[0]+1,h[1]-6],[h[0]+4,h[1]-3],[h[0]+1,h[1]-3],[h[0]-2,h[1]-1]],rgb(6,1));pen.poly([[h[0]+1,h[1]+2],[h[0]+4,h[1]+1],[h[0]+3,h[1]+4],[h[0],h[1]+5]],shade);pen.pixel(h[0]+1,h[1]-1,rgb(6,0));pen.pixel(h[0]+4,h[1],rgb(5,3));
 for(const k of ['L','R']){const sh=p['shoulder'+k],el=p['elbow'+k],ha=p['hand'+k],mid=mix(sh,el,.42);pen.limb(sh,mid,2.8,2.4,shirt);pen.limb(mid,el,2.0,1.6,skin);pen.limb(el,ha,1.6,1.0,k==='L'?shade:skin);pen.ellipse(ha,1.7,1.0,skin);pen.pixel(ha[0]+(k==='L'?-1:1),ha[1]-1,rgb(5,3));}
 if(!opts.noBalls)for(const b of s.balls){let q=project(b.p,n,opts.zoom);pen.ellipse(q,1.9,1.9,rgb(b.mat,2));pen.pixel(q[0]-.7,q[1]-.7,rgb(b.mat,3));pen.pixel(q[0]+.8,q[1]+.7,rgb(b.mat,1))}
 pen.finish();return s;
}

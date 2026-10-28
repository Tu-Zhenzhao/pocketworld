export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const normalize=a=>scale(a,1/(Math.hypot(...a)||1));
export const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export const clamp=(a,lo=0,hi=1)=>Math.min(hi,Math.max(lo,a));
export const mod=(t,n)=>(t%n+n)%n;
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
export const random=i=>{const v=Math.sin(i*71.217+7.3)*43758.5453;return v-Math.floor(v)};
export const localToWorld=p=>[(p[0]+p[2])*Math.SQRT1_2,p[1],(-p[0]+p[2])*Math.SQRT1_2];
export function cameraBasis(camera){const a=camera.azimuth*Math.PI/180,e=camera.elevation*Math.PI/180,forward=[Math.cos(e)*Math.sin(a),Math.sin(e),Math.cos(e)*Math.cos(a)],right=normalize(cross([0,1,0],forward));return {forward,right,up:cross(forward,right)}}
export function project(p,camera,grid,zoom=1){const b=cameraBasis(camera),q=sub(p,camera.target);return [grid*(.5+dot(q,b.right)/camera.span*zoom),grid*(.5-dot(q,b.up)/camera.span*zoom)]}

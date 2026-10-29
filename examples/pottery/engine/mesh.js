import {add,sub,scale,cross,dot,normalize} from './math.js';
export class MeshBuilder {
 constructor(){this.vertices=[]}
 vertex(p,n,m){this.vertices.push(...p,...n,m)}
 triangle(a,b,c,m,n){n=n||normalize(cross(sub(b,a),sub(c,a)));for(const p of [a,b,c])this.vertex(p,n,m)}
 quad(a,b,c,d,m,n){this.triangle(a,b,c,m,n);this.triangle(a,c,d,m,n)}
 ellipsoid(center,radius,material,{segments=18,rings=12}={}){
  const sample=(i,j)=>{const v=-Math.PI/2+Math.PI*i/rings,u=2*Math.PI*j/segments,n=[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)];return [add(center,n.map((q,k)=>q*radius[k])),normalize(n.map((q,k)=>q/radius[k]))]};
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const p=[sample(i,j),sample(i+1,j),sample(i+1,j+1),sample(i,j+1)];for(const k of [0,1,2,0,2,3])this.vertex(p[k][0],p[k][1],typeof material==='function'?material(i,j):material)}
 }
 tube(a,b,r0,r1,m,segments=12){const axis=normalize(sub(b,a)),v=normalize(cross(axis,Math.abs(axis[1])>.95?[1,0,0]:[0,1,0])),w=cross(axis,v);for(let k=0;k<segments;k++){const angle=k*Math.PI*2/segments,angle2=(k+1)*Math.PI*2/segments,n=add(scale(v,Math.cos(angle)),scale(w,Math.sin(angle))),n2=add(scale(v,Math.cos(angle2)),scale(w,Math.sin(angle2))),p=[add(a,scale(n,r0)),add(b,scale(n,r1)),add(b,scale(n2,r1)),add(a,scale(n2,r0))];for(const i of [0,1,2,0,2,3])this.vertex(p[i],i<2?n:n2,m);this.triangle(a,p[3],p[0],m,scale(axis,-1));this.triangle(b,p[1],p[2],m,axis)}}
 curve(points,r0,r1,m){for(let i=0;i<points.length-1;i++){const u=i/(points.length-1),v=(i+1)/(points.length-1);this.tube(points[i],points[i+1],r0+(r1-r0)*u,r0+(r1-r0)*v,m,10)}}
 disc(c,rx,rz,m,segments=48){for(let i=0;i<segments;i++){const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;this.triangle(c,add(c,[rx*Math.cos(a),0,rz*Math.sin(a)]),add(c,[rx*Math.cos(b),0,rz*Math.sin(b)]),m,[0,1,0])}}
 loft(sections,m,segments=28){
  const sample=(s,j)=>{const a=j*2*Math.PI/segments;return [s.x,s.y+s.ry*Math.cos(a),s.rz*Math.sin(a)]};
  for(let k=0;k<sections.length-1;k++)for(let j=0;j<segments;j++){
   const s=sections[k],t=sections[k+1],a=sample(s,j),b=sample(t,j),c=sample(t,j+1),d=sample(s,j+1),n=normalize(cross(sub(d,a),sub(b,a)));this.quad(a,b,c,d,m,n);
  }
  for(const [s,flip]of [[sections[0],-1],[sections.at(-1),1]])for(let j=0;j<segments;j++)this.triangle([s.x,s.y,0],sample(s,j),sample(s,j+1),m,[flip,0,0]);
 }
 finish(transform=p=>p){const out=new Float32Array(this.vertices);for(let i=0;i<out.length;i+=7){out.set(transform(Array.from(out.slice(i,i+3))),i);out.set(normalize(transform(Array.from(out.slice(i+3,i+6)))),i+3)}return out}
}

import config from './config.js';
import {MeshBuilder} from '../../engine/mesh.js';
import {PixelPen} from '../../engine/pixels.js';
import {add,sub,scale,cross,normalize,mix,random,mod,localToWorld,project} from '../../engine/math.js';
const tau=Math.PI*2;
// Rotate the whole authored world, including accents/contacts. A near-side, three-quarter view.
const yaw=config.cowYaw*Math.PI/180,axisX=(Math.cos(yaw)-Math.sin(yaw))*Math.SQRT1_2,axisZ=(Math.cos(yaw)+Math.sin(yaw))*Math.SQRT1_2;
export function world(p){return [axisX*p[0]+axisZ*p[2],p[1],-axisZ*p[0]+axisX*p[2]]}
// Authored normals are already normalized; a rigid rotation preserves their lengths.
function finishWorld(m){const out=new Float32Array(m.vertices);for(let i=0;i<out.length;i+=7)for(const j of [0,3]){const x=out[i+j],z=out[i+j+2];out[i+j]=axisX*x+axisZ*z;out[i+j+2]=-axisZ*x+axisX*z}return out}
const headPivot=[-1.065,.95,0];
function turnHead(p){const a=config.headYaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c]}
export const H=p=>add(add(headPivot,turnHead(sub(p,headPivot))),[0,.10,0]);
export function jawPoint(jaw,p){const d=sub(p,anchors.jawHinge),c=Math.cos(jaw.angle),s=Math.sin(jaw.angle);return H(add(anchors.jawHinge,[d[0]*c-d[1]*s,d[0]*s+d[1]*c,d[2]+jaw.side]))}
export const anchors={
 hips:[-.28,1.235,.025],neck:[.53,1.33,-.025],head:[.745,1.325,-.015],hat:[.76,1.442,-.02],
 kneeNear:[-.57,1.68,.23],ankleNear:[-.72,1.33,.13],footNear:[-.83,1.32,.14],
 kneeFar:[-.60,1.27,-.20],ankleFar:[-.77,1.29,-.15],footFar:[-.88,1.30,-.12],
 shoulderNear:[.42,1.315,.14],elbowNear:[.49,1.215,.39],handNear:[.82,1.245,.10],
 shoulderFar:[.42,1.315,-.155],elbowFar:[.54,1.375,-.35],handFar:[.81,1.31,-.16],
 hoofFrontNear:[-1.07,.095,.54],hoofRearNear:[.65,.09,.58],hoofFrontFar:[-.66,.088,-.28],hoofRearFar:[.72,.09,-.38],
 eye:[-1.43,1.16,.205],nose:[-1.635,.96,.15],jawHinge:[-1.28,.99,0]
};
const body=[{x:-1.02,y:.63,ry:.28,rz:.32},{x:-.82,y:.68,ry:.43,rz:.43},{x:-.52,y:.64,ry:.46,rz:.52},{x:-.12,y:.63,ry:.50,rz:.59},{x:.32,y:.625,ry:.495,rz:.58},{x:.72,y:.72,ry:.50,rz:.49},{x:1.02,y:.63,ry:.38,rz:.35},{x:1.18,y:.46,ry:.14,rz:.15}];
const tufts=[];for(let i=0;tufts.length<config.field.tufts&&i<2000;i++){const a=random(i*9)*tau,r=.63+.35*random(i*9+1),p=[Math.cos(a)*2.22*r,0,Math.sin(a)*1.28*r];if(p[0]>-1.65&&p[0]<1.3&&Math.abs(p[2])<.72)continue;tufts.push({base:p,height:.055+.105*random(i*9+2),phase:random(i*9+3)*tau,width:.012+.010*random(i*9+4)})}
const flowers=Array.from({length:13},(_,i)=>{const a=i*2.399+.3,r=.78+.16*random(i+210);return [Math.cos(a)*2.05*r,.01,Math.sin(a)*1.15*r]});
export function state(time,options={}){
 time=mod(time,config.loop);const m=config.motion,chew=(options.chew===false?0:time)/m.chewPeriod*tau,breath=(options.breath===false?0:time)/m.breathPeriod*tau,windTime=options.wind===false?0:time;
 const jaw={angle:m.jawAngle*(.5-.5*Math.cos(chew)),open:m.jawOpen*(.5-.5*Math.cos(chew)),side:m.jawSide*Math.sin(chew),hinge:H(anchors.jawHinge)};
 jaw.rawMouth=[-1.626,.89,.07];jaw.mouth=jawPoint(jaw,jaw.rawMouth);jaw.center=jawPoint(jaw,[-1.47,.88,.015]);
 return {time,options,chewPhase:chew,jaw,breath:{lift:m.bellyLift*(.5-.5*Math.cos(breath)),waist:[-.22,1.235,.025],sternum:[.38,1.31,.025]},anchors,tuftTips:tufts.map(g=>{const w=m.windAmplitude*(.72*Math.sin(windTime/m.windPeriod*tau+g.phase)+.28*Math.sin(windTime/(m.windPeriod/2)*tau+g.phase*.7));return add(g.base,[w,g.height,w*.38])})};
}
// Cross-section surface: continuous shirt/skin torso, with fixed support-facing underside.
const sections=[[-.34,1.225,.10,.155],[-.22,1.245,.105,.15],[-.06,1.255,.088,.16],[.10,1.27,.09,.165],[.26,1.30,.105,.17],[.43,1.31,.105,.18],[.54,1.32,.07,.105]];
function section(x){let j=0;while(j<sections.length-2&&x>sections[j+1][0])j++;const a=sections[j],b=sections[j+1],u=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));return a.map((v,i)=>i?v+(b[i]-v)*u:x)}
export function torsoPoint(s,x,angle){const [,cy,ry,rz]=section(x),u=(x+.22)/.60,w=u>0&&u<1?Math.sin(Math.PI*u)**2:0,c=Math.cos(angle),d=s.breath.lift*w*Math.max(0,c)**2;return [x,cy+ry*c+d,.025+(rz+s.breath.lift*w*.12)*Math.sin(angle)]}
const columns=Array.from({length:45},(_,i)=>{const x=-.34+.88*i/44;let j=0;while(j<sections.length-2&&x>sections[j+1][0])j++;const a=sections[j],b=sections[j+1],dx=b[0]-a[0],u=(x+.22)/.60;return {x,shape:section(x),slope:a.map((v,k)=>k?(b[k]-v)/dx:1),w:u>0&&u<1?Math.sin(Math.PI*u)**2:0,dw:u>0&&u<1?Math.sin(tau*u)*Math.PI/.60:0}});
const rings=Array.from({length:29},(_,i)=>[Math.cos(i*tau/28),Math.sin(i*tau/28)]);
function torso(s){const m=new MeshBuilder(),grid=columns.map(col=>rings.map(([c,a])=>{const [,cy,ry,rz]=col.shape,[,dy,dry,drz]=col.slope,lift=s.breath.lift,c2=c>0?c*c:0,y=cy+ry*c+lift*col.w*c2,z=.025+(rz+lift*col.w*.12)*a,yx=dy+dry*c+lift*col.dw*c2,zx=drz*a+lift*col.dw*.12*a,ya=-ry*a+(c>0?-2*lift*col.w*c*a:0),za=(rz+lift*col.w*.12)*c,nx=ya*zx-za*yx,ny=za,nz=-ya,len=Math.hypot(nx,ny,nz);return [col.x,y,z,nx/len,ny/len,nz/len]}));
 for(let i=0;i<44;i++)for(let j=0;j<28;j++){const material=(columns[i].x+columns[i+1].x)/2>.10?6:(columns[i].x+columns[i+1].x)/2<-.24?7:5;for(const [x,a] of [[i,j],[i+1,j],[i+1,j+1],[i,j],[i+1,j+1],[i,j+1]])m.vertices.push(...grid[x][a],material)}return m}

function hoof(m,c){const p=(x,y,z)=>add(c,[x,y,z]);m.quad(p(-.145,-.07,-.10),p(-.145,.055,-.085),p(-.145,.055,.085),p(-.145,-.07,.10),4,[-1,0,0]);m.quad(p(-.145,.055,-.085),p(.10,.07,-.075),p(.10,.07,.075),p(-.145,.055,.085),4,[0,1,0]);m.quad(p(-.145,-.07,.10),p(-.145,.055,.085),p(.10,.07,.075),p(.10,-.07,.085),4,[0,0,1]);m.quad(p(-.145,-.07,-.10),p(.10,-.07,-.085),p(.10,.07,-.075),p(-.145,.055,-.085),4,[0,0,-1]);}
function staticGeometry(){const m=new MeshBuilder();
 m.quad([-3,-.018,-2],[3,-.018,-2],[3,-.018,2],[-3,-.018,2],0,[0,1,0]);
 // The folded leg is a connected upper limb, rearward shin and a distinct dark hoof.
 for(const side of [-1,1]){const z=side*.38;
  m.ellipsoid([-.79,.34,z],[.31,.24,.23],1);m.tube([-.90,.27,z],[-.69,.135,z+side*.10],.12,.085,1,14);const frontHoof=side<0?[-.66,.088,-.28]:[-1.075,.088,z+side*.12];m.tube([-.69,.135,z+side*.10],frontHoof,.075,.062,1,12);hoof(m,frontHoof);
  m.ellipsoid([.79,.31,z],[.35,.28,.25],1);m.tube([.98,.2,z],[.64,.10,z+side*.16],.13,.075,1,14);hoof(m,[.63,.08,z+side*.16]);
 }
 m.loft(body,1,40);m.ellipsoid([-.76,.89,0],[.36,.42,.42],1);
 // Short, rising neck and deep skull. Broad nose is separated from the forehead by a sloping bridge.
 const head=new MeshBuilder();
 head.ellipsoid([-1.07,.97,.015],[.25,.31,.28],1);
 head.ellipsoid([-1.265,1.14,0],[.245,.255,.25],1,{segments:24,rings:16});
 head.ellipsoid([-1.395,1.04,.018],[.195,.19,.225],1,{segments:24,rings:16});
 head.ellipsoid([-1.525,.95,.015],[.145,.108,.235],2,{segments:24,rings:14});
 for(const side of [-1,1]){
  head.curve([[-1.24,1.31,.18*side],[-1.15,1.30,.34*side],[-1.02,1.36,.49*side],[-1.0,1.48,.54*side],[-1.08,1.58,.48*side],[-1.18,1.61,.39*side]],.072,.007,3);
  head.ellipsoid([-1.12,1.075,.355*side],[.15,.072,.145],1,{segments:14,rings:8});
 }
 for(let i=0;i<head.vertices.length;i+=7){m.vertices.push(...H(head.vertices.slice(i,i+3)),...turnHead(head.vertices.slice(i+3,i+6)),head.vertices[i+6])}
 // Resting tail follows the haunch, then curls onto the ground.
 m.curve([[1.10,.69,-.20],[1.30,.49,-.27],[1.39,.22,-.22],[1.43,.07,-.02],[1.29,.045,.19]],.032,.014,1);m.ellipsoid([1.28,.045,.20],[.10,.035,.065],4,{segments:12,rings:8});
 // Fixed rider supports. Arms form readable elbows and negative spaces around the hat.
 m.ellipsoid(anchors.hips,[.185,.10,.17],7,{segments:18,rings:10});
 for(const side of ['Far','Near']){
  const hip=add(anchors.hips,[0,0,side==='Near'?.105:-.10]),k=anchors['knee'+side],a=anchors['ankle'+side],f=anchors['foot'+side],hem=mix(hip,k,.43);
  m.tube(hip,hem,.094,.082,7,14);m.tube(hem,k,.067,.051,5,14);m.ellipsoid(k,[.057,.06,.058],5,{segments:14,rings:10});m.tube(k,a,.049,.031,5,14);m.ellipsoid(a,[.033,.039,.037],5,{segments:12,rings:8});m.tube(a,f,.038,.025,5,12);m.ellipsoid(f,[.055,.027,.053],5,{segments:12,rings:8});
 }
 m.tube(anchors.neck,[.64,1.35,-.015],.062,.053,5,14);m.ellipsoid(anchors.head,[.135,.114,.119],5,{segments:20,rings:12});m.ellipsoid([.807,1.29,-.04],[.102,.069,.115],4,{segments:16,rings:10});
 for(const side of ['Far','Near']){const shoulder=anchors['shoulder'+side],elbow=anchors['elbow'+side],hand=anchors['hand'+side],hem=mix(shoulder,elbow,.35);m.tube(shoulder,hem,.064,.057,6,14);m.tube(hem,elbow,.044,.037,5,14);m.ellipsoid(elbow,[.04,.041,.041],5,{segments:12,rings:8});m.tube(elbow,hand,.035,.025,5,14);m.ellipsoid(hand,[.044,.024,.038],5,{segments:12,rings:8})}
 const h=anchors.hat;for(let i=0;i<48;i++){const a=i*tau/48,b=(i+1)*tau/48,point=t=>add(h,[.25*Math.cos(t),.08*.25*Math.cos(t)-.09*.235*Math.sin(t),.235*Math.sin(t)]);m.triangle(h,point(a),point(b),8,[0,1,0]);}m.ellipsoid(add(h,[.015,.052,-.003]),[.16,.087,.151],8,{segments:24,rings:14});
 for(let i=0;i<flowers.length;i++){const f=flowers[i],h=.07+.035*random(i+450);m.tube(f,add(f,[0,h,0]),.006,.004,9,5);const c=add(f,[0,h,0]);for(let j=0;j<4;j++)m.ellipsoid(add(c,[.022*Math.cos(j*tau/4),.003,.022*Math.sin(j*tau/4)]),[.016,.008,.016],10,{segments:6,rings:4});m.ellipsoid(add(c,[0,.012,0]),[.009,.007,.009],8,{segments:6,rings:4})}
 return finishWorld(m);
}
const fixed=staticGeometry();
const jawLocal=(()=>{const m=new MeshBuilder();m.ellipsoid([-1.47,.88,.015],[.19,.064,.184],2,{segments:20,rings:12});return m.vertices})();
export function geometry(s){const m=torso(s);
 // Jaw rotates/grinds beneath a stationary skull. Cheek volume and mouth grass share its state.
 const ca=Math.cos(s.jaw.angle),sa=Math.sin(s.jaw.angle);for(let i=0;i<jawLocal.length;i+=7){const p=jawPoint(s.jaw,jawLocal.slice(i,i+3)),[x,y,z]=jawLocal.slice(i+3,i+6),normal=turnHead([ca*x-sa*y,sa*x+ca*y,z]);m.vertices.push(...p,...normal,jawLocal[i+6])}m.ellipsoid(H([-1.32+s.jaw.side*.6,.96-s.jaw.open*.3,.10]),[.105,.11+.005*Math.sin(s.chewPhase),.13],1,{segments:16,rings:10});
 for(let i=0;i<tufts.length;i++){const g=tufts[i],tip=s.tuftTips[i];for(let j=0;j<3;j++){const base=add(g.base,[(j-1)*.018,0,j%2*.014]),end=add(tip,[(j-1)*.02,-j*.016,(j-1)*.012]);m.triangle(add(base,[-g.width*.5,0,0]),end,add(base,[g.width*.5,0,0]),9,[[.3,.8,.4],[-.4,.7,.4],[.2,1,.5]][j])}}

 const moving=finishWorld(m),out=new Float32Array(fixed.length+moving.length);out.set(fixed);out.set(moving,fixed.length);return out;
}
export function details(ctx,s,zoom=1,options={}){if(options.hideDetails)return;const pen=new PixelPen(ctx),P=p=>project(world(p),config.camera,config.grid,zoom),c=i=>config.palette[i];
 // Tiny features describe planes; they do not cover the body with a second opaque patch.
 for(const z of [-.175,.185]){const e=P(H([-1.44,1.16,z]));pen.ellipse(e,1.65,1.15,c(6));pen.pixel(e[0]-1,e[1]-1,c(10));pen.pixel(e[0]-1,e[1],c(21));pen.pixel(e[0],e[1],c(6))}
 pen.line(P(H([-1.665,.986,-.10])),P(H([-1.665,.986,.11])),c(8),1);
 for(const z of [.15,-.12]){const p=P(H([-1.657,.964,z]));pen.ellipse(p,1.10,.75,c(6))}
 const mouth=P(s.jaw.mouth),corner=P(jawPoint(s.jaw,[-1.46,.89,.203]));pen.line(mouth,corner,c(6),1);pen.line([mouth[0]+1,mouth[1]+1],[mouth[0]+3,mouth[1]+1],c(9),1);
 for(let i=0;i<3;i++){const a=s.jaw.rawMouth,b=add(a,[-.10-i*.025,-.035,.01+i*.025]),tip=add(a,[-.23-i*.035,-.17+.012*Math.sin(s.chewPhase+i),.04+i*.025]);pen.polyline([P(jawPoint(s.jaw,a)),P(jawPoint(s.jaw,b)),P(jawPoint(s.jaw,tip))],c(i%2?1:2),1)}
 // Hoof splits and ear interiors remain intentional connected marks.
 for(const a of [anchors.hoofFrontNear,anchors.hoofRearNear])pen.line(P(add(a,[-.07,.045,.055])),P(add(a,[-.06,-.035,.075])),c(6),1);
 pen.line(P(H([-1.18,1.08,.41])),P(H([-1.06,1.067,.43])),c(12),1);
 // Shared deformed torso surface carries navel and shirt hem; no translating belly patch.
 const q=P(torsoPoint(s,.02,.60));pen.pixel(q[0],q[1],c(16));
 const hem=Array.from({length:10},(_,i)=>P(torsoPoint(s,.10,.2+i*.16)));pen.polyline(hem,c(19),1);
 pen.line(P(add(anchors.kneeNear,[-.025,.02,.045])),P(add(anchors.kneeNear,[.02,.01,.045])),c(18),1);
 const h=anchors.hat;for(let i=0;i<8;i++){const a=i*tau/8,p0=add(h,[.08*Math.cos(a),.105,.08*Math.sin(a)]),p1=add(h,[.205*Math.cos(a),.018,.198*Math.sin(a)]);pen.line(P(p0),P(p1),c(13),1)}
 pen.finish();}
export default {config,state,geometry,details};

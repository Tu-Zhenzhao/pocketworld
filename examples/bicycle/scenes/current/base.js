import {PixelPen} from '../../engine/pixels.js';
const C={moss:[191,197,169],mossDark:[170,181,149],mossLight:[207,212,187],grout:[211,207,192],stone:[231,225,209],stoneLight:[238,233,218],stoneShade:[224,220,205],shadow:[190,187,169],tire:[52,61,55],tireSide:[113,119,105],rim:[125,139,119],frame:[92,114,86],frameLight:[148,166,125],spoke:[140,146,126],metal:[178,180,152],cloth:[240,231,207],clothShade:[211,205,177],pants:[94,111,119],pantsDark:[68,85,96],skin:[216,165,117],skinLight:[236,187,141],cap:[146,121,85],capLight:[182,157,112],shoe:[104,86,62],bucket:[119,135,94],bucketDark:[84,107,76],cat:[244,231,202],catShade:[210,193,160],ochre:[168,119,68]};
export const colors=C;
export const config={id:'bicycle-overlook',title:'午后修单车 · 掌上小院',grid:192,loop:12,fps:60,palette:Object.values(C)};
const TAU=Math.PI*2,rear=[77,99],front=[124,103],crank=[102,90],seat=[94,118],head=[118,115];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
function ik(a,b,u,v){const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy),q=(u*u-v*v+d*d)/(2*d),h=Math.sqrt(Math.max(0,u*u-q*q));return[a[0]+q*dx/d+h*dy/d,a[1]+q*dy/d-h*dx/d]}
export function state(t){t=((t%12)+12)%12;const phase=t<2?0:t<6?smooth((t-2)/4):1,turn=TAU*phase;const dt=Math.min(71/15,Math.max(0,t-4.4)),rearAngle=t<=4.4?2*turn:Math.max(2*turn,TAU*(1.296+.72*(dt-dt*dt/(2*(71/15)))));const grip=t<6?1:t<6.8?1-smooth((t-6)/.8):t<10.6?0:smooth((t-10.6)/1);const pedal=[102+4.5*Math.cos(turn),90+4.5*Math.sin(turn)],hand=[pedal[0]*grip+109*(1-grip),pedal[1]*grip+94*(1-grip)];const yaw=t<1?1:t<2?1-smooth(t-1):t<3.2?0:t<4.5?-smooth((t-3.2)/1.3):t<9.5?-1:t<10.7?-1+2*smooth((t-9.5)/1.2):1;const lean=.65*Math.sin(Math.PI*phase)**2,breath=.3*(1-Math.cos(TAU*t/6));const shoulder=[109+.25*yaw,80+lean],elbow=ik(shoulder,hand,10,11);return{time:t,turn,rearAngle,frontAngle:0,grip,pedal,hand,shoulder,elbow,yaw,lean,breath,rear,front,crank,seat,head,feet:[[96,110],[107,112]],catBreath:.6*(1-Math.cos(TAU*t/4)),ear:t>7.2&&t<7.8?Math.sin(Math.PI*(t-7.2)/.6):0,tail:t>9.6&&t<11.8?Math.sin(Math.PI*(t-9.6)/2.2):0,gust:t>5.7&&t<8.7?Math.sin(Math.PI*(t-5.7)/3)**2:0};}
// Sparse rubber sidewall/tread sectors are object-space material, not time-based flashes.
export function tireMarkAt(x,y,angle){const d=(x/13)**2+(y/16)**2;if(d<.69||d>.995)return false;const a=Math.atan2(y/16,x/13)-angle;return [[.15,.26],[1.35,.19],[2.6,.14],[4.05,.28],[5.3,.16]].some(([center,width])=>Math.abs(Math.atan2(Math.sin(a-center),Math.cos(a-center)))<width)}
export function createRenderer(canvas){canvas.width=canvas.height=192;const ctx=canvas.getContext('2d');let dead=false;return{canvas,ctx,draw(t,options={}){if(dead)throw Error('destroyed');ctx.clearRect(0,0,192,192);if(options.opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,192,192)}const s=state(t),p=new PixelPen(ctx),stage=options.stage||'final';const c=k=>stage==='silhouette'&&!['moss','mossDark','mossLight','grout','stone','stoneLight','stoneShade','shadow'].includes(k)?C.tire:C[k];const poly=(a,k)=>p.polygon(a,c(k)),ell=(a,x,y,k)=>p.ellipse(a,x,y,c(k)),line=(a,b,k,w=1)=>p.line(a,b,c(k),w),limb=(a,b,k,w)=>{line(a,b,k,w);ell(a,w/2,w/2,k);ell(b,w/2,w/2,k)};
const gy=y=>116+.74*(y-116),gpoly=(a,k)=>poly(a.map(([x,y])=>[x,gy(y)]),k);
// Broad quiet footprint and a handful of large stone planes; no tiled noise.
gpoly([[17,113],[23,98],[42,85],[65,77],[99,74],[134,80],[159,93],[174,108],[179,122],[165,140],[140,153],[107,161],[69,158],[38,145],[20,130]],'mossDark');
gpoly([[16,111],[26,96],[44,84],[67,77],[100,75],[134,81],[159,94],[174,109],[177,121],[163,139],[138,151],[106,158],[69,155],[39,143],[20,128]],'moss');
gpoly([[25,109],[40,91],[69,81],[101,79],[132,85],[158,99],[170,114],[167,128],[147,143],[118,152],[81,152],[50,143],[29,129]],'grout');
const tiles=[[[29,105],[44,91],[66,84],[75,96],[56,109]],[[69,83],[99,80],[113,88],[96,99],[77,96]],[[115,88],[132,87],[153,98],[145,110],[122,106]],[[26,109],[54,113],[58,129],[36,135],[26,125]],[[58,112],[78,100],[96,102],[99,120],[79,130],[61,127]],[[101,101],[122,109],[143,113],[139,130],[116,134],[102,122]],[[148,112],[168,116],[164,127],[147,140],[142,131]],[[40,138],[62,132],[80,135],[85,149],[66,150]],[[82,134],[102,127],[116,137],[113,152],[88,150]],[[119,138],[138,134],[145,144],[133,149],[116,153]]];
tiles.forEach((a,i)=>gpoly(a,i%3===0?'stoneLight':i%3===1?'stone':'stoneShade'));
for(const a of [[[54,110],[60,108],[63,111],[58,115]],[[96,97],[101,96],[104,101],[98,104]],[[138,132],[144,130],[145,134],[140,137]],[[80,133],[85,132],[87,135],[82,137]],[[113,151],[118,149],[120,155],[115,157]]])gpoly(a,'moss');
// Stable contact shadows.
ell([102,111],16,3,'shadow');ell([106,119],28,3,'shadow');ell([96,121],8,1.5,'shadow');ell([128,125],6,1.5,'shadow');ell([52,130],7,2,'shadow');ell([146,134],11,2,'shadow');
// Standing repairer, behind the bicycle; foreshortened legs under a leaning torso.
poly([[94,87],[102,87],[101,100],[99,109],[94,110],[93,101]],'pantsDark');poly([[101,87],[110,88],[110,101],[109,111],[104,111],[103,101]],'pants');
poly([[94,107],[99,107],[101,111],[100,113],[93,113]],'shoe');poly([[104,109],[109,109],[113,113],[112,115],[103,114]],'shoe');
const L=s.lean,B=s.breath;poly([[90,73+L],[104,72+L],[114,78+L],[111,88],[104,93],[94,91],[87,82]],'clothShade');poly([[91,74+L],[101,73+L],[110+B,77+L],[109,85],[101,89],[90,86],[88,80]],'cloth');
// Head is seen from above; brim/face plane describe a small natural attention turn.
const hx=99+.35*s.yaw,hy=68+L;
poly([[96,72+L],[101,72+L],[103,77+L],[98,78+L]],'skin');ell([hx,hy+2],4.4,4.3,'skinLight');poly([[hx-4,hy],[hx+4,hy],[hx+3,hy+5],[hx-1,hy+6],[hx-4,hy+3]],'skin');ell([hx,hy-1],5.2,3.5,'cap');ell([hx-1,hy-2],4.1,2.1,'capLight');ell([hx+3*s.yaw,hy+2.3],3.8,1.7,'cap');if(stage==='final'){p.pixel(hx+4*s.yaw,hy+4,c('skinLight'));}
// Rear arm, drawn behind bicycle, with forearm added at its contact later.
limb([92,78+L],[90,91],'clothShade',4);
// Saddle and handlebar provide two fixed ground contacts.
poly([[89,118],[96,116],[102,119],[101,122],[90,122]],'shoe');line([90,118],[97,117],'metal');line(seat,[96,108],'frame',2);line(head,[121,122],'frame',2);line([121,122],[129,123],'tire',2);poly([[124,122],[131,122],[131,125],[124,125]],'tire');
function wheel(o,a){for(let y=-17;y<=17;y++)for(let x=-14;x<=14;x++){const d=(x/13)**2+(y/16)**2;if(d<=1&&d>=.69){p.pixel(o[0]+x,o[1]+y,c('tire'));if(stage!=='silhouette'&&tireMarkAt(x,y,a))p.pixel(o[0]+x,o[1]+y,c('tireSide'));}else if(d<.69&&d>.60&&stage!=='silhouette')p.pixel(o[0]+x,o[1]+y,c('rim'));}if(stage!=='silhouette')for(let i=0;i<6;i++){const q=a+i*TAU/6;line(o,[o[0]+11*Math.cos(q),o[1]+13.6*Math.sin(q)],'spoke');}ell(o,2,2,'frame');p.pixel(o[0],o[1],c('metal'));}
wheel(rear,s.rearAngle);wheel(front,0);
// Main frame diamond, short central chainring/crank and two chain runs.
for(const [a,b] of [[rear,seat],[rear,crank],[seat,crank],[seat,head],[crank,head],[head,front]]){line(a,b,'tire',3);line([a[0],a[1]-1],[b[0],b[1]-1],'frameLight',1);}
line([120,115],[126,103],'frame',2);line([78,96],[102,86],'tire');line([78,102],[103,94],'tire');ell(rear,2.5,2.5,'frame');ell(crank,4,4,'tire');ell(crank,2.5,2.5,'metal');ell(crank,1,1,'tire');
if(stage==='final'){const q=(s.turn/TAU*4)%1;line([80+q*20,96-q*8],[82+q*20,95-q*8],'metal');}
line(crank,s.pedal,'metal',2);line([s.pedal[0]-2,s.pedal[1]],[s.pedal[0]+2,s.pedal[1]],'tire',2);
// Far hand steadies central seat tube. Near hand is in front of frame and grips pedal.
limb([90,91],[97,96],'skin',3);ell([98,96],1.7,1.5,'skinLight');limb(s.shoulder,s.elbow,'cloth',4);limb(s.elbow,s.hand,'skin',3);ell(s.hand,1.8,1.5,'skinLight');
// Foreground tools, kept quiet.
poly([[47,121],[57,121],[56,131],[48,131]],'bucketDark');poly([[48,123],[55,123],[54,129],[49,129]],'bucket');ell([52,121],5,2,'bucket');ell([52,121],3,1,'bucketDark');line([50,121],[48,115],'metal',2);line([47,115],[50,115],'rim');line([47,115],[46,113],'metal');line([50,115],[50,112],'metal');line([54,121],[56,116],'shoe',2);
p.finish();return s;},capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('integer scale');const o=document.createElement('canvas');o.width=o.height=192*scale;const d=o.getContext('2d');d.imageSmoothingEnabled=false;d.drawImage(canvas,0,0,o.width,o.height);return o.toDataURL('image/png').split(',')[1]},destroy(){if(dead)return;dead=true;ctx.clearRect(0,0,192,192)}}}
export default{config,state,createRenderer};

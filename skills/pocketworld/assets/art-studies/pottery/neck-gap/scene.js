// New 144-cell design, authored directly as integer row spans and polygons.
// No input bitmap, sampling, resize, filter, or fine-scene imports.
export const config={id:'pottery-neck-gap-counterexample',title:'Neck gap counterexample',grid:144,loop:12,fps:60,camera:{azimuth:45,elevation:30,span:5,target:[0,.5,0]}};
const ease=x=>x*x*(3-2*x);const clamp=x=>Math.max(0,Math.min(1,x));
export function state(time){
 const t=((time%12)+12)%12,q=t%4,d=t%6;
 const shape=q<1.8?ease(q/1.8):q<2.4?1:q<3.7?1-ease((q-2.4)/1.3):0;
 const dip=d<.7?0:d<2.3?ease((d-.7)/1.6):d<2.7?1:d<3.5?1-ease((d-2.7)/.8):0;
 const breath=Math.sin(t*Math.PI/3),swallow=d>3.5&&d<4.1?Math.sin((d-3.5)/.6*Math.PI):0;
 return {time:t,shape,dip,breath,swallow,lean:.65*shape,handY:74-2*shape,contact:d>=2.3&&d<2.7,ripple:d>=2.3&&d<3.8?(d-2.3):null,wheel:t*Math.PI,gust:t>7&&t<10?Math.sin((t-7)/3*Math.PI):0};
}
const C={grass:'#b8c39c',edge:'#a3b18b',light:'#ced5b7',shade:'#929e7b',hair:'#47553e',skin:'#e5b18a',skinShade:'#bb805c',shirt:'#f2edde',clothShade:'#c8c5ae',apron:'#657572',apronLight:'#82918a',wood:'#a77c4e',woodShade:'#705237',clay:'#b18458',clayLight:'#d0a575',clayShade:'#785638',wheel:'#b8b7a7',wheelShade:'#777e74',stone:'#969b8e',water:'#7398a2',waterLight:'#93b0b4',bank:'#a59c83',duck:'#faf6e7',duckShade:'#d5d4bd',bill:'#d6a14a'};
config.palette=[...new Set([...Object.values(C),'#737f62'])];
function drawing(ctx){
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
 // Pixel-centre scan conversion writes only whole cells; no Canvas antialiasing.
 const poly=(p,c)=>{for(let y=Math.floor(Math.min(...p.map(p=>p[1])));y<Math.max(...p.map(p=>p[1]));y++){const cuts=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))cuts.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));}cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length;i+=2){let a=Math.ceil(cuts[i]-.5),b=Math.ceil(cuts[i+1]-.5);if(b>a)rect(a,y,b-a,1,c)}}};
 const rows=(y,spans,c)=>spans.forEach(([x,w],i)=>rect(x,y+i,w,1,c));return{rect,poly,rows};
}
export function drawNative(ctx,s,o={}){
 ctx.clearRect(0,0,144,144);ctx.imageSmoothingEnabled=false;const {rect:r,poly:p,rows}=drawing(ctx);if(o.opaque)r(0,0,144,144,'#fff');
 // Same irregular footprint and margins, fewer longer contour runs.
 p([[22,87],[30,82],[43,80],[57,79],[72,81],[91,83],[109,88],[118,94],[123,99],[122,105],[115,111],[103,115],[88,117],[70,116],[55,113],[40,110],[28,105],[21,99],[20,93]],C.grass);
 p([[20,96],[25,102],[39,108],[56,112],[73,115],[93,115],[111,111],[122,104],[120,109],[110,114],[91,118],[70,117],[54,114],[38,111],[26,106],[21,101]],C.edge);
 // Broad shared contact shadow, no mottled field.
 p([[40,94],[49,91],[62,93],[73,97],[68,101],[53,101],[42,98]],C.shade);
 // Pond, quiet plane and one broad light-facing bank, hand-authored octagonal arcs.
 p([[88,97],[98,94],[110,96],[120,100],[123,105],[119,110],[109,113],[96,113],[86,110],[81,106],[82,102]],C.bank);
 p([[89,99],[99,96],[110,98],[119,101],[122,105],[118,109],[109,112],[96,112],[86,109],[82,106],[84,102]],C.water);
 p([[85,102],[91,99],[100,97],[110,99],[117,101],[120,104],[109,101],[100,100],[91,101]],C.waterLight);
 // A few two-cell rooted accents; one tiny dither cluster at the grass edge.
 for(const [x,y]of [[31,92],[39,104],[75,109],[85,88],[111,112]]){r(x,y,2,1,C.edge);r(x+1+Math.round(s.gust*(x%3===0?1:-1)),y-1,1,1,C.edge)}r(28,102,1,1,C.light);r(30,103,1,1,C.light);
 // Stool: three readable legs, 1–2 cells thick, top supports pelvis.
 p([[39,83],[44,80],[54,83],[50,86]],C.wood);p([[39,83],[50,85],[50,87],[39,85]],C.woodShade);
 r(40,85,2,12,C.woodShade);r(48,86,2,13,C.woodShade);r(52,84,1,10,C.woodShade);
 // Fixed shoes and legs: two large value groups with a meaningful knee gap.
 p([[45,79],[54,79],[60,85],[58,95],[54,96],[53,86],[47,85]],'#737f62');
 p([[43,79],[49,79],[52,85],[51,96],[47,98],[45,95],[46,86],[42,83]],C.apron);
 r(45,96,7,3,C.woodShade);r(53,95,5,3,C.wood);
 const body= (v,c)=>p(v.map(([x,y])=>[x+(x<59?s.lean*Math.max(0,(83-y)/25):0)+(x<49&&y>66&&y<79?-.4*s.breath:0),y]),c);
 const br=(x,y,w,h,c)=>r(x+s.lean*Math.max(0,(83-y)/25),y,w,h,c);
 const brows=(y,sp,c)=>sp.forEach(([x,w],i)=>br(x,y+i,w,1,c));
 // Torso shirt: broad lit front, one side plane. No little crease strokes.
 body([[46,63],[50,61],[55,63],[58,70],[55,79],[52,83],[45,82],[42,78],[42,69]],C.shirt);
 body([[42,69],[45,71],[44,78],[47,81],[45,83],[41,80]],C.clothShade);
 // Apron opening has deliberate 1-cell straps, one dominant plane.
 body([[47,64],[48,64],[50,71],[54,71],[54,64],[55,65],[56,76],[53,84],[48,85],[45,81],[47,73]],C.apron);
 body([[48,75],[54,74],[53,81],[49,83]],C.apronLight);
 br(49,59,4,5,C.skinShade);
 // Head budget 12w x13h incl hair; face 9x10, no eyes or detail noise.
 brows(51,[[49,6],[47,9],[46,11],[46,12],[46,11],[47,10],[47,10],[48,9],[48,8],[49,7],[50,5],[50,4]],C.skin);
 brows(50,[[49,5],[47,9],[46,11],[46,12],[46,10],[46,7],[47,5],[47,3]],C.hair);
 br(48,58,1,3,C.skinShade);
 // Far arm bends toward right pot wall, stays behind pot rather than raised overhead.
 body([[54,65],[57,66],[58,69],[57,71],[55,70]],C.shirt);
 body([[56,69],[58,69],[60,67-s.shape],[63,67-s.shape],[64,69-s.shape],[60,70-s.shape],[58,72],[56,71]],C.skinShade);
 // Wheel pedestal and foot use block planes, designed 1-cell edges.
 p([[58,93],[66,92],[72,95],[72,98],[67,100],[60,100],[56,97]],C.wheelShade);
 p([[57,94],[63,92],[71,95],[69,98],[60,98]],C.wheel);
 p([[62,85],[67,85],[68,94],[65,97],[61,95]],C.stone);r(62,86,2,9,C.wheel);
 p([[53,81],[58,77],[69,77],[76,81],[75,85],[70,88],[58,88],[53,85]],C.wheelShade);
 p([[53,81],[59,78],[69,78],[76,81],[73,85],[58,85]],C.wheel);
 p([[57,81],[61,79],[68,79],[72,81],[70,84],[60,84]],C.stone);
 p([[59,81],[62,80],[68,80],[70,81],[69,83],[61,83]],C.wheel);
 r(73,81,2,1,C.wheelShade);
 // Rotation cue on exposed disk follows uniform angular velocity, not pulsing brightness.
 r(64+Math.cos(s.wheel)*9,82+Math.sin(s.wheel)*2,2,1,C.wheelShade);
 // Sculpted wall profiles: lower attachment never moves; upper shoulder contracts one cell.
 const potTop=68-Math.round(s.shape), profile=[7,7,7,9,11,12,12,12,12,11,11,9,7,7];
 for(let y=potTop;y<82;y++){
  const rel=Math.max(0,y-68),w=profile[Math.min(13,rel)]-(rel>=2&&rel<=6?Math.round(s.shape):0),left=Math.floor(64.5-w/2);
  r(left,y,w,1,C.clay);
  if(y>=70){const lw=y<76?3:y<79?2:1;r(left,y,lw,1,C.clayLight);const sw=y<74?2:y<77?3:4;r(left+w-sw,y,sw,1,C.clayShade);}
 }
 r(61,potTop,7,1,C.clayLight);r(62,potTop+1,5,1,C.clayShade);r(61,potTop+2,7,1,C.clayLight);
 // Far fingers lie on back-left rim, visibly joined to the upper forearm.
 r(61,potTop-1,3,1,C.skinShade);
 // Near shoulder/elbow/wrist form one polygon and meet current left wall.
 body([[45,70],[47,70],[48,73],[47,75],[44,74],[43,72]],C.shirt);
 const handY=s.handY;
 p([[46+s.lean,73],[49+s.lean,74],[55,handY],[59,handY-1],[60,handY+1],[56,handY+2],[48,76],[46+s.lean,75]],C.skin);
 r(58,handY-1,3,2,C.skin);
 // One small expanding stepped ring, behind the bird; no ripples without a contact event.
 if(s.ripple!==null&&s.ripple<1.2){const rx=1+Math.floor(s.ripple*3),ry=1+Math.floor(s.ripple);r(105-rx,99,1,1,C.duckShade);r(105+rx,99,1,1,C.duckShade);r(104,99-ry,3,1,C.duckShade);r(104,99+ry,3,1,C.duckShade);}
 // Duck on shore: short shoulder-to-head neck, one wing plane, two fixed 1-cell legs.
 p([[94,94],[100,93],[105,94],[104,96],[95,96]],C.shade);
 r(97,91,1,3,C.bill);r(100,91,1,3,C.bill);r(97,94,2,1,C.bill);r(100,94,2,1,C.bill);
 p([[89,85],[93,87],[95,85],[100,85+s.dip],[103,87+2*s.dip],[102,91+s.dip],[99,93],[94,92],[91,89]],C.duck);
 p([[93,87],[97,88],[100,87],[100,90],[97,91],[94,90]],C.duckShade);
 // Articulated neck: shoulder remains attached to body, head lowers; feet never move.
 const hx=105-2*s.dip,hy=85+9*s.dip-.6*s.swallow;
 p([[100,87],[103,86+s.dip],[104,88+3*s.dip],[hx+1,hy],[hx+2,hy+2],[hx,hy+3],[104,91+3*s.dip],[102,90+s.dip],[101,91]],C.duck);
 p([[hx-1,hy],[hx+2,hy],[hx+3,hy+2],[hx+2,hy+4],[hx-1,hy+3]],C.duck);
 r(hx+1,hy+1,1,1,C.hair);
 // bill tip reaches (105,98) only at full dip; then water response begins.
 if(s.dip>.65){r(hx+2,hy+3,2,2,C.bill);r(hx+2,hy+4,1,1,C.bill)}else{r(hx+3,hy+2,2,1,C.bill);r(hx+4,hy+3,1,1,C.bill)}

 return s;
}
export function createRenderer(canvas){canvas.width=canvas.height=144;const ctx=canvas.getContext('2d');return{canvas,ctx,draw(t,o={}){return drawNative(ctx,state(t),o)},capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('Integer scale required');const c=document.createElement('canvas');c.width=c.height=144*scale;const p=c.getContext('2d');p.imageSmoothingEnabled=false;p.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},destroy(){ctx.clearRect(0,0,144,144)}}}
export default{config,state,createRenderer};

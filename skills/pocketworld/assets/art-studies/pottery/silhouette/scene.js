// New 144-cell design, authored directly as integer row spans and polygons.
// No input bitmap, sampling, resize, filter, or fine-scene imports.
export const config={id:'pottery-coarse-demonstration',title:'池畔陶艺 · 大格造型研究',grid:144,loop:12,fps:60,camera:{azimuth:45,elevation:30,span:5,target:[0,.5,0]}};
export function state(time){return {time,study:'static-only'}};
const C={grass:'#b8c39c',edge:'#a3b18b',light:'#ced5b7',shade:'#929e7b',hair:'#47553e',skin:'#e5b18a',skinShade:'#bb805c',shirt:'#f2edde',clothShade:'#c8c5ae',apron:'#657572',apronLight:'#82918a',wood:'#a77c4e',woodShade:'#705237',clay:'#b18458',clayLight:'#d0a575',clayShade:'#785638',wheel:'#b8b7a7',wheelShade:'#777e74',stone:'#969b8e',water:'#7398a2',waterLight:'#93b0b4',bank:'#a59c83',duck:'#faf6e7',duckShade:'#d5d4bd',bill:'#d6a14a'};
for(const k of Object.keys(C)) C[k]=['grass','edge','light'].includes(k)?'#c4ccae':['water','waterLight','bank'].includes(k)?'#839b9f':['duck','duckShade','bill'].includes(k)?'#667567':'#596354';
config.palette=[...new Set([...Object.values(C),'#737f62'])];
config.palette=[...new Set([...Object.values(C),'#737f62'])];
function drawing(ctx){
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h)};
 // Pixel-centre scan conversion writes only whole cells; no Canvas antialiasing.
 const poly=(p,c)=>{for(let y=Math.min(...p.map(p=>p[1]));y<Math.max(...p.map(p=>p[1]));y++){const cuts=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))cuts.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));}cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length;i+=2){let a=Math.ceil(cuts[i]-.5),b=Math.ceil(cuts[i+1]-.5);if(b>a)rect(a,y,b-a,1,c)}}};
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
 for(const [x,y]of [[31,92],[39,104],[75,109],[85,88],[111,112]]){r(x,y,2,1,C.edge);r(x+1,y-1,1,1,C.edge)}r(28,102,1,1,C.light);r(30,103,1,1,C.light);
 // Stool: three readable legs, 1–2 cells thick, top supports pelvis.
 p([[39,83],[44,80],[54,83],[50,86]],C.wood);p([[39,83],[50,85],[50,87],[39,85]],C.woodShade);
 r(40,85,2,12,C.woodShade);r(48,86,2,13,C.woodShade);r(52,84,1,10,C.woodShade);
 // Fixed shoes and legs: two large value groups with a meaningful knee gap.
 p([[45,79],[54,79],[60,85],[58,95],[54,96],[53,86],[47,85]],'#737f62');
 p([[43,79],[49,79],[52,85],[51,96],[47,98],[45,95],[46,86],[42,83]],C.apron);
 r(45,96,7,3,C.woodShade);r(53,95,5,3,C.wood);
 // Torso shirt: broad lit front, one side plane. No little crease strokes.
 p([[46,63],[50,61],[55,63],[58,70],[55,79],[52,83],[45,82],[42,78],[42,69]],C.shirt);
 p([[42,69],[45,71],[44,78],[47,81],[45,83],[41,80]],C.clothShade);
 // Apron opening has deliberate 1-cell straps, one dominant plane.
 p([[47,64],[48,64],[50,71],[54,71],[54,64],[55,65],[56,76],[53,84],[48,85],[45,81],[47,73]],C.apron);
 p([[48,75],[54,74],[53,81],[49,83]],C.apronLight);
 r(49,59,4,5,C.skinShade);
 // Head budget 12w x13h incl hair; face 9x10, no eyes or detail noise.
 rows(51,[[49,6],[47,9],[46,11],[46,12],[46,11],[47,10],[47,10],[48,9],[48,8],[49,7],[50,5],[50,4]],C.skin);
 rows(50,[[49,5],[47,9],[46,11],[46,12],[46,10],[46,7],[47,5],[47,3]],C.hair);
 r(48,58,1,3,C.skinShade);
 // Far arm bends toward right pot wall, stays behind pot rather than raised overhead.
 p([[54,65],[57,66],[58,69],[57,71],[55,70]],C.shirt);
 p([[56,69],[58,69],[60,67],[63,67],[64,69],[60,70],[58,72],[56,71]],C.skinShade);
 // Wheel pedestal and foot use block planes, designed 1-cell edges.
 p([[58,93],[66,92],[72,95],[72,98],[67,100],[60,100],[56,97]],C.wheelShade);
 p([[57,94],[63,92],[71,95],[69,98],[60,98]],C.wheel);
 p([[62,85],[67,85],[68,94],[65,97],[61,95]],C.stone);r(62,86,2,9,C.wheel);
 p([[53,81],[58,77],[69,77],[76,81],[75,85],[70,88],[58,88],[53,85]],C.wheelShade);
 p([[53,81],[59,78],[69,78],[76,81],[73,85],[58,85]],C.wheel);
 p([[57,81],[61,79],[68,79],[72,81],[70,84],[60,84]],C.stone);
 p([[59,81],[62,80],[68,80],[70,81],[69,83],[61,83]],C.wheel);
 r(73,81,2,1,C.wheelShade);
 // Pot 12w x15h: long contour runs, 3 structural planes and 1-cell open rim.
 rows(68,[[61,7],[61,7],[60,9],[60,9],[59,11],[59,11],[59,11],[59,11],[59,11],[60,9],[60,9],[60,9],[61,7],[61,7]],C.clay);
 rows(70,[[60,3],[60,3],[59,4],[59,4],[59,4],[59,4],[59,3],[60,3],[60,2],[60,2],[61,1]],C.clayLight);
 rows(70,[[68,1],[68,1],[68,2],[68,2],[68,2],[67,3],[67,3],[66,3],[66,3],[65,4],[64,4]],C.clayShade);
 r(61,68,7,1,C.clayLight);r(62,69,5,1,C.clayShade);r(61,70,7,1,C.clayLight);r(61,67,3,1,C.skinShade);
 // Near forearm 2-cell thickness, hand exactly joins left pot wall (3x2 cells).
 p([[45,70],[47,70],[48,74],[48,76],[45,76],[43,73]],C.shirt);
 r(47,74,11,2,C.skin);r(57,73,3,2,C.skin);
 // Duck on shore: short shoulder-to-head neck, one wing plane, two fixed 1-cell legs.
 p([[94,94],[100,93],[105,94],[104,96],[95,96]],C.shade);
 r(97,91,1,3,C.bill);r(100,91,1,3,C.bill);r(97,94,2,1,C.bill);r(100,94,2,1,C.bill);
 p([[89,85],[93,87],[95,85],[100,85],[103,87],[102,91],[99,93],[94,92],[91,89]],C.duck);
 p([[93,87],[97,88],[100,87],[100,90],[97,91],[94,90]],C.duckShade);
 // Neck is authored broad connected blocks, not a scaled thin curve.
 p([[100,87],[102,84],[105,84],[107,85],[108,87],[105,88],[103,87],[102,90]],C.duck);
 r(106,85,1,1,C.hair);r(108,87,2,1,C.bill);r(109,88,1,1,C.bill);
 return s;
}
export function createRenderer(canvas){canvas.width=canvas.height=144;const ctx=canvas.getContext('2d');return{canvas,ctx,draw(t,o={}){return drawNative(ctx,state(t),o)},capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('Integer scale required');const c=document.createElement('canvas');c.width=c.height=144*scale;const p=c.getContext('2d');p.imageSmoothingEnabled=false;p.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},destroy(){ctx.clearRect(0,0,144,144)}}}
export default{config,state,createRenderer};

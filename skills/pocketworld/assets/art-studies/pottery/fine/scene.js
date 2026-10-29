// Original native-cell drawing: no reference pixels, external textures or examples loaded.
// Native Canvas2D adapter; rendered with Pocketworld 0.5.1 CPU, no image sampling.
export const config={id:'pond-pottery',title:'池畔陶艺',grid:288,loop:12,fps:60,camera:{azimuth:45,elevation:30,span:5,target:[0,.5,0]},palette:['#ffffff','#b8c39c','#a3b18b','#ced5b7','#737f62','#eeeadd','#d4cfbd','#a89f89','#4b5743','#dba57b','#edbd94','#bb805c','#b08055','#d0a575','#79583c','#96968c','#b7b6a6','#757970','#7298a3','#8cabb3','#557e87','#f7f4e7','#dedbca','#dfac53','#657472','#82908a']};
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,t)=>a+(b-a)*t;
function ik(a,b,l1,l2,bend=1){const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy),u=Math.atan2(dy,dx),c=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),q=u+bend*Math.acos(c);return[a[0]+l1*Math.cos(q),a[1]+l1*Math.sin(q)]}
// A shared shaping gesture drives the support pose. Time curves have deliberate rests.
function envelope(t,keys){for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const a=keys[i-1],b=keys[i];return mix(a[1],b[1],smooth((t-a[0])/(b[0]-a[0])))}}return keys.at(-1)[1]}
export function state(time){
 const t=((time%12)+12)%12,phase=t%6,g=t%4;
 const lift=envelope(g,[[0,0],[.45,0],[2.35,1],[2.7,1],[3.75,0],[4,0]]);
 const effort=envelope(g,[[0,0],[.5,.4],[1.4,1],[2.4,.7],[3.6,0],[4,0]]);
 const breath=envelope(t%6,[[0,0],[2.4,1],[3,.95],[5.5,0],[6,0]]);
 const pose={lean:1.4*effort,breath:.65*breath,nod:.6*lift};
 const bodyPoint=([x,y])=>{const weight=clamp((168-y)/40),chest=Math.exp(-(((y-143)/13)**2));return[x+pose.lean*weight+(x-100)/12*pose.breath*chest,y-.28*pose.breath*chest]};
 const headPoint=p=>{const q=bodyPoint(p),a=pose.nod*.018,dx=q[0]-103,dy=q[1]-125;return[103+dx*Math.cos(a)-dy*Math.sin(a),125+dx*Math.sin(a)+dy*Math.cos(a)]};
 const shape=lift,pot={x:129,baseY:162,topY:137-1.4*shape,shape,handY:150-7*lift};
 const radius=y=>{const v=clamp((162-y)/(162-pot.topY));return 8+3.2*Math.sin(Math.PI*v)-2.2*Math.pow(v,4)-.7*effort*Math.exp(-Math.pow((y-pot.handY)/3.6,2))};
 pot.leftHand=[pot.x-radius(pot.handY)+.2,pot.handY];pot.rightHand=[pot.x+radius(pot.handY)-.2,pot.handY];
 const leftShoulder=bodyPoint([97,134]),rightShoulder=bodyPoint([107,130]);
 const hands={left:pot.leftHand,right:pot.rightHand,leftShoulder,rightShoulder,leftElbow:ik(leftShoulder,pot.leftHand,17,17,1),rightElbow:ik(rightShoulder,pot.rightHand,20,20,1)};
 const dip=envelope(phase,[[0,0],[1,0],[2.6,1],[3,1],[3.8,0],[6,0]]);
 const swallow=envelope(phase,[[0,0],[3.9,0],[4.08,1],[4.3,0],[6,0]]);
 const compensation=.55*dip;
 const duckPoint=([x,y])=>[x-compensation*clamp((187-y)/16),y+.25*dip*clamp((187-y)/16)];
 const root=duckPoint([200,174]),head=[mix(213,207,dip),mix(171,188,dip)-.6*swallow],beakAngle=mix(Math.atan2(2,6),Math.PI/2,dip),beakTip=[head[0]+7*Math.cos(beakAngle),head[1]+7*Math.sin(beakAngle)];
 const duck={feet:[[195,187],[201,188]],root,neckMid:ik(root,head,9,9,-1),head,beakTip,dip,swallow,contact:dip===1,blink:phase>4.8&&phase<4.92,ripples:[]};
 for(const born of [2.6,2.88]){const age=phase-born;if(age>=0&&age<1.35)duck.ripples.push({x:207,y:195,r:1+age*4.4,alpha:1-age/1.35,age})}
 const gust=offset=>envelope((t-offset+12)%12,[[0,0],[5.2,0],[6.8,1],[8,.65],[9.4,0],[12,0]]);
 return {time:t,pot,hands,duck,wheelAngle:TAU*t/2,radius,pose,bodyPoint,headPoint,duckPoint,gust};
}

function pen(ctx){
 const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(Math.round(p[0]),Math.round(p[1])):ctx.moveTo(Math.round(p[0]),Math.round(p[1])));ctx.closePath();ctx.fill()};
 // Native raster ellipses are authored row spans, no antialiased canvas ellipse.
 const oval=(x,y,rx,ry,color)=>{ctx.fillStyle=color;for(let j=Math.floor(y-ry);j<=Math.ceil(y+ry);j++){const q=(j+.5-y)/ry;if(Math.abs(q)>1)continue;const h=rx*Math.sqrt(1-q*q);ctx.fillRect(Math.round(x-h),j,Math.max(1,Math.round(2*h)),1)}};
 const line=(a,b,width,color)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.max(Math.abs(dx),Math.abs(dy));for(let i=0;i<=Math.ceil(n);i++){const f=i/Math.max(1,Math.ceil(n));oval(mix(a[0],b[0],f),mix(a[1],b[1],f),width/2,width/2,color)}};
 const arc=(x,y,rx,ry,color,start=0,end=TAU)=>{for(let a=start;a<=end;a+=.035){ctx.fillStyle=color;ctx.fillRect(Math.round(x+Math.cos(a)*rx),Math.round(y+Math.sin(a)*ry),1,1)}};
 return {poly,oval,line,arc};
}
export function drawNative(ctx,s,options={}){
 const {poly,oval,line,arc}=pen(ctx);ctx.clearRect(0,0,288,288);ctx.imageSmoothingEnabled=false;if(options.opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,288,288)}
 // Broad quiet asymmetric meadow footprint, no floating speckles or garden props.
 poly([[44,174],[59,165],[83,159],[113,157],[145,162],[162,165],[182,165],[201,171],[218,175],[235,185],[246,196],[245,207],[232,219],[209,227],[178,232],[146,231],[118,228],[91,221],[65,212],[49,201],[41,187]],'#b8c39c');
 poly([[43,187],[48,199],[65,209],[92,218],[119,224],[153,228],[184,228],[208,224],[230,216],[241,204],[245,206],[234,220],[209,230],[177,235],[143,233],[114,230],[86,222],[61,213],[45,201],[40,189]],'#a3b18b');
 // A handful of purposeful grass clusters, fixed roots, no noise fill.
 for(const [i,[x,y]]of [[62,184],[78,207],[106,215],[151,218],[170,178],[233,190],[220,222],[91,171]].entries()){const bend=[0,3,4].includes(i)?1.25*s.gust(i*.16):0;poly([[x-2,y],[x-1+bend,y-3],[x+1,y-1],[x+3+bend,y-3],[x+2,y+1]],'#a3b18b')}
 // Pond at lower right, lip grounded in grass. Broad untextured water plane.
 oval(204,207,42,18,'#a89f89');oval(204,208,40,16,'#7298a3');poly([[168,204],[178,196],[199,192],[218,195],[235,201],[240,206],[224,200],[200,198],[180,200]],'#8cabb3');
 // Contact shade under the bench, feet, wheel and stationary duck.
 oval(104,192,29,8,'#a3b18b');oval(129,195,20,6,'#a3b18b');oval(198,188,11,3,'#a3b18b');
 // Bench: top and four connected legs with dimetric depth.
 poly([[79,165],[89,161],[108,166],[99,172]],'#b08055');poly([[79,165],[99,170],[99,174],[79,169]],'#79583c');
 for(const [x,y,h]of [[80,168,25],[96,172,25],[87,164,22],[105,169,22]])poly([[x,y],[x+3,y],[x+3,y+h],[x,y+h-1]],'#79583c');
 // Seated legs stable, shin/foot geometry has clear knee and ground contact.
 poly([[94,158],[109,157],[119,169],[117,184],[113,192],[106,191],[107,174],[96,170]],'#737f62');
 poly([[87,157],[99,158],[104,170],[103,189],[98,194],[91,190],[93,174],[85,166]],'#657472');
 poly([[91,189],[100,190],[103,195],[101,198],[89,197],[88,193]],'#79583c');poly([[107,188],[115,189],[120,193],[118,196],[106,195]],'#b08055');
 const bodyPoly=(p,c)=>poly(p.map(s.bodyPoint),c),headPoly=(p,c)=>poly(p.map(s.headPoint),c);
 // Fixed cream shirt and sage apron, simple three-quarter torso with quiet folds.
 bodyPoly([[91,126],[99,123],[109,125],[114,137],[111,153],[105,165],[91,164],[84,157],[85,140]],'#eeeadd');
 bodyPoly([[85,140],[89,143],[88,154],[93,160],[91,164],[83,159]],'#d4cfbd');
 bodyPoly([[94,129],[97,129],[101,142],[107,142],[108,128],[111,130],[111,151],[106,167],[95,168],[90,160],[94,145]],'#657472');
 bodyPoly([[95,149],[108,148],[106,162],[99,165],[95,160]],'#82908a');
 // Neck and featureless face; hair silhouette carries identity, not tiny facial noise.
 bodyPoly([[99,119],[105,118],[107,126],[102,131],[96,126]],'#dba57b');
 headPoly([[96,105],[106,103],[114,108],[114,118],[109,125],[103,126],[96,121],[93,113]],'#edbd94');
 headPoly([[94,106],[98,101],[107,101],[113,105],[116,109],[110,110],[108,108],[104,113],[101,112],[100,118],[95,117],[92,111]],'#4b5743');
 // Far arm remains attached; wrist terminates exactly on pot's far wall.
 const h=s.hands;line(h.rightShoulder,h.rightElbow,6,'#eeeadd');line(h.rightElbow,h.right,4,'#dba57b');
 // Wheel base, stem and disk: pot base center fixed on disk center.
 oval(129,193,15,6,'#757970');poly([[114,189],[114,194],[121,198],[136,198],[144,193],[144,189]],'#96968c');oval(129,189,15,6,'#b7b6a6');
 poly([[124,170],[135,170],[136,189],[132,193],[122,190]],'#96968c');poly([[124,172],[129,173],[128,190],[123,189]],'#b7b6a6');
 oval(129,168,23,9,'#757970');poly([[106,163],[106,168],[114,174],[143,173],[152,166],[152,162]],'#96968c');oval(129,162,23,9,'#b7b6a6');arc(129,162,18,6,'#96968c');
 // Small radial wheel mark visibly rotates uniformly, never moves the centered pot.
 const a=s.wheelAngle;line([129+17*Math.cos(a),162+5.6*Math.sin(a)],[129+20*Math.cos(a),162+6.6*Math.sin(a)],1,'#757970');
 const p=s.pot;for(let y=Math.ceil(p.topY);y<=p.baseY;y++){const r=s.radius(y);poly([[p.x-r,y],[p.x+r,y],[p.x+r,y+1],[p.x-r,y+1]],'#b08055');poly([[p.x-r,y],[p.x-r+3,y],[p.x-r+3,y+1],[p.x-r,y+1]],'#d0a575');poly([[p.x+r-2,y],[p.x+r,y],[p.x+r,y+1],[p.x+r-2,y+1]],'#79583c')}
 oval(129,p.baseY,8,2,'#b08055');oval(129,p.topY,s.radius(p.topY)+.5,2.4,'#d0a575');oval(129,p.topY-.2,s.radius(p.topY)-1.6,1.3,'#79583c');
 // Far fingertips are visible against the rim/wall and never detached.
 oval(h.right[0],h.right[1],2,2.5,'#dba57b');
 line(h.leftShoulder,h.leftElbow,7,'#eeeadd');line(h.leftElbow,h.left,4.5,'#edbd94');oval(h.left[0],h.left[1],2.6,2.5,'#edbd94');
 // White duck: both feet planted outside water; fixed wing/body, bending neck.
 const d=s.duck,duckPoly=(p,c)=>poly(p.map(s.duckPoint),c);for(const foot of d.feet){line([foot[0],foot[1]-5],foot,1.6,'#dfac53');poly([[foot[0]-2,foot[1]],[foot[0]+3,foot[1]],[foot[0]+1,foot[1]+1]],'#dfac53')}
 duckPoly([[180,171],[185,175],[190,170],[198,170],[204,175],[204,181],[199,185],[190,183],[184,179]],'#f7f4e7');
 duckPoly([[184,174],[190,176],[197,175],[199,179],[195,182],[190,180]],'#dedbca');line(s.duckPoint([187,174]),s.duckPoint([193,178]),1,'#eeeadd');
 // Round the drawn neck joint while the underlying fixed-length rig keeps contacts.
 const na=d.root,nm=d.neckMid,nb=d.head,q0=[mix(na[0],nm[0],.12),mix(na[1],nm[1],.12)],q1=[mix(nm[0],nb[0],.88),mix(nm[1],nb[1],.88)];line(na,q0,5,'#f7f4e7');let prev=q0;for(let k=1;k<=12;k++){const u=k/12,v=1-u,next=[v*v*q0[0]+2*v*u*nm[0]+u*u*q1[0],v*v*q0[1]+2*v*u*nm[1]+u*u*q1[1]];line(prev,next,mix(5,4.3,u),'#f7f4e7');prev=next}line(q1,nb,4.3,'#f7f4e7');oval(d.head[0],d.head[1],4,3,'#f7f4e7');
 const bu=[(d.beakTip[0]-d.head[0])/7,(d.beakTip[1]-d.head[1])/7],bp=[-bu[1],bu[0]];poly([[d.head[0]+3*bu[0]+bp[0],d.head[1]+3*bu[1]+bp[1]],[d.head[0]+3*bu[0]-bp[0],d.head[1]+3*bu[1]-bp[1]],d.beakTip],'#dfac53');
 ctx.fillStyle='#4b5743';ctx.fillRect(Math.round(d.head[0]+1),Math.round(d.head[1]-1),d.blink?2:1,1);
 for(const r of d.ripples){ctx.globalAlpha=r.alpha*.75;arc(r.x,r.y,r.r,r.r*.36,'#f7f4e7',.15,2.8);arc(r.x,r.y,r.r,r.r*.36,'#f7f4e7',3.4,5.7);ctx.globalAlpha=1}
 return s;
}
export function createRenderer(canvas){canvas.width=canvas.height=288;const ctx=canvas.getContext('2d',{willReadFrequently:true});return{canvas,ctx,destroyed:false,draw(t,options={}){if(this.destroyed)throw Error('Renderer destroyed');return drawNative(ctx,state(t),options)},capture(scale=3){if(!Number.isInteger(scale)||scale<1)throw Error('Integer scale required');const c=document.createElement('canvas');c.width=c.height=288*scale;const p=c.getContext('2d');p.imageSmoothingEnabled=false;p.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},destroy(){if(this.destroyed)return;this.destroyed=true;ctx.clearRect(0,0,288,288)}}}
export default {config,state,createRenderer};

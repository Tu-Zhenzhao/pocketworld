import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {bundle} from '../../../scripts/deliver.mjs';import {cpuSession} from '../../../scripts/cpu.mjs';

// Scene-specific semantic mask: exclude orange feet/bill so an accidental foot
// bridge cannot make a severed white neck appear connected.
export function duckConnected(ctx,state){
 const n=ctx.canvas.width;if(n!==144)throw Error('These coordinates describe the pottery study, not every animal');
 const d=ctx.getImageData(0,0,n,n).data,colors=new Set(['250,246,231','213,212,189','71,85,62']);
 const ink=(x,y)=>x>=89&&x<113&&y>=83&&y<100&&d[(y*n+x)*4+3]===255&&colors.has(`${d[(y*n+x)*4]},${d[(y*n+x)*4+1]},${d[(y*n+x)*4+2]}`);
 const q=[[96,88]],seen=new Set(['96,88']);
 if(!ink(96,88))return false;
 for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i][0]+dx,y=q[i][1]+dy,key=x+','+y;if(!seen.has(key)&&ink(x,y)){seen.add(key);q.push([x,y])}}
 return seen.has([Math.round(106-2*state.dip),Math.round(86+9*state.dip-.6*state.swallow)].join(','));
}
export async function checkPottery(review){
 const session=await cpuSession(await bundle(path.join(review,'scenes/current/scene.js'))),r=session.mount();const failures=[];
 try{let start;for(let i=0;i<=720;i++){const s=r.draw(i/60);if(!duckConnected(r.ctx,s))failures.push({frame:i,time:i/60,issue:'Duck head disconnected from shoulder'});if(s.ripple!==null&&s.time%6<2.3)failures.push({frame:i,issue:'Ripple before contact'});const frame=r.capture(1);if(i===0)start=frame;if(i===720&&start!==frame)failures.push({frame:i,issue:'Loop endpoint mismatch'})}return{frames:721,status:failures.length?'failed':'passed',failures,limits:'Connectivity and timing do not establish anatomy or artistic approval; inspect adjacent frames too.'}}finally{session.close()}
}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url))){try{if(!process.argv[2])throw Error('Usage: checks.mjs <generated-pottery-review>');const r=await checkPottery(path.resolve(process.argv[2]));console.log(JSON.stringify(r,null,2));if(r.failures.length)process.exitCode=1}catch(e){console.error(e.message);process.exitCode=1}}

import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {deliver,bundle} from '../skills/pocketworld/scripts/deliver.mjs';import {cpuSession} from '../skills/pocketworld/scripts/cpu.mjs';
import {study,pixelStats,sampleTimes} from '../skills/pocketworld/scripts/study.mjs';
import {duckConnected,checkPottery} from '../skills/pocketworld/assets/art-studies/pottery/checks.mjs';
import {PixelPen} from '../skills/pocketworld/assets/native-starter/engine/pixels.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pw-art-')),checks=[];
for(const value of ['',[-1],[13],[NaN],[],Array(181).fill(0)])assert.throws(()=>sampleTimes(value,12),/Study times/);
assert.deepEqual(sampleTimes('0,2.3,12',12),[0,2.3,12]);checks.push('sampling rejects invalid/oversized times and preserves requested extremes');
const c=createCanvas(24,24),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#5b6f53';ctx.beginPath();ctx.moveTo(3,4);ctx.lineTo(21,10);ctx.lineTo(5,21);ctx.closePath();ctx.fill();assert(pixelStats(ctx.getImageData(0,0,24,24).data,24,24).partialAlphaCells>0);ctx.clearRect(0,0,24,24);const pen=new PixelPen(ctx);pen.polygon([[3,4],[21,10],[5,21]],[91,111,83]);pen.finish();assert.equal(pixelStats(ctx.getImageData(0,0,24,24).data,24,24).partialAlphaCells,0);checks.push('actual path-antialiasing counterexample and direct-cell hard-edge rendering');
const previous=process.env.CHROME;process.env.CHROME=path.join(temp,'no-browser');
try{
 const invalid=path.join(temp,'missing-palette');await fs.mkdir(invalid);await fs.writeFile(path.join(invalid,'scene.js'),"export default{config:{id:'missing-palette',grid:24,loop:2,fps:60},createRenderer(){throw Error('must not mount')}}");const rejected=path.join(temp,'rejected');await assert.rejects(deliver(invalid,rejected,['preview'],{backend:'cpu'}),/config.palette/);assert.equal(JSON.parse(await fs.readFile(path.join(rejected,'failure.json'),'utf8')).status,'failed');await assert.rejects(fs.access(path.join(rejected,'manifest.json')));checks.push('missing palette fails before custom mounting or a success manifest');
 const pottery=path.join(temp,'pottery');const r=await study('skills/pocketworld/assets/examples/pottery',pottery,{times:[0,2.3,2.3166666667,2.5,12],scale:4});
 assert.equal(r.aestheticApproval,'not-assessed');assert.equal(r.backend,'cpu');assert(r.samples.every(s=>s.stats.partialAlphaCells===0));
 const report=await checkPottery(pottery);assert.deepEqual(report.failures,[]);checks.push('pottery 721 actual frames: connected head/neck, contact-event timing and exact endpoint');
 const old=path.join(temp,'neck-gap');await deliver('skills/pocketworld/assets/art-studies/pottery/neck-gap',old,['preview'],{backend:'cpu'});
 const bad=await checkPottery(old);assert(bad.failures.some(f=>f.issue.includes('disconnected')));checks.push('same detector fails on the real pre-fix neck-gap scene');
 const session=await cpuSession(await bundle(path.join(pottery,'scenes/current/scene.js'))),renderer=session.mount();const state=renderer.draw(2.5);assert(duckConnected(renderer.ctx,state));renderer.ctx.clearRect(100,92,8,2);assert(!duckConnected(renderer.ctx,state));session.close();checks.push('deliberate missing-neck cells are detected even with nearby orange feet');
 const sample=r.samples[0],im=await loadImage(path.join(pottery,sample.native)),large=await loadImage(path.join(pottery,sample.large));const a=createCanvas(im.width,im.height),b=createCanvas(large.width,large.height);a.getContext('2d').drawImage(im,0,0);b.getContext('2d').drawImage(large,0,0);const raw=a.getContext('2d').getImageData(0,0,144,144).data,big=b.getContext('2d').getImageData(0,0,576,576).data;
 for(let y=0;y<576;y++)for(let x=0;x<576;x++){const i=(y*576+x)*4,j=(Math.floor(y/4)*144+Math.floor(x/4))*4;for(let k=0;k<4;k++)assert.equal(big[i+k],raw[j+k])}checks.push('every enlarged pixel is an exact integer copy of the native source');
 for(const variant of ['tea','cat','lamp']){const x=await study('skills/pocketworld/assets/art-studies/transfer',path.join(temp,variant),{times:[0,1.5],variant});assert(x.samples.every(s=>s.stats.occupiedCells>0&&s.stats.partialAlphaCells===0));assert.equal(x.variant,variant)}checks.push('three distinct transfer exercises sample natively without a browser; no universal rig');
 const starter=await study('skills/pocketworld/assets/pixel-starter/scene',path.join(temp,'pixel-starter'),{times:[0,1.5,6]});assert(starter.samples.every(s=>s.stats.partialAlphaCells===0));checks.push('portable pixel starter uses real palette and hard native coverage');
 const m=JSON.parse(await fs.readFile(path.join(pottery,'manifest.json'),'utf8'));assert(m.files['study.json']&&m.files[sample.crops[0].file]);await assert.rejects(study('skills/pocketworld/assets/examples/pottery',pottery),/already exists/);checks.push('study evidence has manifest provenance and protects existing output');
 const failedStudy=path.join(temp,'failed-study');await assert.rejects(study('skills/pocketworld/assets/examples/pottery',failedStudy,{times:[99]}),/Study times/);assert.equal(JSON.parse(await fs.readFile(path.join(failedStudy,'study-failure.json'),'utf8')).status,'failed');assert(!(JSON.parse(await fs.readFile(path.join(failedStudy,'manifest.json'),'utf8'))).study);checks.push('sampling failure is explicit even when the poster itself rendered');
}finally{if(previous===undefined)delete process.env.CHROME;else process.env.CHROME=previous}
await fs.writeFile(path.join(temp,'report.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks,diagnostics:temp},null,2));

if(!process.env.PW_CPU_ONLY){
 const {chromium}=await import('playwright'),{startServer}=await import('../cli/server.js'),{chromePath}=await import('../skills/pocketworld/scripts/browser.mjs');
 const {server,port}=await startServer(temp),browser=await chromium.launch({executablePath:chromePath(),headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/pottery/`);await page.waitForFunction(()=>!!window.pocketworld);await page.click('#play');assert(await page.evaluate(()=>pocketworld.playing));await page.click('#play');assert.equal(await page.evaluate(()=>pocketworld.playing),false);
  const frames=await page.evaluate(()=>{const w=pocketworld;w.seek(2.5);const a=w.renderer.ctx.getImageData(0,0,144,144).data;w.seek(0);const b=w.renderer.ctx.getImageData(0,0,144,144).data;return{a:Array.from(a),b:Array.from(b)}});assert.notDeepEqual(frames.a,frames.b);
  await page.goto(`http://127.0.0.1:${port}/pottery/study.html`);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('details').count(),5);assert((await page.locator('body').innerText()).includes('not assessed'));
  assert.deepEqual(errors,[]);checks.push('Playwright: pottery player initializes, controls/real frames work, study gallery loads all native/crop images');
  await fs.writeFile(path.join(temp,'report.json'),JSON.stringify({checks},null,2));console.log(checks.at(-1));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
}

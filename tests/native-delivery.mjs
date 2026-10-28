// PLAYWRIGHT_MODULE may point to a preinstalled Playwright package; no browser download needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {deliver} from '../skills/pocketworld/scripts/deliver.mjs';
import {chromePath} from '../skills/pocketworld/scripts/browser.mjs';
import {startServer} from '../cli/server.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE,'index.mjs')).href:'playwright');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pw-delivery-test-')),source=path.resolve('tests/fixtures/native-scene');
const full=path.join(root,'full'),preview=path.join(root,'preview');
const checks=[];function ok(name,value){assert(value,name);checks.push(name)}
await deliver(source,full,['video','gif','component']);await deliver(source,preview,['preview']);
await assert.rejects(deliver(source,full,['preview']),/already exists/);checks.push('existing output protected');
const {server,port}=await startServer(root),browser=await chromium.launch({executablePath:chromePath(),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/full/`);await page.waitForFunction(()=>!!window.pocketworld);
 await page.click('#play');ok('pause control',!await page.evaluate(()=>window.pocketworld.playing));
 const pixels=()=>page.evaluate(()=>Array.from(window.pocketworld.renderer.ctx.getImageData(0,0,48,48).data));
 await page.evaluate(()=>window.pocketworld.seek(0));const first=await pixels();
 ok('real alpha and opaque white',first.some((v,i)=>i%4===3&&v===0)&&first.some((v,i)=>i%4===0&&v===255&&first[i+1]===255&&first[i+2]===255&&first[i+3]===255));
 await page.evaluate(()=>window.pocketworld.seek(.6));ok('motion exists',JSON.stringify(await pixels())!==JSON.stringify(first));
 await page.evaluate(()=>window.pocketworld.seek(0));ok('backward seek clears ghosts',JSON.stringify(await pixels())===JSON.stringify(first));
 await page.evaluate(()=>window.pocketworld.seek(2));ok('exact loop seam',JSON.stringify(await pixels())===JSON.stringify(first));
 const opaque=await page.evaluate(()=>{const r=window.pocketworld.renderer;r.draw(0,{opaque:true});return Array.from(r.ctx.getImageData(0,0,48,48).data)});
 ok('white composite preserves all foreground cells',first.every((v,i)=>{const a=first[i-i%4+3];return opaque[i]===(i%4===3?255:a===0?255:v)}));
 await page.click('[data-focus="detail"]');ok('detail uses native crop',await page.locator('#view').evaluate(c=>c.width===24&&parseFloat(c.style.width)%24===0));
 await page.click('[data-focus="whole"]');await page.evaluate(()=>window.pocketworld.seek(.5));await page.click('#compare');
 ok('actual synchronized alternative',await page.evaluate(()=>{const a=document.querySelector('#view').getContext('2d').getImageData(0,0,48,48).data,b=document.querySelector('#compare-view').getContext('2d').getImageData(0,0,48,48).data;return a.some((v,i)=>v!==b[i])}));
 await page.click('[data-bg="dark"]');ok('dark transparency check',await page.locator('#stage').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(41, 49, 54)'));
 await page.selectOption('#format','component');ok('component download exists',await page.locator('#download').getAttribute('href')==='component.js');
 await page.click('#reset');ok('replay resumes',await page.evaluate(()=>window.pocketworld.playing&&window.pocketworld.time<.3));
 await page.setViewportSize({width:375,height:812});ok('mobile fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(`http://127.0.0.1:${port}/preview/`);await page.waitForFunction(()=>!!window.pocketworld);await page.selectOption('#format','gif');ok('unbuilt formats have no fake download',await page.locator('#download').isHidden()&&await page.locator('#request').isVisible());
 await page.goto(pathToFileURL(path.join(full,'index.html')).href);await page.waitForFunction(()=>!!window.pocketworld);ok('offline self-contained review',true);
 await page.goto(`http://127.0.0.1:${port}/full/embed.html`);await page.evaluate(async()=>{const {tagName}=await import('./component.js');window.sceneTag=tagName});await page.waitForFunction(()=>document.querySelector(sceneTag)?.renderer);
 await page.waitForFunction(()=>document.querySelector(sceneTag).time>.08);ok('multiple independent components',await page.evaluate(()=>{const [a,b]=document.querySelectorAll(sceneTag);return a.renderer!==b.renderer&&b.time===0&&b.raf===0}));
 await page.evaluate(()=>{const a=document.querySelector(sceneTag);a.pause();a.seek(.5)});const paused=await page.evaluate(()=>document.querySelector(sceneTag).time);await page.waitForTimeout(120);ok('explicit pause holds',await page.evaluate(()=>document.querySelector(sceneTag).time)===paused);
 ok('component transparent white survives colored host',await page.evaluate(()=>{const e=document.querySelector(sceneTag);e.style.background='#d9bda3';const a=e.renderer.ctx.getImageData(0,0,48,48).data;return a[3]===0&&a.some((v,i)=>i%4===0&&v===255&&a[i+1]===255&&a[i+2]===255&&a[i+3]===255)}));
 ok('detach cleans GPU and reconnect works',await page.evaluate(()=>{const e=document.querySelector(sceneTag),r=e.renderer;e.remove();const clean=r.destroyed&&!e.raf&&!e.renderer;document.body.append(e);return clean&&!!e.renderer&&e.renderer!==r&&e.time===.5}));
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.reduced=document.createElement(sceneTag);document.body.append(reduced)});ok('reduced motion initially pauses',await page.evaluate(()=>!reduced.wantsPlay&&!reduced.raf));await page.evaluate(()=>reduced.play());await page.waitForFunction(()=>reduced.time>0);ok('explicit play overrides reduced motion',true);
 await page.evaluate(()=>{reduced.style.marginTop='4000px'});await page.waitForFunction(()=>!reduced.visible&&!reduced.raf);ok('offscreen suspends RAF',true);
 await page.goto(`http://127.0.0.1:${port}/full/`);await page.evaluate(()=>{window.video=document.createElement('video');video.muted=true;video.src='loop.mp4';document.body.append(video);return video.play()});await page.waitForFunction(()=>video.currentTime>.1);ok('actual MP4 plays',await page.evaluate(()=>video.videoWidth===144&&Math.abs(video.duration-2)<.08));
 ok('no browser errors',errors.length===0);
 const probe=spawnSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,r_frame_rate,width,height','-of','json',path.join(full,'loop.mp4')],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);const stream=JSON.parse(probe.stdout).streams[0];ok('encoded MP4 120 frames at 60fps',stream.nb_frames==='120'&&stream.r_frame_rate==='60/1');
 const python=process.env.PYTHON||'python3';const gif=spawnSync(python,['-c',`from PIL import Image,ImageSequence
import sys,json
im=Image.open(sys.argv[1]);frames=[f.copy().convert('RGBA') for f in ImageSequence.Iterator(im)];dur=[]
im.seek(0)
for f in ImageSequence.Iterator(im): dur.append(f.info.get('duration',0))
a=list(frames[0].getdata());assert any(p[3]==0 for p in a);assert (255,255,255,255) in a;assert sum(dur)==2000;assert len(frames)==40;assert all(d==50 for d in dur)
print(json.dumps({'frames':len(frames),'duration':sum(dur),'alpha':True,'white':True}))`,path.join(full,'loop.gif')],{encoding:'utf8'});assert.equal(gif.status,0,gif.stderr);checks.push('actual GIF 40 frames, alpha, white and 50ms timing');
 const report={checks,outputs:root};await fs.writeFile(path.join(root,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}

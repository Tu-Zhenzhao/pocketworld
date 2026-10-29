import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {deliver,bundle} from '../skills/pocketworld/scripts/deliver.mjs';import {cpuSession} from '../skills/pocketworld/scripts/cpu.mjs';import {doctor} from '../skills/pocketworld/scripts/doctor.mjs';
import {launchBrowser} from '../skills/pocketworld/scripts/browser.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pw-cpu-test-')),checks=[];
const previous=process.env.CHROME;process.env.CHROME=path.join(root,'unavailable-browser');
try{
 const d=await doctor();assert(d.ready);assert.equal(d.selectedBackend,'cpu');assert(!d.checks.find(c=>c.name==='browser-webgl2').ok);checks.push('doctor is usable after actual browser-discovery failure');
 const out=path.join(root,'auto');const m=await deliver('tests/fixtures/native-scene',out,['video','gif','component']);assert.equal(m.backend,'cpu');assert.match(m.browserError,/CHROME does not exist/);assert(m.alphaProbe.empty&&m.alphaProbe.solid);checks.push('auto falls back with original error, exports MP4/GIF/component');
 const probe=spawnSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,nb_read_frames,r_frame_rate,duration','-of','json',path.join(out,'loop.mp4')],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);const video=JSON.parse(probe.stdout).streams[0];assert.equal(video.nb_read_frames,'120');assert.equal(video.r_frame_rate,'60/1');assert.equal(video.width,144);checks.push('CPU export actually decodes 120 frames / 60fps / 144px');
 await assert.rejects(deliver('tests/fixtures/native-scene',path.join(root,'strict'),['preview'],{backend:'browser'}),/CHROME does not exist/);checks.push('explicit browser is strict');
 const still=await deliver('tests/fixtures/native-scene',path.join(root,'still'),['preview'],{backend:'cpu',variant:'still'});assert.equal(still.selectedVariant,'still');assert.equal(still.browserError,null);checks.push('explicit CPU avoids browser and preserves selected variant');
 const custom=path.join(root,'custom');await fs.mkdir(custom);await fs.writeFile(path.join(custom,'scene.js'),`export default {config:{id:'canvas-only',grid:32,loop:2,fps:60},createRenderer(canvas){canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');return {canvas,ctx,draw(t){ctx.clearRect(0,0,32,32);ctx.fillStyle='#fff';ctx.fillRect(8+Math.round(Math.sin(t*Math.PI)*2),8,8,8)},capture(){return canvas.toDataURL('image/png').split(',')[1]},destroy(){}}}}`);const customResult=await deliver(custom,path.join(root,'custom-output'),['preview','component'],{backend:'cpu'});assert(customResult.alphaProbe.empty&&customResult.alphaProbe.solid);checks.push('canvas-only custom adapter works without DOM/WebGL');
 const unsupported=path.join(root,'unsupported');await fs.mkdir(unsupported);await fs.writeFile(path.join(unsupported,'scene.js'),`export default {config:{id:'webgl-only',grid:32,loop:2,fps:60},createRenderer(){throw Error('custom WebGL is required')}}`);await assert.rejects(deliver(unsupported,path.join(root,'unsupported-output'),['preview'],{backend:'cpu'}),/CPU|cpu-render/);checks.push('unsupported custom renderer fails honestly');
 for(const name of ['juggler','ox-noon']){const dir=path.join(root,name);await deliver('skills/pocketworld/assets/examples/'+name,dir,['preview','component'],{backend:'cpu'});const url=await bundle(path.join(dir,'scenes/current/scene.js')),session=await cpuSession(url);try{const r=session.mount();r.draw(0);const first=r.capture(1);r.draw(.5);assert.notEqual(first,r.capture(1));r.draw(12);assert.equal(first,r.capture(1));const pixels=r.ctx.getImageData(0,0,240,240).data;assert(pixels.some((v,i)=>i%4===3&&v===0));checks.push(name+': CPU native motion, exact seam and alpha')}finally{session.close()}}
}finally{if(previous===undefined)delete process.env.CHROME;else process.env.CHROME=previous}
// Compare real browser and native CPU silhouettes/palettes, not just state functions.
if(!process.env.PW_CPU_ONLY){const handle=await launchBrowser();
try{
 const page=await handle.newPage();await page.setContent('<canvas id="c"></canvas>');
 for(const name of ['juggler','ox-noon']){
  const url=await bundle(path.join(root,name,'scenes/current/scene.js')),session=await cpuSession(url),r=session.mount();
  const mountURL=await bundle(path.resolve('skills/pocketworld/assets/native-starter/engine/renderer.js'));
  for(const t of [0,2.5]){r.draw(t);const cpu=r.ctx.getImageData(0,0,240,240).data;const gpu=await page.evaluate(async({url,mountURL,t})=>{const scene=(await import(url)).default,{mountRenderer}=await import(mountURL);const renderer=mountRenderer(document.querySelector('canvas'),scene);renderer.draw(t);const data=Array.from(renderer.ctx.getImageData(0,0,240,240).data);renderer.destroy();return data},{url,mountURL,t});let union=0,intersection=0;for(let i=3;i<cpu.length;i+=4){if(cpu[i]||gpu[i])union++;if(cpu[i]&&gpu[i])intersection++}assert(intersection/union>.97,`${name} silhouette overlap ${intersection/union}`)}session.close();checks.push(name+': GPU/CPU silhouette IoU >97% at two poses');
 }
}finally{await handle.close()}}
await fs.writeFile(path.join(root,'report.json'),JSON.stringify({checks,root},null,2));console.log(JSON.stringify({checks,root},null,2));

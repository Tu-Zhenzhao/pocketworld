#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {launchBrowser} from './browser.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),assets=path.resolve(here,'../assets');
const jsonForHTML=value=>JSON.stringify(value).replace(/</g,'\\u003c');

// Static local ES modules only. Fail explicitly on cycles instead of emitting a broken bundle.
export async function bundle(entry,cache=new Map(),stack=new Set()){
 const file=path.resolve(entry);if(cache.has(file))return cache.get(file);if(stack.has(file))throw Error(`Cyclic imports: ${file}`);stack.add(file);
 let source=await fs.readFile(file,'utf8');
 const imports=[...source.matchAll(/(?:from\s*|import\s*)(['"])(\.{1,2}\/[^'"]+)\1/g)];
 for(const m of imports){const target=await bundle(path.resolve(path.dirname(file),m[2]),cache,stack);source=source.replace(m[0],m[0].replace(m[1]+m[2]+m[1],JSON.stringify(target)))}
 stack.delete(file);const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(file,result);return result;
}
export function validateDelivery(data,config){
 const n=config.grid;if(!/^[a-z][a-z0-9-]{0,47}$/.test(config.id||''))throw Error('Scene id must be a unique lowercase ASCII slug, maximum48 characters');if(!Number.isInteger(n)||n<1||!Number.isFinite(config.loop)||config.loop<=0||!Number.isInteger(config.fps)||config.fps<1||!Number.isInteger(config.loop*config.fps))throw Error('grid/fps must be positive integers; loop × fps must be integer');
 const focus=data.focus||[],variants=data.variants||[{id:'final',label:'当前方案',options:{}}];
 if(!variants.length||new Set(variants.map(v=>v.id)).size!==variants.length||variants.some(v=>!v.id||!v.label||!v.options||typeof v.options!=='object'))throw Error('Variants need unique ids, labels and options');
 if(new Set(['whole',...focus.map(f=>f.id)]).size!==focus.length+1)throw Error('Focus ids must be unique; whole is reserved');
 for(const f of focus){const r=f.rect;if(!f.id||!f.label||!Array.isArray(r)||r.length!==4||!r.every(Number.isInteger)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>n||r[1]+r[3]>n)throw Error(`Invalid native-cell crop: ${f.id}`)}
 return {...data,title:data.title||config.title||config.id,caption:data.caption||'',focus,variants,artifacts:{}};
}
function run(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:4*1024*1024});if(r.error||r.status!==0)throw Error(`${bin}: ${r.error?.message||r.stderr?.slice(-3000)||r.status}`);return r.stdout}
function encoder(){if(process.env.FFMPEG_PATH){run(process.env.FFMPEG_PATH,['-version']);return process.env.FFMPEG_PATH}for(const bin of ['ffmpeg','/opt/homebrew/bin/ffmpeg']){const r=spawnSync(bin,['-version'],{stdio:'ignore'});if(r.status===0)return bin}throw Error('ffmpeg not found. Set FFMPEG_PATH for video/GIF export.');}
async function copyModules(src,dest,excluded){await fs.mkdir(dest,{recursive:true});for(const item of await fs.readdir(src,{withFileTypes:true})){const from=path.join(src,item.name);if(from===excluded||item.name.startsWith('.')||['node_modules','out','dist','frames'].includes(item.name))continue;const to=path.join(dest,item.name);if(item.isDirectory())await copyModules(from,to,excluded);else if(/\.(js|json)$/.test(item.name))await fs.copyFile(from,to)}}
export async function deliver(sceneDir,out,formats,{variant}={}){
 sceneDir=path.resolve(sceneDir);out=path.resolve(out);if(out===sceneDir||sceneDir.startsWith(out+path.sep))throw Error('Output must not contain the source scene');
 await fs.access(path.join(sceneDir,'scene.js'));if(formats.some(f=>!['preview','video','gif','component'].includes(f)))throw Error('Formats: preview,video,gif,component');
 // Never overwrite a prior result or mistake old files for fresh output.
 try{await fs.mkdir(out)}catch(error){if(error.code==='EEXIST')throw Error('Output already exists. Choose a fresh output directory.');throw error}
 let handle;
 try{
  await copyModules(sceneDir,path.join(out,'scenes/current'),out);await fs.cp(path.join(assets,'native-starter/engine'),path.join(out,'engine'),{recursive:true});
  // Inspect the scene in the browser; its module can depend on browser globals.
  const sceneURL=await bundle(path.join(out,'scenes/current/scene.js'));
  handle=await launchBrowser({timeout:15000});const page=await handle.browser.newPage();page.setDefaultTimeout(20000);
  await page.setContent('<meta charset="utf-8">');const config=await page.evaluate(async url=>(await import(url)).default.config,sceneURL);
  let meta={};try{meta=JSON.parse(await fs.readFile(path.join(sceneDir,'delivery.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  const data=validateDelivery(meta,config);if(variant){const selected=data.variants.find(v=>v.id===variant);if(!selected)throw Error(`Unknown variant: ${variant}`);data.variants=[selected,...data.variants.filter(v=>v!==selected)]}const grid=config.grid,fps=config.fps,count=config.loop*fps;data.componentTag=`pocketworld-${config.id}-${createHash('sha256').update(sceneURL+JSON.stringify(data.variants[0].options)).digest('hex').slice(0,8)}`;
  await fs.copyFile(path.join(assets,'delivery/app.js'),path.join(out,'app.js'));
  const componentSource=(await fs.readFile(path.join(assets,'delivery/component.js'),'utf8')).replace('// Self-contained module',`const selectedOptions=${JSON.stringify(data.variants[0].options)};\n// Self-contained module`).replace('...this.options','...selectedOptions,...this.options').replaceAll('pocketworld-scene',data.componentTag);
  await fs.writeFile(path.join(out,'component-module.js'),componentSource);
  const appURL=await bundle(path.join(out,'app.js'));
  const template=await fs.readFile(path.join(assets,'delivery/index.html'),'utf8');
  const html=()=>template.replace('<script type="module" src="app.js"></script>',`<script>window.POCKETWORLD_DELIVERY=${jsonForHTML(data)}</script><script type="module">import ${JSON.stringify(appURL)};</script>`);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.setContent(html());await page.waitForFunction(()=>!!window.pocketworld);
  const alpha=await page.evaluate(()=>{const r=window.pocketworld;r.seek(0);const a=r.renderer.ctx.getImageData(0,0,r.scene.config.grid,r.scene.config.grid).data;let empty=0,solid=0;for(let i=3;i<a.length;i+=4){if(a[i]===0)empty++;if(a[i]===255)solid++}return{empty,solid}});
  if(!alpha.empty||!alpha.solid)throw Error('Expected visible scene and transparent margins; check actual alpha.');
  const capture=async(t,file)=>{const png=await page.evaluate(t=>window.pocketworld.capture(t,1),t);await fs.writeFile(file,Buffer.from(png,'base64'))};
  await capture(0,path.join(out,'poster.png'));
  const scale=grid%2===0?3:4,side=grid*scale; // H.264/yuv420p needs even dimensions; retain integer pixel scaling.
  if(formats.includes('component')){
   const componentURL=await bundle(path.join(out,'component-module.js'));await fs.writeFile(path.join(out,'component.js'),`// Pocketworld standalone scene. WebGL2 and CSP data: imports required.\nexport * from ${JSON.stringify(componentURL)};\n`);
   await fs.writeFile(path.join(out,'embed.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Transparent Pocketworld</title><body style="background:#293136;color:white;font-family:sans-serif"><p>透明组件：背景由宿主提供</p><script type="module" src="component.js"></script><${data.componentTag}></${data.componentTag}><${data.componentTag} paused style="background:#d9bda3"></${data.componentTag}>`);
   data.artifacts.component={file:'component.js',example:'embed.html',tagName:data.componentTag,alpha:true};
  }
  if(formats.some(f=>['video','gif'].includes(f))){
   const ffmpeg=encoder(),frames=path.join(out,'.frames');await fs.mkdir(frames);
   for(let i=0;i<count;i++){await capture(i/fps,path.join(frames,`${String(i).padStart(6,'0')}.png`));if(i%120===0)console.log(`Captured ${i}/${count}`)}
   const input=path.join(frames,'%06d.png');
   if(formats.includes('video')){run(ffmpeg,['-y','-v','error','-f','lavfi','-i',`color=c=white:s=${grid}x${grid}:r=${fps}`,'-framerate',String(fps),'-i',input,'-filter_complex',`[0:v][1:v]overlay=shortest=1,scale=${side}:${side}:flags=neighbor,format=yuv420p[v]`,'-map','[v]','-frames:v',String(count),'-c:v','libx264','-crf','18','-movflags','+faststart',path.join(out,'loop.mp4')]);data.artifacts.video={file:'loop.mp4',fps,frames:count,seconds:config.loop,width:side,height:side,alpha:false}}
   if(formats.includes('gif')){if(!Number.isInteger(config.loop*20))throw Error('GIF duration must be a multiple of 50ms');run(ffmpeg,['-y','-v','error','-framerate',String(fps),'-i',input,'-filter_complex',`fps=20,scale=${side}:${side}:flags=neighbor,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=none:alpha_threshold=128`,'-loop','0',path.join(out,'loop.gif')]);data.artifacts.gif={file:'loop.gif',fps:20,seconds:config.loop,width:side,height:side,alpha:'binary'}}
   await fs.rm(frames,{recursive:true});
  }
  await fs.writeFile(path.join(out,'index.html'),html());
  await fs.writeFile(path.join(out,'README.txt'),`${data.title}\nOpen index.html to review. Serve this directory over HTTP to use embed.html.\nExports use first variant: ${data.variants[0].label}.\ncomponent-module.js + engine/ + scenes/ are unbundled integration sources; only component.js is standalone.\nMP4: white opaque; GIF: 20 fps binary transparency; web: WebGL2, true alpha.\n`);
  const files={};async function hash(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())await hash(f);else{const b=await fs.readFile(f);files[path.relative(out,f)]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}}}}await hash(out);
  const manifest={createdAt:new Date().toISOString(),status:'generated',version:'0.4.0',componentTag:data.componentTag,title:data.title,selectedVariant:data.variants[0].id,grid,fps,seconds:config.loop,alphaProbe:alpha,artifacts:data.artifacts,files};await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({out,artifacts:data.artifacts,alpha}));return manifest;
 }catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({status:'failed',message:error.message}));throw error}finally{await handle?.close()}
}
if(process.argv[1]&&(await fs.realpath(process.argv[1]).catch(()=>null))===(await fs.realpath(fileURLToPath(import.meta.url)))){
 const args=process.argv.slice(2),source=args.shift(),outIndex=args.indexOf('--out'),formatIndex=args.indexOf('--formats');
 if(!source||outIndex<0||!args[outIndex+1]){console.error('Usage: node deliver.mjs <scene-folder> --out <fresh-output-directory> --formats preview|video,gif,component');process.exitCode=1}
 else try{await deliver(source,args[outIndex+1],(formatIndex<0?'preview':args[formatIndex+1]||'preview').split(','),{variant:args.includes('--variant')?args[args.indexOf('--variant')+1]:undefined})}catch(error){console.error(error.message);process.exitCode=1}
}

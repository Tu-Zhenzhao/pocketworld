#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {deliver,bundle} from './deliver.mjs';
import {cpuSession} from './cpu.mjs';

export function pixelStats(data,width,height){
 const colors=new Set(),alphas=new Set();let occupied=0,partialAlpha=0,minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,a=data[i+3];alphas.add(a);if(!a)continue;
  occupied++;if(a<255)partialAlpha++;colors.add(`${data[i]},${data[i+1]},${data[i+2]},${a}`);
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 return {occupiedCells:occupied,occupiedFraction:occupied/(width*height),bounds:occupied?[minX,minY,maxX-minX+1,maxY-minY+1]:null,visibleRGBAColors:colors.size,alphaValues:[...alphas].sort((a,b)=>a-b),partialAlphaCells:partialAlpha};
}
export function sampleTimes(value,loop){
 const times=value===undefined?[0,loop/4,loop/2,loop*3/4,loop]:typeof value==='string'?value.split(',').map(v=>v.trim()===''?NaN:Number(v)):value;
 if(!Array.isArray(times)||!times.length||times.length>180||times.some(t=>!Number.isFinite(t)||t<0||t>loop))throw Error('Study times must contain 1–180 finite seconds inside [0, loop]');
 return times;
}
export async function study(sceneDir,out,{times,variant,scale=4,backend='cpu'}={}){
 if(backend!=='cpu')throw Error('Study uses native CPU sampling; use deliver for browser capture');
 if(!Number.isInteger(scale)||scale<1||scale>16)throw Error('Study scale must be an integer from 1 to 16');
 // Reuse the established scene copy/bundle/validation and standard local player.
 const manifest=await deliver(sceneDir,out,['preview'],{variant,backend:'cpu'});
 out=path.resolve(out);let session;
 try{
  session=await cpuSession(await bundle(path.join(out,'scenes/current/scene.js')));
  const scene=session.scene,meta=JSON.parse(await fs.readFile(path.join(out,'scenes/current/delivery.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e}));
  const options=(meta.variants||[{id:'final',options:{}}]).find(v=>v.id===manifest.selectedVariant)?.options||{};
  const renderer=session.mount(options),n=scene.config.grid,samples=[],dir=path.join(out,'study');await fs.mkdir(dir);
  if(renderer.canvas.width!==n||renderer.canvas.height!==n)throw Error('Renderer canvas dimensions must match config.grid for native-cell inspection');
  const capture=scale=>{const c=document.createElement('canvas');c.width=c.height=n*scale;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(renderer.canvas,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]};
  for(const [i,time]of sampleTimes(times,scene.config.loop).entries()){
   renderer.draw(time,options);const stem=String(i).padStart(3,'0'),native=`study/${stem}-native.png`,large=`study/${stem}-large.png`;
   await fs.writeFile(path.join(out,native),Buffer.from(capture(1),'base64'));await fs.writeFile(path.join(out,large),Buffer.from(capture(scale),'base64'));
   const data=renderer.ctx.getImageData(0,0,n,n).data,crops=[];
   for(const f of meta.focus||[]){const [x,y,w,h]=f.rect,c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(renderer.canvas,x,y,w,h,0,0,c.width,c.height);const file=`study/${stem}-crop-${crops.length}.png`;await fs.writeFile(path.join(out,file),Buffer.from(c.toDataURL('image/png').split(',')[1],'base64'));crops.push({id:f.id,label:f.label,rect:f.rect,file})}
   samples.push({time,native,large,crops,stats:pixelStats(data,n,n)});
  }
  const report={schemaVersion:1,status:'sampled',aestheticApproval:'not-assessed',backend:'cpu',grid:n,scale,variant:manifest.selectedVariant,sourceHashes:Object.fromEntries(Object.entries(manifest.files).filter(([k])=>k.startsWith('scenes/current/')).map(([k,v])=>[k,v.sha256])),samples,limits:['Statistics describe sampled pixels, not anatomy, identity, contact correctness or elegance.','Partial alpha can be intentional; inspect the relevant layer before changing it.','Interior antialiasing may create opaque blended colors; binary alpha alone does not prove hard edges.','Choose actual action extremes and adjacent frames; the default times are only a starting point.']};
  await fs.writeFile(path.join(out,'study.json'),JSON.stringify(report,null,2));
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  await fs.writeFile(path.join(out,'study.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native study</title><style>body{font:15px system-ui;max-width:1100px;margin:30px auto;padding:16px;color:#394436}img{image-rendering:pixelated;max-width:none}figure{margin:20px 0;overflow:auto}details{margin:16px 0}</style><h1>${escape(scene.config.title||scene.config.id)}</h1><p>Native cells and integer crops. Art approval: not assessed. <a href="index.html">Local review player</a> · <a href="study.json">Facts and source hashes</a></p>${samples.map(s=>`<details open><summary>${s.time}s · ${n}×${n} native cells</summary><figure><img src="${s.native}" alt="Native frame at ${s.time}s"></figure><figure><img src="${s.large}" alt="Integer enlargement"></figure>${s.crops.map(c=>`<figure><figcaption>${escape(c.label)}</figcaption><img src="${c.file}" alt="${escape(c.label)}"></figure>`).join('')}</details>`).join('')}`);
  for(const file of ['study.json','study.html',...(await fs.readdir(dir)).map(f=>'study/'+f)]){const bytes=await fs.readFile(path.join(out,file));manifest.files[file]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}
  manifest.study={report:'study.json',gallery:'study.html',aestheticApproval:'not-assessed'};await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  return report;
 }catch(error){await fs.writeFile(path.join(out,'study-failure.json'),JSON.stringify({status:'failed',message:error.message}));throw error}finally{session?.close()}
}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url))){
 try{const {positionals,values}=parseArgs({options:{out:{type:'string'},times:{type:'string'},scale:{type:'string',default:'4'},variant:{type:'string'},backend:{type:'string',default:'cpu'}},allowPositionals:true});if(!positionals[0]||!values.out)throw Error('Usage: study.mjs <scene-folder> --out <fresh-directory> [--times 0,2.3,2.3166667,12] [--scale 4] [--variant id] [--backend cpu]');const r=await study(positionals[0],values.out,{...values,scale:Number(values.scale)});console.log(JSON.stringify({status:r.status,samples:r.samples.length,out:values.out,aestheticApproval:r.aestheticApproval}))}catch(e){console.error(e.message);process.exitCode=1}
}

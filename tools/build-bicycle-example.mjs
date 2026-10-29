// Rebuild the review/component from canonical source, retaining verified scene-matched media.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deliver} from '../skills/pocketworld/scripts/deliver.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'skills/pocketworld/assets/examples/bicycle');
const output=path.join(root,'examples/bicycle');
const media=path.resolve(process.argv[2]||output);
const sha=b=>createHash('sha256').update(b).digest('hex');
const previous=JSON.parse(await fs.readFile(path.join(media,'manifest.json'),'utf8'));
for(const name of ['scene.js','base.js'])assert.equal(sha(await fs.readFile(path.join(source,name))),sha(await fs.readFile(path.join(media,'scenes/current',name))),`Media source differs: ${name}; render fresh media instead`);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pw-bicycle-gallery-'));
try{
 const review=path.join(temp,'review');
 const manifest=await deliver(source,review,['preview','component'],{backend:'cpu'});
 for(const format of ['video','gif']){
  const artifact=previous.artifacts[format],record=previous.files[artifact.file];
  const bytes=await fs.readFile(path.join(media,artifact.file));
  assert.equal(sha(bytes),record.sha256,`Media hash differs: ${format}`);
  await fs.writeFile(path.join(review,artifact.file),bytes);
  manifest.artifacts[format]=artifact;
 }
 // Update only generated delivery metadata; keep the standard review runtime intact.
 const index=path.join(review,'index.html');
 const html=await fs.readFile(index,'utf8');
 const match=html.match(/window\.POCKETWORLD_DELIVERY=(.*?)<\/script>/s);
 assert(match,'Generated delivery metadata missing');
 const data=JSON.parse(match[1]);data.artifacts=manifest.artifacts;
 await fs.writeFile(index,html.replace(match[0],`window.POCKETWORLD_DELIVERY=${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`));
 manifest.designGrid=192;manifest.outputRaster=576;
 manifest.provenance={author:'Created with Dot and refined through user art direction',media:'Verified final cloud render; retained without transcoding',motion:'192-cell design with integer output-pixel motion at 576 pixels for cat and grass',sourceFiles:['scenes/current/scene.js','scenes/current/base.js']};
 for(const name of Object.keys(manifest.files).concat(['loop.mp4','loop.gif'])){
  const bytes=await fs.readFile(path.join(review,name));manifest.files[name]={bytes:bytes.length,sha256:sha(bytes)};
 }
 await fs.writeFile(path.join(review,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.mkdir(output,{recursive:true});await fs.cp(review,output,{recursive:true});
 console.log(`Built examples/bicycle: canonical source, standard UI, verified final media`);
}finally{await fs.rm(temp,{recursive:true,force:true})}

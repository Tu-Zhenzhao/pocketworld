import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDelivery} from '../skills/pocketworld/scripts/deliver.mjs';
const config={grid:240,fps:60,loop:12,id:'test',palette:[[255,255,255]]};
test('rejects out-of-frame crops and duplicate variants',()=>{
 assert.throws(()=>validateDelivery({focus:[{id:'bad',label:'bad',rect:[200,0,80,80]}]},config),/crop/);
 assert.throws(()=>validateDelivery({variants:[{id:'a',label:'a',options:{}},{id:'a',label:'b',options:{}}]},config),/unique/);
});
test('does not trust source metadata to claim generated downloads',()=>{
 assert.deepEqual(validateDelivery({artifacts:{video:{file:'old.mp4'}}},config).artifacts,{});
 assert.equal(validateDelivery({},config).variants[0].id,'final');
});

test('rejects scene ids that cannot safely name a component',()=>{assert.throws(()=>validateDelivery({}, {...config,id:'Not a safe id'}),/slug/)});
test('rejects missing and malformed palettes before generating an unusable player',()=>{
 for(const palette of [undefined,[],[' '],[[256,0,0]],[[0,0]],null])assert.throws(()=>validateDelivery({}, {...config,palette}),/config.palette/);
 for(const palette of [['#faf6e7'],['#fff','white','rgba(255,255,255,0.5)'],[[250,246,231]]])assert.equal(validateDelivery({}, {...config,palette}).variants[0].id,'final');
});

test('delivery helpers can be imported from a stdin-driven agent script',async()=>{const {spawnSync}=await import('node:child_process');const url=new URL('../skills/pocketworld/scripts/deliver.mjs',import.meta.url).href;const result=spawnSync(process.execPath,['--input-type=module','-'],{input:`const m=await import(${JSON.stringify(url)});console.log(typeof m.bundle);`,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'function')});

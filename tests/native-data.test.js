import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDelivery} from '../skills/pocketworld/scripts/deliver.mjs';
const config={grid:240,fps:60,loop:12,id:'test'};
test('rejects out-of-frame crops and duplicate variants',()=>{
 assert.throws(()=>validateDelivery({focus:[{id:'bad',label:'bad',rect:[200,0,80,80]}]},config),/crop/);
 assert.throws(()=>validateDelivery({variants:[{id:'a',label:'a',options:{}},{id:'a',label:'b',options:{}}]},config),/unique/);
});
test('does not trust source metadata to claim generated downloads',()=>{
 assert.deepEqual(validateDelivery({artifacts:{video:{file:'old.mp4'}}},config).artifacts,{});
 assert.equal(validateDelivery({},config).variants[0].id,'final');
});

test('rejects scene ids that cannot safely name a component',()=>{assert.throws(()=>validateDelivery({}, {...config,id:'Not a safe id'}),/slug/)});

test('delivery helpers can be imported from a stdin-driven agent script',async()=>{const {spawnSync}=await import('node:child_process');const url=new URL('../skills/pocketworld/scripts/deliver.mjs',import.meta.url).href;const result=spawnSync(process.execPath,['--input-type=module','-'],{input:`const m=await import(${JSON.stringify(url)});console.log(typeof m.bundle);`,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'function')});

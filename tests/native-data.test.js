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

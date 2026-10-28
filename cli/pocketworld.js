#!/usr/bin/env node
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),skill=path.join(root,'skills/pocketworld');
const {values,positionals}=parseArgs({options:{out:{type:'string'},formats:{type:'string',default:'preview'},variant:{type:'string'},port:{type:'string',default:'0'},json:{type:'boolean'},'install-browser':{type:'boolean'},help:{type:'boolean'}},allowPositionals:true});
const [command,arg]=positionals;
try{
 if(!command||values.help||command==='help')console.log('Pocketworld 0.4.0\n\ninit <new-scene-folder>\nsetup [--install-browser]\ndoctor [--json]\nrender <scene-folder> --out <fresh-directory> --formats preview|video,gif,component [--variant id]\ndev [delivery-directory] [--port number]\n\nAgent installation: INSTALL.md · Authoring: skills/pocketworld/SKILL.md');
 else if(command==='init'){if(!arg)throw Error('init requires a new scene folder');const target=path.resolve(arg);await fs.mkdir(target);await fs.cp(path.join(skill,'assets/native-starter/scene'),target,{recursive:true});console.log(`Scene created: ${target}`)}
 else if(command==='render'){if(!arg||!values.out)throw Error('render requires a scene folder and --out');const {deliver}=await import('../skills/pocketworld/scripts/deliver.mjs');await deliver(arg,values.out,values.formats.split(','),{variant:values.variant})}
 else if(command==='dev'){const {startServer}=await import('./server.js');const directory=path.resolve(arg||path.join(root,'examples/juggler'));const {port}=await startServer(directory,Number(values.port));console.log(`Pocketworld: http://127.0.0.1:${port}/`)}
 else if(command==='doctor'){const {doctor}=await import('../skills/pocketworld/scripts/doctor.mjs');const result=await doctor();console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1}
 else if(command==='setup'){const {setup}=await import('../skills/pocketworld/scripts/setup.mjs');await setup({installBrowser:values['install-browser']})}
 else throw Error(`Unknown command: ${command}. Run --help. The v0.3 raster pipeline is archived; see docs/migration.md.`);
}catch(error){console.error(error.message);process.exitCode=1}

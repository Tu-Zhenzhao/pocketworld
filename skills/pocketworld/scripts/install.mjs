#!/usr/bin/env node
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';import {run} from './runtime.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function installSkill({dest,update=false,skipDependencies=false,installBrowser=false}={}){
 if(!dest)throw Error('Choose a host Skill directory with --dest /path/to/skills/pocketworld');
 const target=path.resolve(dest);if(target===source||target.startsWith(source+path.sep)||source.startsWith(target+path.sep))throw Error('Install destination must be separate from the source Skill');
 const version=(await fs.readFile(path.join(source,'VERSION'),'utf8')).trim();let existing=false;
 try{await fs.lstat(target);existing=true}catch(error){if(error.code!=='ENOENT')throw error}
 if(existing){if(!update)throw Error('Destination exists. Use --update to back up and replace a recognized Pocketworld Skill.');const current=await fs.readFile(path.join(target,'SKILL.md'),'utf8').catch(()=> '');if(!/^name:\s*pocketworld\s*$/m.test(current))throw Error('Existing directory is not a recognized Pocketworld Skill; choose another destination.')}
 const parent=path.dirname(target);await fs.mkdir(parent,{recursive:true});const stage=path.join(parent,`.pocketworld-install-${randomUUID()}`);let backup;
 try{
  await fs.cp(source,stage,{recursive:true,filter:file=>!['node_modules','browser.json','.DS_Store'].includes(path.basename(file))});
  if(!skipDependencies){console.log('Preparing the self-contained Pocketworld runtime…');const args=[path.join(stage,'scripts/setup.mjs')];if(installBrowser)args.push('--install-browser');console.log(await run(process.execPath,args,{timeout:600000}))}
  if(existing){const backups=path.join(path.dirname(parent),'.pocketworld-backups');await fs.mkdir(backups,{recursive:true});backup=path.join(backups,`${path.basename(target)}-${Date.now()}-${randomUUID().slice(0,8)}`);await fs.rename(target,backup)}
  try{await fs.rename(stage,target)}catch(error){if(backup)await fs.rename(backup,target);throw error}
  return{status:skipDependencies?'staged':existing?'updated':'installed',version,path:target,runtimeReady:!skipDependencies,backup:backup||null};
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error}
}
export async function installCLI(){const{values}=parseArgs({options:{dest:{type:'string'},update:{type:'boolean'},'skip-deps':{type:'boolean'},'no-browser-download':{type:'boolean'},'install-browser':{type:'boolean'},help:{type:'boolean'}}});if(values.help){console.log('node scripts/install.mjs --dest /path/to/skills/pocketworld [--update] [--no-browser-download]\nDefault: install and verify native CPU rendering. Browser download is optional with --install-browser. Existing Pocketworld updates are backed up outside Skill discovery. --skip-deps is for source-only inspection/tests.');return}try{const result=await installSkill({dest:values.dest,update:values.update,skipDependencies:values['skip-deps'],installBrowser:!!values['install-browser']&&!values['no-browser-download']});console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1}}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url)))await installCLI();

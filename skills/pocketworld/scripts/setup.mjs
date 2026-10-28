import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {run} from './runtime.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
export async function setup({installBrowser=false}={}){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Node20+ required');
 await run(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir});
 const {chromePath}=await import('./browser.mjs');let executable;
 try{executable=chromePath()}catch(error){if(process.env.CHROME||!installBrowser)throw error}
 if(!executable){const {install,resolveBuildId,detectBrowserPlatform,Browser}=await import('@puppeteer/browsers');const platform=detectBrowserPlatform();if(!platform)throw Error('No supported Chrome download for this platform; set CHROME manually');const buildId=await resolveBuildId(Browser.CHROME,platform,'stable');const browser=await install({browser:Browser.CHROME,buildId,platform,cacheDir:path.join(os.homedir(),'.cache/pocketworld/browsers'),downloadProgressCallback:'default'});executable=browser.executablePath;await fs.writeFile(path.join(dir,'browser.json'),JSON.stringify({executablePath:executable,buildId}))}
 console.log(JSON.stringify({status:'ready',node:process.versions.node,chrome:executable}));return executable;
}
if(process.argv[1]&&await fs.realpath(process.argv[1])===await fs.realpath(fileURLToPath(import.meta.url)))try{await setup({installBrowser:process.argv.includes('--install-browser')})}catch(error){console.error(error.message);process.exitCode=1}

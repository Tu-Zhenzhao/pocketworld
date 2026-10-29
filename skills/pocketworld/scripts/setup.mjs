import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {run} from './runtime.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
export async function setup({installBrowser=false,forceBrowser=false}={}){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Node20+ required');
 const env={...process.env};if(!env.npm_config_cache&&!env.NPM_CONFIG_CACHE)env.npm_config_cache=path.join(os.tmpdir(),`pocketworld-npm-${process.getuid?.()??'user'}`);
 await run(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,env});
 const {chromePath}=await import('./browser.mjs');let executable,browserDiscoveryError;
 if(forceBrowser&&process.env.CHROME)throw Error('Unset CHROME before requesting a managed browser download');
 if(!forceBrowser)try{executable=chromePath()}catch(error){browserDiscoveryError=error.message;if(process.env.CHROME&&installBrowser)throw error}
 if(!executable&&(installBrowser||forceBrowser)){const {install,resolveBuildId,detectBrowserPlatform,Browser}=await import('@puppeteer/browsers');const platform=detectBrowserPlatform();if(!platform)throw Error('No supported Chrome download for this platform; set CHROME manually');const buildId=await resolveBuildId(Browser.CHROME,platform,'stable');const browser=await install({browser:Browser.CHROME,buildId,platform,cacheDir:path.join(os.tmpdir(),'pocketworld-browsers'),downloadProgressCallback:'default'});executable=browser.executablePath;await fs.writeFile(path.join(dir,'browser.json'),JSON.stringify({executablePath:executable,buildId}))}
 const {doctor}=await import('./doctor.mjs');const diagnostics=await doctor({backend:'cpu'});if(!diagnostics.ready)throw Error(`Native CPU self-test failed: ${JSON.stringify(diagnostics)}`);
 console.log(JSON.stringify({status:'ready',node:process.versions.node,chrome:executable||null,backend:'cpu',browserVerified:false,browserDiscoveryError:browserDiscoveryError||null,diagnostics}));return executable;
}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>null)===await fs.realpath(fileURLToPath(import.meta.url)))try{await setup({installBrowser:process.argv.includes('--install-browser'),forceBrowser:process.argv.includes('--force-browser-download')})}catch(error){console.error(error.message);process.exitCode=1}

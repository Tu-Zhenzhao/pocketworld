import {spawn} from 'node:child_process';
export function run(command,args,{cwd,timeout=600000,env=process.env}={}){
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']}),output=[];let timer;const done=()=>clearTimeout(timer);child.stdout.on('data',d=>output.push(d));child.stderr.on('data',d=>output.push(d));child.once('error',error=>{done();reject(error)});child.once('close',(code,signal)=>{done();if(code===0)resolve(Buffer.concat(output).toString());else reject(Error(`${command}: exit ${code??signal}\n${Buffer.concat(output).toString().slice(-4000)}`))});timer=setTimeout(()=>{child.kill('SIGKILL')},timeout)})
}

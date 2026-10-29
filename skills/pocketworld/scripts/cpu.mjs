// Node-only Canvas2D host. No browser process, server, CDP or network sockets.
import {createCanvas,ImageData} from '@napi-rs/canvas';
import {mountRenderer} from '../assets/native-starter/engine/renderer.js';
export function installCanvasHost(){
 if(!globalThis.document)globalThis.document={createElement(name){if(name!=='canvas')throw Error(`CPU host only provides canvas, not ${name}`);return createCanvas(1,1)}};
 globalThis.ImageData??=ImageData;
}
export async function cpuSession(url){installCanvasHost();const scene=(await import(url)).default;if(!scene?.config)throw Error('Scene must export default.config');let renderer;
 return {scene,mount(options={}){const canvas=createCanvas(scene.config.grid,scene.config.grid);try{renderer=mountRenderer(canvas,scene,{backend:'cpu'});renderer.draw(0,options)}catch(error){renderer?.destroy();throw Error(`cpu-render: ${error.message}. Custom WebGL renderers must implement createRenderer(canvas, {backend: 'cpu'}) using native software drawing.`)}return renderer},close(){renderer?.destroy()}};
}

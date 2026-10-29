import scene from './scenes/current/scene.js';
import {mountRenderer} from './engine/renderer.js';
const selectedOptions={};
// Self-contained module after deliver.mjs bundles these relative imports.
export class PocketworldScene extends HTMLElement {
 static observedAttributes=['paused','opaque'];
 constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.innerHTML='<style>:host{display:inline-block;width:480px;max-width:100%}canvas{display:block;width:100%;image-rendering:pixelated}</style><canvas part="canvas" aria-label="Animated pixel scene"></canvas>';this.time=0;this.visible=true;this.wantsPlay=false;this.raf=0}
 connectedCallback(){if(this.renderer)return;try{this.renderer=mountRenderer(this.shadowRoot.querySelector('canvas'),scene)}catch(error){this.dispatchEvent(new CustomEvent('sceneerror',{detail:error}));return}this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.wantsPlay=!this.hasAttribute('paused')&&!this.motion.matches;this.changed=()=>this.sync();this.reduced=()=>{if(!this.explicitPlay)this.wantsPlay=!this.motion.matches&&!this.hasAttribute('paused');this.sync()};document.addEventListener('visibilitychange',this.changed);this.motion.addEventListener('change',this.reduced);this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.sync()});this.observer.observe(this);this.draw();this.sync()}
 disconnectedCallback(){this.destroy()}
 attributeChangedCallback(name){if(!this.renderer)return;if(name==='paused'){this.wantsPlay=!this.hasAttribute('paused')&&!this.motion.matches;this.explicitPlay=false}this.draw();this.sync()}
 draw(){this.renderer?.draw(this.time,{...selectedOptions,...this.options,opaque:this.hasAttribute('opaque')})}
 sync(){cancelAnimationFrame(this.raf);this.raf=0;this.last=null;if(this.renderer&&this.wantsPlay&&this.visible&&!document.hidden)this.raf=requestAnimationFrame(now=>this.tick(now))}
 tick(now){if(!this.renderer)return;if(this.last!==null)this.time=(this.time+(now-this.last)/1000)%scene.config.loop;this.last=now;this.draw();this.raf=requestAnimationFrame(t=>this.tick(t))}
 play(){this.removeAttribute('paused');this.explicitPlay=true;this.wantsPlay=true;this.sync()}
 pause(){this.wantsPlay=false;this.setAttribute('paused','');this.sync()}
 replay(){this.seek(0);this.play()}
 seek(seconds){if(!Number.isFinite(seconds))throw Error('seek expects finite seconds');this.time=((seconds%scene.config.loop)+scene.config.loop)%scene.config.loop;this.last=null;this.draw()}
 destroy(){cancelAnimationFrame(this.raf);this.raf=0;this.observer?.disconnect();document.removeEventListener('visibilitychange',this.changed);this.motion?.removeEventListener('change',this.reduced);this.renderer?.destroy();this.renderer=null;this.last=null}
}
export const tagName='pocketworld-pottery-coarse-demonstration-e25aee39';
if(!customElements.get(tagName))customElements.define(tagName,PocketworldScene);
export function mount(container,{paused=false,opaque=false}={}){if(!container?.appendChild)throw Error('mount requires a DOM container');const element=document.createElement(tagName);if(paused)element.setAttribute('paused','');if(opaque)element.setAttribute('opaque','');container.appendChild(element);return element}

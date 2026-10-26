/**
 * <pocket-world src="examples/rain-bus-stop/build/manifest.json"></pocket-world>
 *
 * Pauses off screen. If the visitor prefers reduced motion, it holds t = 0.
 */
import { mount } from "./player.js";

class PocketWorld extends HTMLElement {
  constructor() {
    super();
    this._player = null;
    this._io = null;
  }

  connectedCallback() {
    this._ensureCanvas();
    this._load();
  }

  _ensureCanvas() {
    if (this.querySelector("canvas")) return;
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = "1 / 1";
    canvas.style.imageRendering = "pixelated";
    canvas.style.display = "block";
    canvas.style.background = "#fff";
    this.appendChild(canvas);
  }

  disconnectedCallback() {
    this._io?.disconnect();
    this._player?.destroy();
    this._player = null;
  }

  static get observedAttributes() {
    return ["src"];
  }

  attributeChangedCallback(name, prev, next) {
    // On upgrade this fires before connectedCallback, before the canvas exists.
    if (name === "src" && prev !== next && this.isConnected && this.querySelector("canvas")) this._load();
  }

  get player() {
    return this._player;
  }

  async _load() {
    const src = this.getAttribute("src");
    if (!src) return;
    this._io?.disconnect();
    this._player?.destroy();
    const canvas = this.querySelector("canvas");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = Number(this.getAttribute("scale")) || 4;
    this._player = await mount(canvas, src, {
      scale,
      autoplay: !reduced && !this.hasAttribute("paused"),
      time: reduced || this.hasAttribute("paused") ? 0 : null,
    });
    this._io = new IntersectionObserver((entries) => {
      const on = entries.some((e) => e.isIntersecting);
      if (!on) this._player?.pause();
      else if (!reduced && !this.hasAttribute("paused")) this._player?.play();
    });
    this._io.observe(this);
  }
}

if (!customElements.get("pocket-world")) customElements.define("pocket-world", PocketWorld);

export { PocketWorld };

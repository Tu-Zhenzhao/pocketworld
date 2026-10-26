/**
 * <pocket-world src="examples/rain-bus-stop/scene.js"></pocket-world>
 *
 * Pauses when it is off screen. If the visitor prefers reduced motion,
 * it holds the scene's poster frame until they press play on a player
 * you built around it — this element itself just stays still.
 */
import { mount } from "./player.js";

class PocketWorld extends HTMLElement {
  constructor() {
    super();
    this._player = null;
    this._io = null;
    this._resume = false;
  }

  connectedCallback() {
    if (!this.querySelector("canvas")) {
      const canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.aspectRatio = "1 / 1";
      canvas.style.imageRendering = "pixelated";
      canvas.style.display = "block";
      canvas.style.background = "#fff";
      this.appendChild(canvas);
    }
    this._load();
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
    if (name === "src" && prev !== next && this.isConnected) this._load();
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
    const url = new URL(src, document.baseURI);
    const mod = await import(url.href);
    const spec = mod.default;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const grid = Number(this.getAttribute("grid")) || spec.grid || 360;
    const bayer = Number(this.getAttribute("bayer")) || spec.bayer || 4;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = Math.round((rect.width || 480) * dpr);
      if (w < grid) w = grid;
      if (canvas.width !== w) {
        canvas.width = w;
        canvas.height = w;
        this._player?.draw();
      }
    };
    fit();
    this._player = mount(canvas, spec, {
      grid,
      bayer,
      autoplay: !reduced && !this.hasAttribute("paused"),
      respectReducedMotion: true,
    });
    this._player._fit = fit;
    if (!this._ro) {
      this._ro = new ResizeObserver(() => this._player?._fit?.());
      this._ro.observe(this);
    }
    this._io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      const player = this._player;
      if (!player) return;
      if (!visible) {
        this._resume = !player.paused;
        player.pause();
      } else if (this._resume) {
        player.play();
      }
    }, { threshold: 0.05 });
    this._io.observe(this);
  }
}

if (!customElements.get("pocket-world")) {
  customElements.define("pocket-world", PocketWorld);
}

export { PocketWorld };

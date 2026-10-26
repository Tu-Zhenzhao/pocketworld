/**
 * mount(canvas, manifestUrl) draws one prepared scene.
 * The manifest is build/manifest.json from `pocketworld prep`.
 * Textures stay at 1 cell per pixel inside the shader; `scale` is an integer
 * CSS-pixel multiplier (default 4) so the dither stays square.
 */
import { shaders, textureNames } from "./shaders.js";

function oklab(c) {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`could not load ${url}`));
    im.src = url;
  });
}

function flat(list, n) {
  const f = new Float32Array(n);
  const a = list.flat();
  for (let i = 0; i < a.length && i < n; i++) f[i] = a[i];
  return f;
}

async function resolveManifest(src) {
  if (typeof src === "string") {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`could not load ${src}`);
    const manifest = await res.json();
    const base = new URL(".", new URL(src, document.baseURI));
    return { manifest, base };
  }
  return { manifest: src, base: new URL(src.base || ".", document.baseURI) };
}

export async function mount(canvas, src, opts = {}) {
  if (!canvas) throw new Error("mount needs a canvas");
  const { manifest, base } = await resolveManifest(src);
  const profile = manifest.profile;
  if (!shaders[profile]) throw new Error(`unknown profile ${profile}`);
  const names = textureNames[profile];
  const scale = Math.max(1, Math.round(opts.scale ?? 4));
  const G = manifest.grid;
  canvas.width = canvas.height = G * scale;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false });
  if (!gl) throw new Error("WebGL2 is not available");

  function sh(type, source) {
    const x = gl.createShader(type);
    gl.shaderSource(x, source);
    gl.compileShader(x);
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(x) || "shader compile failed");
    }
    return x;
  }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, shaders.vert));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, shaders[profile]));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(pr) || "shader link failed");
  }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(pr, n);
  const pal = manifest.palette.map((p) => p.map((v) => v / 255));
  gl.uniform3fv(U("uPal"), flat(pal, 72));
  gl.uniform3fv(U("uLab"), flat(pal.map((p) => oklab(p)), 72));
  gl.uniform1i(U("uN"), manifest.palette.length);
  gl.uniform1f(U("G"), G);
  gl.uniform1f(U("uLoop"), manifest.loop);
  gl.uniform1f(U("uSpread"), manifest.spread);
  gl.uniform1f(U("uDither"), opts.dither === false ? 0 : 1);
  gl.uniform2f(U("uRes"), canvas.width, canvas.height);
  if (profile === "rain") {
    gl.uniform3fv(U("uDrip"), flat(manifest.drips, 36));
    gl.uniform1i(U("uND"), Math.min(12, manifest.drips.length));
    gl.uniform2fv(U("uRip"), flat(manifest.ripples, 80));
    gl.uniform2f(U("uPivot"), manifest.pivot[0], manifest.pivot[1]);
  } else {
    gl.uniform2fv(U("uMote"), flat(manifest.motes || [], 16));
    gl.uniform1i(U("uNM"), Math.min(8, (manifest.motes || []).length));
  }

  const images = await Promise.all(names.map((k) => loadImage(new URL(manifest.textures[k], base).href)));
  images.forEach((im, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const uniform = "u" + names[i][0].toUpperCase() + names[i].slice(1);
    gl.uniform1i(U(uniform), i);
  });

  let raf = 0;
  let playing = false;
  let fixed = opts.time == null ? null : +opts.time;
  const t0 = performance.now();

  function draw(sec) {
    const loop = manifest.loop;
    const t = ((sec % loop) + loop) % loop;
    gl.useProgram(pr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U("uT"), t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    raf = 0;
    if (!playing) return;
    draw(fixed == null ? (now - t0) / 1000 : fixed);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing) return;
    playing = true;
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const player = {
    manifest,
    profile,
    ready: true,
    play,
    pause,
    draw,
    setTime(t) {
      fixed = t;
      draw(t);
      gl.finish();
      return true;
    },
    grab(t) {
      draw(t);
      const px = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = "";
      for (let i = 0; i < px.length; i += 32768) {
        s += String.fromCharCode.apply(null, px.subarray(i, i + 32768));
      }
      return btoa(s);
    },
    info() {
      return { grid: G, loop: manifest.loop, w: canvas.width, h: canvas.height, profile };
    },
    destroy() {
      pause();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
  draw(fixed ?? 0);
  if (opts.autoplay !== false && fixed == null) play();
  return player;
}

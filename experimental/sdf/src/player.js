/**
 * WebGL2 player. The canvas bitmap is the output resolution; the shader
 * snaps to `grid`, so the upscale is nearest-neighbor by construction.
 * Time is stepped at `fps` and wrapped to the loop. setTime(t) is exact.
 */
import { compile } from "./compile.js";

function compileGL(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader compile failed";
    const err = new Error(log);
    err.log = log;
    err.source = source;
    gl.deleteShader(shader);
    throw err;
  }
  return shader;
}

export function mount(canvas, spec, opts = {}) {
  const compiled = compile(spec);
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL2 is not available");

  const vs = compileGL(gl, gl.VERTEX_SHADER, compiled.vert);
  let fs;
  try {
    fs = compileGL(gl, gl.FRAGMENT_SHADER, compiled.frag);
  } catch (err) {
    err.message = `Fragment shader failed to compile\n${err.log || err.message}`;
    throw err;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "program link failed");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uni = {
    res: gl.getUniformLocation(program, "uRes"),
    grid: gl.getUniformLocation(program, "uGrid"),
    time: gl.getUniformLocation(program, "uTime"),
    duration: gl.getUniformLocation(program, "uDuration"),
    bayer: gl.getUniformLocation(program, "uBayer"),
    origin: gl.getUniformLocation(program, "uOrigin"),
    axisX: gl.getUniformLocation(program, "uAxisX"),
    axisY: gl.getUniformLocation(program, "uAxisY"),
    bg: gl.getUniformLocation(program, "uBg"),
  };
  const paramLoc = {};
  const values = {};
  for (const p of compiled.params) {
    paramLoc[p.key] = gl.getUniformLocation(program, `u_${p.key}`);
    values[p.key] = p.value;
  }

  const camera = spec.camera;
  const bg = hex(spec.background || "#ffffff");
  const state = {
    grid: opts.grid || spec.grid || 360,
    bayer: opts.bayer || spec.bayer || 4,
    fps: opts.fps || spec.fps || 12,
    duration: spec.duration || 10,
    time: 0,
    paused: true,
    raf: 0,
  };

  function quantize(t) {
    const d = state.duration;
    let x = t % d;
    if (x < 0) x += d;
    return Math.floor(x * state.fps + 1e-4) / state.fps;
  }

  function draw() {
    const w = canvas.width || state.grid;
    const h = canvas.height || state.grid;
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.uniform2f(uni.res, w, h);
    gl.uniform1f(uni.grid, state.grid);
    gl.uniform1f(uni.time, state.time);
    gl.uniform1f(uni.duration, state.duration);
    gl.uniform1f(uni.bayer, state.bayer);
    gl.uniform2f(uni.origin, camera.origin[0], camera.origin[1]);
    gl.uniform2f(uni.axisX, camera.axisX[0], camera.axisX[1]);
    gl.uniform2f(uni.axisY, camera.axisY[0], camera.axisY[1]);
    gl.uniform3f(uni.bg, bg[0], bg[1], bg[2]);
    for (const p of compiled.params) {
      if (paramLoc[p.key]) gl.uniform1f(paramLoc[p.key], values[p.key]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  }

  let start = 0;
  let origin = 0;
  function loop(now) {
    state.raf = requestAnimationFrame(loop);
    if (state.paused) return;
    state.time = quantize(origin + (now - start) / 1000);
    draw();
  }

  function play() {
    if (!state.paused) return;
    state.paused = false;
    start = performance.now();
    origin = state.time;
    if (!state.raf) state.raf = requestAnimationFrame(loop);
  }
  function pause() {
    state.paused = true;
  }

  const reduced = opts.respectReducedMotion !== false && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.time = quantize(opts.time ?? (reduced ? spec.poster || 0 : 0));
  if (opts.size) {
    canvas.width = opts.size;
    canvas.height = opts.size;
  }
  draw();
  if (opts.autoplay !== false && !reduced) play();

  return {
    spec,
    params: compiled.params,
    gl,
    get time() { return state.time; },
    get paused() { return state.paused; },
    get grid() { return state.grid; },
    get bayer() { return state.bayer; },
    draw,
    play,
    pause,
    setTime(t) {
      state.time = quantize(t);
      origin = state.time;
      start = performance.now();
      draw();
    },
    setParam(key, value) {
      if (!(key in values)) throw new Error(`No param "${key}"`);
      values[key] = Number(value);
      draw();
    },
    getParam(key) { return values[key]; },
    setGrid(grid) { state.grid = grid; draw(); },
    setBayer(bayer) { state.bayer = bayer; draw(); },
    resize(size) {
      if (size) {
        canvas.width = size;
        canvas.height = size;
      }
      draw();
    },
    destroy() {
      state.paused = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    },
  };
}

function hex(h) {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

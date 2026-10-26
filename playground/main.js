import { mount } from "/src/player.js";

const canvas = document.getElementById("c");
const sceneSelect = document.getElementById("scene");
const knobs = document.getElementById("knobs");
const status = document.getElementById("status");
const playBtn = document.getElementById("play");
const scrub = document.getElementById("scrub");
const clock = document.getElementById("clock");
const gridInput = document.getElementById("grid");
const bayerInput = document.getElementById("bayer");

let player = null;
let spec = null;
let scrubbing = false;

function showClock() {
  if (!player) return;
  clock.textContent = player.time.toFixed(2);
  if (!scrubbing) scrub.value = String(player.time);
  playBtn.textContent = player.paused ? "Play" : "Pause";
}

async function listScenes() {
  const res = await fetch("/api/scenes");
  if (!res.ok) throw new Error("Could not list scenes");
  return res.json();
}

function addKnob(p) {
  const label = document.createElement("label");
  label.className = "row";
  const name = document.createElement("b");
  name.textContent = p.label || p.key;
  const value = document.createElement("em");
  value.textContent = format(p.value, p.step);
  const input = document.createElement("input");
  input.type = "range";
  input.min = p.min;
  input.max = p.max;
  input.step = p.step;
  input.value = p.value;
  input.addEventListener("input", () => {
    const n = Number(input.value);
    value.textContent = format(n, p.step);
    player.setParam(p.key, n);
  });
  label.append(name, value, input);
  if (p.doc) {
    const doc = document.createElement("small");
    doc.textContent = p.doc;
    label.append(doc);
  }
  return label;
}

function format(n, step) {
  const s = String(step ?? 0.01);
  const places = s.includes(".") ? s.split(".")[1].length : 0;
  return Number(n).toFixed(places);
}

function buildKnobs() {
  knobs.replaceChildren();
  const groups = [
    ["scene", "Scene"],
    ["craft", "Light and craft"],
  ];
  for (const [group, title] of groups) {
    const items = player.params.filter((p) => (p.group || "scene") === group);
    if (!items.length) continue;
    const h = document.createElement("h2");
    h.textContent = title;
    knobs.append(h);
    for (const p of items) knobs.append(addKnob(p));
  }
}

async function openScene(src) {
  status.textContent = "";
  player?.destroy();
  player = null;
  const mod = await import(src + `?t=${Date.now()}`);
  spec = mod.default;
  canvas.width = canvas.height = 720;
  gridInput.value = spec.grid || 360;
  bayerInput.value = String(spec.bayer || 4);
  scrub.max = String(spec.duration);
  scrub.step = String(1 / (spec.fps || 12));
  player = mount(canvas, spec, {
    size: 720,
    autoplay: true,
    respectReducedMotion: true,
  });
  buildKnobs();
  showClock();
  if (!player.paused) requestAnimationFrame(tick);
}

function tick() {
  if (!player || player.paused) return;
  showClock();
  requestAnimationFrame(tick);
}

playBtn.addEventListener("click", () => {
  if (!player) return;
  if (player.paused) {
    player.play();
    requestAnimationFrame(tick);
  } else player.pause();
  showClock();
});

scrub.addEventListener("pointerdown", () => { scrubbing = true; });
scrub.addEventListener("pointerup", () => { scrubbing = false; });
scrub.addEventListener("input", () => {
  if (!player) return;
  player.setTime(Number(scrub.value));
  showClock();
});

gridInput.addEventListener("change", () => {
  const n = Number(gridInput.value);
  if (player && n >= 40) player.setGrid(n);
});
bayerInput.addEventListener("change", () => {
  if (player) player.setBayer(Number(bayerInput.value));
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.matches("input, select")) return;
  e.preventDefault();
  playBtn.click();
});

const scenes = await listScenes();
const wanted = new URLSearchParams(location.search).get("scene");
for (const s of scenes) {
  const opt = document.createElement("option");
  opt.value = s.src;
  opt.textContent = s.name;
  if (s.id === wanted || s.src.endsWith(`/${wanted}/scene.js`)) opt.selected = true;
  sceneSelect.append(opt);
}
sceneSelect.addEventListener("change", () => openScene(sceneSelect.value));

try {
  await openScene(sceneSelect.value || scenes[0]?.src);
} catch (err) {
  status.textContent = String(err && (err.stack || err.message) || err);
}

const events = new EventSource("/events");
events.onmessage = (ev) => {
  if (ev.data === "reload") location.reload();
};

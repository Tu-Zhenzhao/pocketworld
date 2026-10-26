/**
 * Turn a scene descriptor into one fragment shader.
 * Generated code calls the library in src/glsl.js. Read a scene file first;
 * this emitter is the machinery underneath it.
 */
import { LIB } from "./glsl.js";
import { glslVec, normalizeRamp } from "./color.js";

export const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const RESERVED = new Set(["time", "grid", "bayer", "res", "duration", "origin", "bg"]);

function num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error(`Expected a number, got ${n}`);
  return v.toFixed(4);
}
function ident(s) {
  const v = String(s || "p").replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(v) ? v : `p_${v}`;
}
function useRamp(spec, name) {
  if (name == null) throw new Error("Missing ramp");
  if (Array.isArray(name)) return normalizeRamp(name);
  if (typeof name === "string" && name.startsWith("#")) return normalizeRamp([name, name, name]);
  const r = spec.ramps?.[name];
  if (!r) throw new Error(`Unknown ramp "${name}". Add it to scene.ramps.`);
  return normalizeRamp(r);
}
function V(ramp, i) {
  return glslVec(ramp[Math.min(i, ramp.length - 1)]);
}
function rampCall(ramp, shade, th = "th") {
  if (ramp.length >= 4) {
    return `ramp4(${V(ramp, 0)}, ${V(ramp, 1)}, ${V(ramp, 2)}, ${V(ramp, 3)}, ${shade}, ${th})`;
  }
  return `ramp3(${V(ramp, 0)}, ${V(ramp, 1)}, ${V(ramp, 2)}, ${shade}, ${th})`;
}
function ampExpr(amp, where) {
  if (typeof amp === "number") return num(amp);
  if (typeof amp === "string") return `u_${amp}`;
  throw new Error(`${where}: amp must be a number or a param name`);
}
function baseExpr(v, where) {
  if (typeof v === "number") return num(v);
  if (typeof v === "string") return `(${v})`;
  throw new Error(`${where}: pose angle must be a number (degrees) or a GLSL expression string`);
}
function easeCall(name) {
  if (name === "in") return "easeIn";
  if (name === "out") return "easeOut";
  if (name === "bump" || name === "sine") return "easeBump";
  if (name === "linear") return "";
  return "easeSmooth";
}
function emitKeys(fn, keys) {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  if (sorted.length < 2) throw new Error(`${fn} needs at least two keys`);
  let s = `float ${fn}(float t) {\n  t = mod(t, uDuration);\n`;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const span = Math.max(0.0001, b.t - a.t);
    const ease = easeCall(b.ease || "smooth");
    const u = ease ? `${ease}(u)` : "u";
    s += `  if (t < ${num(b.t)}) { float u = clamp((t - ${num(a.t)}) / ${num(span)}, 0.0, 1.0); return mix(${num(a.v)}, ${num(b.v)}, ${u}); }\n`;
  }
  s += `  return ${num(sorted[sorted.length - 1].v)};\n}\n`;
  return s;
}
function motionAdd(motions, bone) {
  let e = "";
  for (const m of motions || []) {
    const cycles = m.cycles ?? 2;
    const phase = m.phase ?? 0;
    const wave = `sin(uTime * 6.2831853 * ${num(cycles)} / uDuration + ${num(phase)})`;
    if (m.type === "breathe" && (bone === "torso" || bone === "head")) {
      e += ` + ${wave} * ${ampExpr(m.amp ?? "breath", "breathe")} * ${bone === "head" ? "0.35" : "1.0"}`;
    }
    if (m.type === "sway" && (bone === "torso" || bone === "head")) {
      e += ` + ${wave} * ${ampExpr(m.amp ?? 2, "sway")}`;
    }
    if ((m.type === "swing" || m.type === "dangle") && m.bone === bone) {
      e += ` + ${wave} * ${ampExpr(m.amp ?? 10, m.type)}`;
    }
    if (m.type === "walk") {
      const a = ampExpr(m.amp ?? 16, "walk");
      const w = `uTime * 6.2831853 * ${num(cycles)} / uDuration`;
      if (bone === "legF.u") e += ` + sin(${w}) * ${a}`;
      if (bone === "legB.u") e += ` + sin(${w} + 3.14159) * ${a}`;
      if (bone === "legF.l") e += ` + max(0.0, -sin(${w})) * ${a} * 0.55`;
      if (bone === "legB.l") e += ` + max(0.0, sin(${w})) * ${a} * 0.55`;
      if (bone === "armF.u") e += ` + sin(${w} + 3.14159) * ${a} * 0.65`;
      if (bone === "armB.u") e += ` + sin(${w}) * ${a} * 0.65`;
      if (bone === "torso") e += ` + sin(${w} * 2.0) * ${a} * 0.08`;
    }
    if (m.type === "dribble" && bone === "armF.u") {
      e += ` + abs(sin(uTime * 6.2831853 * ${num(cycles)} / uDuration)) * -${ampExpr(m.amp ?? 24, "dribble")}`;
    }
    if (m.type === "cast" && (bone === "armF.u" || bone === "armF.l")) {
      const a0 = m.from ?? 0;
      const b0 = m.to ?? 1.4;
      const mul = bone === "armF.l" ? 0.55 : 1;
      e += ` + ((uTime > ${num(a0)} && uTime < ${num(b0)}) ? sin((uTime - ${num(a0)}) / ${num(Math.max(0.001, b0 - a0))} * 3.14159) : 0.0) * -${ampExpr(m.amp ?? 34, "cast")} * ${num(mul)}`;
    }
  }
  return e;
}
function boneExpr(id, bone, base, motions, prelude) {
  const keys = (motions || []).filter((m) => m.type === "keys" && m.bone === bone);
  let e;
  if (keys.length) {
    const fn = `${id}_k_${bone.replace(".", "_")}`;
    prelude.push(emitKeys(fn, keys[0].keys || []));
    e = `${fn}(uTime)`;
  } else {
    e = baseExpr(base ?? 0, `${id}.${bone}`);
  }
  return `(${e}${motionAdd(motions, bone)})`;
}

function craft(key, value, min, max, step, label, doc) {
  return { key, value, min, max, step, label, doc, group: "craft" };
}

function mergeParams(spec) {
  const light = spec.light || {};
  const map = new Map();
  const builtins = [
    craft("ambient", light.ambient ?? 0.42, 0, 1, 0.01, "Ambient", "Lighting floor. Raise it for an overcast day; lower it when a limb should have a real dark side."),
    craft("diffuse", light.diffuse ?? 0.55, 0, 1, 0.01, "Diffuse", "How far the lit side climbs above ambient. This is the volume knob."),
    craft("lightX", light.dir?.[0] ?? -0.42, -1.5, 1.5, 0.01, "Light X", "Screen-space light. Negative comes from the left."),
    craft("lightY", light.dir?.[1] ?? -0.88, -1.5, 1.5, 0.01, "Light Y", "Screen-space light. Negative Y comes from above, because Y grows downward."),
    craft("shimmer", 0.45, 0, 2, 0.01, "Shimmer", "Horizontal wobble of reflections. Zero is a still mirror."),
    craft("breath", 0.4, 0, 12, 0.05, "Breath", "Degrees of torso rise. Under 1 is barely alive. 0 is a statue."),
    craft("reflection", 0.75, 0, 1.25, 0.01, "Reflections", "How solid reflections are. Lower values let the Bayer pattern break them up."),
    craft("drips", 1, 0, 1, 0.01, "Drips", "Roof and umbrella drips. 0 hides them."),
  ];
  for (const p of builtins) map.set(p.key, p);
  for (const [key, val] of Object.entries(spec.params || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Bad param name "${key}"`);
    if (RESERVED.has(key)) throw new Error(`Param name "${key}" is reserved`);
    const extra = typeof val === "number" ? { value: val } : { ...val };
    if (extra.value == null || typeof extra.value !== "number") throw new Error(`Param "${key}" needs a numeric value`);
    const prev = map.get(key);
    map.set(key, {
      min: 0,
      max: 1,
      step: 0.01,
      label: key,
      doc: "",
      group: prev ? "craft" : "scene",
      ...prev,
      ...extra,
      key,
    });
  }
  return [...map.values()];
}

function limbTests(id, a, b, r, ramp) {
  return `
  d = hitCapsule(p, ${a}, ${b}, ${r}, n, h);
  if (d >= 0.0) return ${rampCall(ramp, "(shadeForm(n) * lit) * jointAO(h)")};
  d = hitDisc(p, ${b}, ${r} * 1.15, n);
  if (d >= 0.0) return ${rampCall(ramp, "shadeForm(n) * lit")};`;
}

function emitPerson(part, ctx) {
  const { spec } = ctx;
  const id = ident(part.name || "figure");
  if (ctx.ids.has(id)) throw new Error(`Duplicate part name "${part.name}"`);
  ctx.ids.add(id);
  const colors = part.colors || {};
  const pick = (key, fallback) => useRamp(spec, colors[key] || fallback);
  const skin = pick("skin", "skin");
  const hair = pick("hair", "hair");
  const torso = useRamp(spec, colors.torso || colors.jacket || "jacket");
  const arm = useRamp(spec, colors.arm || colors.torso || colors.jacket || "jacket");
  const thigh = useRamp(spec, colors.thigh || colors.pants || "pants");
  const calf = useRamp(spec, colors.calf || colors.pants || colors.thigh || "pants");
  const shoe = useRamp(spec, colors.shoe || colors.shoes || "ink");
  const hand = useRamp(spec, colors.hand || (part.hands === "gloves" ? (colors.torso || colors.jacket || "jacket") : (colors.skin || "skin")));
  const ink = useRamp(spec, colors.ink || "ink");
  const coat = part.coat ? useRamp(spec, part.coat.ramp || part.coat.color || colors.torso || "jacket") : null;
  const hat = part.hat ? useRamp(spec, part.hat.ramp || part.hat.color || "ink") : null;

  const pose = part.pose || {};
  const motions = part.motions || [];
  const sc = part.scale ?? 0.15;
  const facing = part.facing ?? 1;
  const at = part.at || [0, 0];
  const rise = part.plant === "seat" ? (part.seatRise ?? 0.046) : (part.rise ?? 0.49 * sc);
  const armF = pose.armF || [-80, -92];
  const armB = pose.armB || [-100, -108];
  const legF = pose.legF || [-88, -90];
  const legB = pose.legB || [-92, -90];
  const gaze = part.gaze || {};
  const gx = typeof gaze.x === "string" ? `u_${gaze.x}` : num(gaze.x || 0);
  const gy = typeof gaze.y === "string" ? `u_${gaze.y}` : num(gaze.y || 0);
  const hairCover = part.hairCover ?? 0.5;
  const coatLen = part.coat?.length ?? 0.5;
  const flare = part.coat?.flare ?? 1.35;
  const shoulderMul = part.coat?.shoulder ?? 1;
  const showCalves = !coat || part.coat.calves !== false;
  const showThighs = !coat;

  const P = { torso: 0.3, neck: 0.05, head: 0.11, armU: 0.2, armL: 0.17, legU: 0.23, legL: 0.21, shoulder: 0.08, hipW: 0.04, rArm: 0.028, rThigh: 0.046, rCalf: 0.032, rHand: 0.022, rTorso: 0.074 };

  ctx.prelude.push(`
vec2 ${id}_hip, ${id}_head, ${id}_handF, ${id}_handB, ${id}_footF, ${id}_footB;
vec2 ${id}_shF, ${id}_shB, ${id}_elF, ${id}_elB, ${id}_knF, ${id}_knB, ${id}_hipF, ${id}_hipB;
float ${id}_sc, ${id}_z, ${id}_headR, ${id}_rArm, ${id}_rThigh, ${id}_rCalf, ${id}_rHand, ${id}_eyeR;
vec2 ${id}_coatTop, ${id}_coatBot;
float ${id}_rCoat0, ${id}_rCoat1;

void pose_${id}() {
  ${id}_sc = ${num(sc)};
  float face = ${num(facing)};
  ${id}_z = 20.55 + ${num(at[0] + at[1])};
  ${id}_hip = toScreen(vec2(${num(at[0])}, ${num(at[1])}), ${num(rise)});
  float br = sin(uTime * 6.2831853 * 2.0 / uDuration);
  ${id}_hip.y -= br * u_breath * ${id}_sc * 0.0035;
  float torsoA = faceAngle(${boneExpr(id, "torso", pose.torso ?? 88, motions, ctx.prelude)}, face);
  float headA = faceAngle(${boneExpr(id, "head", pose.head ?? 86, motions, ctx.prelude)}, face);
  vec2 nk = ${id}_hip + dir(torsoA, ${id}_sc * ${num(P.torso)});
  ${id}_head = nk + dir(headA, ${id}_sc * ${num(P.head * 0.72)});
  ${id}_headR = ${id}_sc * ${num(P.head)};
  vec2 side = dir(torsoA - 90.0 * face, 1.0);
  vec2 sh = mix(${id}_hip, nk, 0.8);
  ${id}_shF = sh + side * (${id}_sc * ${num(P.shoulder)});
  ${id}_shB = sh - side * (${id}_sc * ${num(P.shoulder)});
  float aFu = faceAngle(${boneExpr(id, "armF.u", armF[0], motions, ctx.prelude)}, face);
  float aFl = faceAngle(${boneExpr(id, "armF.l", armF[1], motions, ctx.prelude)}, face);
  float aBu = faceAngle(${boneExpr(id, "armB.u", armB[0], motions, ctx.prelude)}, face);
  float aBl = faceAngle(${boneExpr(id, "armB.l", armB[1], motions, ctx.prelude)}, face);
  ${id}_elF = ${id}_shF + dir(aFu, ${id}_sc * ${num(P.armU)});
  ${id}_handF = ${id}_elF + dir(aFl, ${id}_sc * ${num(P.armL)});
  ${id}_elB = ${id}_shB + dir(aBu, ${id}_sc * ${num(P.armU)});
  ${id}_handB = ${id}_elB + dir(aBl, ${id}_sc * ${num(P.armL)});
  ${id}_hipF = ${id}_hip + side * (${id}_sc * ${num(P.hipW)});
  ${id}_hipB = ${id}_hip - side * (${id}_sc * ${num(P.hipW)});
  float lFu = faceAngle(${boneExpr(id, "legF.u", legF[0], motions, ctx.prelude)}, face);
  float lFl = faceAngle(${boneExpr(id, "legF.l", legF[1], motions, ctx.prelude)}, face);
  float lBu = faceAngle(${boneExpr(id, "legB.u", legB[0], motions, ctx.prelude)}, face);
  float lBl = faceAngle(${boneExpr(id, "legB.l", legB[1], motions, ctx.prelude)}, face);
  ${id}_knF = ${id}_hipF + dir(lFu, ${id}_sc * ${num(P.legU)});
  ${id}_footF = ${id}_knF + dir(lFl, ${id}_sc * ${num(P.legL)});
  ${id}_knB = ${id}_hipB + dir(lBu, ${id}_sc * ${num(P.legU)});
  ${id}_footB = ${id}_knB + dir(lBl, ${id}_sc * ${num(P.legL)});
  ${id}_rArm = ${id}_sc * ${num(P.rArm)};
  ${id}_rThigh = ${id}_sc * ${num(P.rThigh)};
  ${id}_rCalf = ${id}_sc * ${num(P.rCalf)};
  ${id}_rHand = ${id}_sc * ${num(P.rHand)};
  ${id}_eyeR = max(0.55 / uGrid, ${id}_headR * 0.11);
  vec2 gaze = vec2(${gx}, ${gy}) * ${id}_headR * 0.4;
  ${id}_head += vec2(gaze.x * 0.35, gaze.y * 0.85);
  ${id}_coatTop = sh;
  ${id}_coatBot = ${id}_hip + vec2(0.0, ${id}_sc * ${num(coatLen)});
  ${id}_rCoat0 = ${id}_sc * ${num(P.rTorso * shoulderMul)};
  ${id}_rCoat1 = ${id}_rCoat0 * ${num(flare)};
}

vec3 sample_${id}_lit(vec2 p, float th, float lit);
vec3 sample_${id}(vec2 p, float th) { return sample_${id}_lit(p, th, 1.0); }
vec3 sample_${id}_lit(vec2 p, float th, float lit) {
  vec2 n; float h; float d;
  vec2 gaze = vec2(${gx}, ${gy}) * ${id}_headR * 0.45;
  vec2 eyeA = ${id}_head + vec2(-${id}_headR * 0.28, ${id}_headR * 0.18) + gaze;
  vec2 eyeB = ${id}_head + vec2(${id}_headR * 0.26, ${id}_headR * 0.14) + gaze;
  if (length(p - eyeA) < ${id}_eyeR || length(p - eyeB) < ${id}_eyeR) return ${V(ink, 0)};
  ${hat ? (part.hat.type === "hood" ? hoodTests(id, hat) : hatTests(id, hat)) : ""}
  if (length(p - ${id}_head) < ${id}_headR) {
    float cut = ${id}_head.y - ${id}_headR + 2.0 * ${id}_headR * ${num(hairCover)};
    vec2 hn = (p - ${id}_head) / ${id}_headR;
    if (p.y < cut) return ${rampCall(hair, "mix(0.35, 0.85, shadeForm(hn)) * lit")};
    return ${rampCall(skin, "shadeForm(hn) * lit")};
  }
  d = hitDisc(p, ${id}_handF, ${id}_rHand, n);
  if (d >= 0.0) return ${rampCall(hand, "shadeForm(n) * lit")};
  ${limbTests(id, `${id}_shF`, `${id}_elF`, `${id}_rArm`, arm)}
  ${limbTests(id, `${id}_elF`, `${id}_handF`, `${id}_rArm * 0.86`, arm)}
  ${shoeTest(id, "F", shoe, !!part.boots)}
  ${showCalves ? limbTests(id, `${id}_knF`, `${id}_footF`, `${id}_rCalf`, calf) : ""}
  ${showThighs ? limbTests(id, `${id}_hipF`, `${id}_knF`, `${id}_rThigh`, thigh) : ""}
  ${coat ? `
  d = hitTaper(p, ${id}_coatTop, ${id}_coatBot, ${id}_rCoat0, ${id}_rCoat1, n, h);
  if (d >= 0.0) return ${rampCall(coat, "(shadeForm(n) * lit) * mix(1.0, 0.42, smoothstep(0.78, 0.97, h))")};` : `
  d = hitTaper(p, mix(${id}_hip, ${id}_coatTop, 0.35), ${id}_coatTop, ${id}_sc * ${num(P.rTorso)}, ${id}_sc * ${num(P.rTorso * 0.72)}, n, h);
  if (d >= 0.0) return ${rampCall(torso, "(shadeForm(n) * lit) * jointAO(h)")};`}
  d = hitDisc(p, ${id}_handB, ${id}_rHand * 0.9, n);
  if (d >= 0.0) return ${rampCall(hand, "shadeForm(n) * lit")};
  ${limbTests(id, `${id}_shB`, `${id}_elB`, `${id}_rArm * 0.92`, arm)}
  ${limbTests(id, `${id}_elB`, `${id}_handB`, `${id}_rArm * 0.8`, arm)}
  ${shoeTest(id, "B", shoe, !!part.boots)}
  ${showCalves ? limbTests(id, `${id}_knB`, `${id}_footB`, `${id}_rCalf * 0.92`, calf) : ""}
  ${showThighs ? limbTests(id, `${id}_hipB`, `${id}_knB`, `${id}_rThigh * 0.92`, thigh) : ""}
  return vec3(-1.0);
}
`);

  ctx.posePeople.push(`pose_${id}();`);
  ctx.solid.push(`{ vec3 c = sample_${id}(pix.p, pix.th); if (c.x >= 0.0) cover(pix, ${id}_z, c); }`);
  ctx.groundAdjust.push(`
    shade -= (1.0 - smoothstep(0.2, 1.0, length((pix.p - ${id}_footF) / vec2(${num(sc * 0.18)}, ${num(sc * 0.06)})))) * 0.18;
    shade -= (1.0 - smoothstep(0.2, 1.0, length((pix.p - ${id}_footB) / vec2(${num(sc * 0.16)}, ${num(sc * 0.055)})))) * 0.14;`);
  ctx.reflect.push(`
    if (pix.mat == 2) {
      vec2 foot = ${id}_footF.y > ${id}_footB.y ? ${id}_footF : ${id}_footB;
      vec2 rp = reflectPoint(pix.p, foot, 0.78);
      if (rp.x > -5.0) {
        vec3 rc = sample_${id}_lit(rp, pix.th, 0.4);
        float rip = sin(pix.p.y * 92.0 + pix.p.x * 16.0 + uTime / uDuration * 6.2831853 * 3.0);
        float hole = hash21(pix.cell);
        if (rc.x >= 0.0 && rip < 0.62 && hole < 0.82 && u_reflection > pix.th) pix.rgb = rc;
      }
    }`);
  ctx.people.push(id);
}

function hatTests(id, hat) {
  return `
  {
    vec2 crown = ${id}_head + vec2(0.0, -${id}_headR * 0.62);
    if (length(p - crown) < ${id}_headR * 0.92) {
      vec2 hn = (p - crown) / (${id}_headR * 0.92);
      return ${rampCall(hat, "shadeForm(hn) * lit")};
    }
    vec2 bp = p - (${id}_head + vec2(0.0, -${id}_headR * 0.08));
    if (length(bp / vec2(${id}_headR * 1.55, ${id}_headR * 0.42)) < 1.0 && bp.y > -${id}_headR * 0.08) {
      return ${V(hat, 1)};
    }
  }`;
}
function hoodTests(id, hat) {
  return `
  {
    vec2 hp = p - ${id}_head;
    float hood = length(hp / vec2(${id}_headR * 1.34, ${id}_headR * 1.28));
    vec2 cp = p - (${id}_head + vec2(0.0, ${id}_headR * 0.9));
    float cowl = length(cp / vec2(${id}_headR * 1.2, ${id}_headR * 0.62));
    bool opening = hp.y > -${id}_headR * 0.02 && abs(hp.x) < ${id}_headR * 0.78 && hp.y < ${id}_headR * 1.05;
    if (!opening && hood < 1.0) {
      return ${rampCall(hat, `shadeForm(hp / (${id}_headR * 1.3)) * lit * 0.92`)};
    }
    if (!opening && cowl < 1.0 && cp.y > -${id}_headR * 0.15) {
      return ${rampCall(hat, "0.28 * lit")};
    }
  }`;
}
function shoeTest(id, side, shoe, boot) {
  const foot = `${id}_foot${side}`;
  const knee = `${id}_kn${side}`;
  const reach = boot ? 0.085 : 0.05;
  const rad = boot ? 0.036 : 0.022;
  return `
  {
    vec2 shin = ${foot} - ${knee};
    float sl = length(shin);
    vec2 toe = ${foot} + (sl > 1e-5 ? shin / sl : vec2(0.0, 1.0)) * ${id}_sc * ${num(reach)};
    d = hitCapsule(p, ${foot}, toe, ${id}_sc * ${num(rad)}, n, h);
    if (d >= 0.0) return ${rampCall(shoe, "shadeForm(n) * lit")};
  }`;
}

function emitUmbrella(part, ctx) {
  const id = ident(part.name || "umbrella");
  const hand = part.hand || "";
  const bits = hand.split(".");
  if (bits.length !== 2) throw new Error(`umbrella "${part.name || ""}" needs hand: "someone.handF"`);
  const joint = `${ident(bits[0])}_${bits[1]}`;
  const who = ident(bits[0]);
  const ramp = useRamp(ctx.spec, part.ramp || part.color || "rose");
  const ink = useRamp(ctx.spec, part.shaft || "ink");
  const rx = part.rx ?? part.radius ?? 0.048;
  const ry = part.ry ?? rx * 0.58;
  const tilt = part.tilt ?? -0.2;
  const sway = part.sway == null ? "0.0" : typeof part.sway === "string" ? `u_${part.sway} * sin(uTime * 6.2831853 * 2.0 / uDuration)` : num(part.sway);
  const over = part.over ? `${ident(part.over)}_head` : joint;
  ctx.prelude.push(`
vec2 ${id}_canopy;
void pose_${id}() {
  float tilt = ${num(tilt)} + (${sway});
  ${id}_canopy = ${over} + vec2(sin(tilt) * ${num(rx * 0.15)}, -${num(ry * 1.2)});
}
vec3 sample_${id}_lit(vec2 p, float th, float lit);
vec3 sample_${id}(vec2 p, float th) { return sample_${id}_lit(p, th, 1.0); }
vec3 sample_${id}_lit(vec2 p, float th, float lit) {
  float tilt = ${num(tilt)} + (${sway});
  float ca = cos(tilt), sa = sin(tilt);
  vec2 dlt = p - ${id}_canopy;
  dlt = vec2(ca * dlt.x + sa * dlt.y, -sa * dlt.x + ca * dlt.y);
  vec2 rad = vec2(${num(rx)}, ${num(ry)});
  float e = length(dlt / rad);
  if (e <= 1.02) {
    vec2 n2 = dlt / rad;
    float dome = sqrt(max(0.0, 1.0 - dot(n2, n2)));
    float shade = shadeForm(vec2(n2.x, n2.y - 0.45 * dome)) * lit;
    shade *= mix(1.0, 0.72, dome);
    float ang = atan(dlt.y, dlt.x);
    float rib = abs(fract(ang * ${num(6 / (Math.PI * 2))} + 0.5) - 0.5);
    if (rib < 0.04 && e > 0.18 && e < 0.92) shade *= 0.42;
    if (e > 0.84) shade *= 0.32;
    vec2 n; float h;
    if (e < 0.12 && hitDisc(p, ${id}_canopy, ${num(Math.max(rx, ry) * 0.08)}, n) >= 0.0) {
      return ${V(ink, 0)};
    }
    return ${rampCall(ramp, "shade")};
  }
  vec2 n; float h;
  if (hitCapsule(p, ${joint}, ${id}_canopy, 1.15 / uGrid, n, h) >= 0.0) return ${V(ink, 0)};
  return vec3(-1.0);
}
`);
  ctx.poseProps.push(`pose_${id}();`);
  ctx.solid.push(`{ vec3 c = sample_${id}(pix.p, pix.th); if (c.x >= 0.0) cover(pix, 42.0, c); }`);
  ctx.reflect.push(`
    if (pix.mat == 2) {
      vec2 foot = ${who}_footF.y > ${who}_footB.y ? ${who}_footF : ${who}_footB;
      vec2 rp = reflectPoint(pix.p, foot, 0.82);
      if (rp.x > -5.0) {
        vec3 rc = sample_${id}_lit(rp, pix.th, 0.42);
        float rip = sin(pix.p.y * 92.0 + pix.p.x * 16.0 + uTime / uDuration * 6.2831853 * 3.0);
        if (rc.x >= 0.0 && rip < 0.62 && hash21(pix.cell) < 0.82 && u_reflection > pix.th) pix.rgb = rc;
      }
    }`);
  if (part.drips !== false) {
    ctx.overlay.push(`
      drip(pix, ${id}_canopy + vec2(${num(-rx * 0.62)}, ${num(ry * 0.35)}), 0.15, 2.5);
      drip(pix, ${id}_canopy + vec2(${num(rx * 0.05)}, ${num(ry * 0.72)}), 1.05, 2.5);
      drip(pix, ${id}_canopy + vec2(${num(rx * 0.7)}, ${num(ry * 0.22)}), 1.8, 2.5);`);
  }
}

function emitShelter(part, ctx) {
  const at = part.at || [0.4, 0.2];
  const w = part.w ?? 0.4;
  const d = part.d ?? 0.28;
  const rise = part.rise ?? 0.16;
  const over = part.overhang ?? 0.04;
  const roof = useRamp(ctx.spec, part.roof || "roof");
  const iron = useRamp(ctx.spec, part.iron || part.post || "iron");
  const wood = useRamp(ctx.spec, part.wood || "wood");
  const x = at[0];
  const y = at[1];
  const seat = part.seatRise ?? 0.046;
  const arch = part.arch ?? 0;
  const glass = part.glass ? useRamp(ctx.spec, part.glass) : null;
  if (arch > 0) {
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      const h0 = rise + Math.sin(Math.PI * (t0 + t1) * 0.5) * arch;
      ctx.solid.push(`drawIsoBox(pix,
        vec2(${num(x - over + (w + over * 2) * t0)}, ${num(y - over)}),
        vec2(${num(x - over + (w + over * 2) * t1)}, ${num(y + d + over)}),
        ${num(h0)}, ${num(Math.max(part.roofThick ?? 0.02, arch / bands + 0.012))},
        ${V(roof, 0)}, ${V(roof, 1)}, ${V(roof, 2)},
        ${V(roof, 0)}, ${V(iron, 0)}, ${V(iron, 1)},
        0.0, 0.0, ${num(22.2 + x + y + h0)});`);
    }
  } else {
    ctx.solid.push(`
    drawIsoBox(pix,
      vec2(${num(x - over)}, ${num(y - over)}),
      vec2(${num(x + w + over)}, ${num(y + d + over)}),
      ${num(rise)}, ${num(part.roofThick ?? 0.015)},
      ${V(roof, 0)}, ${V(roof, 1)}, ${V(roof, 2)},
      ${V(roof, 0)}, ${V(iron, 0)}, ${V(iron, 1)},
      0.0, 0.0, ${num(20.4 + x + y + w + d)});`);
  }
  if (glass) {
    const panels = [
      [x, y, x + w, y],
      [x, y, x, y + d],
      [x + w, y, x + w, y + d],
    ];
    for (const [ax, ay, bx, by] of panels) {
      ctx.solid.push(`
      {
        vec2 a = toScreen(vec2(${num(ax)}, ${num(ay)}), 0.012);
        vec2 b = toScreen(vec2(${num(bx)}, ${num(by)}), 0.012);
        vec2 c = toScreen(vec2(${num(ax)}, ${num(ay)}), ${num(rise * 0.92)});
        vec2 ab = b - a;
        vec2 ac = c - a;
        vec2 ap = pix.p - a;
        float det = ab.x * ac.y - ab.y * ac.x;
        if (abs(det) > 1e-6) {
          float u = (ap.x * ac.y - ap.y * ac.x) / det;
          float v = (ab.x * ap.y - ab.y * ap.x) / det;
          if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
            float shade = 0.62 + (v > 0.55 ? 0.22 : 0.0);
            float streak = fract(u * 11.0 - v * 1.6 - uTime / uDuration * 2.0);
            if (streak < 0.07) shade = 0.96;
            if (u < 0.045 || u > 0.955 || v < 0.04 || v > 0.96 || abs(fract(u * 3.0) - 0.5) > 0.46) shade = 0.16;
            cover(pix, ${num(19.2 + ax + ay)}, ${rampCall(glass, "shade", "pix.th")});
          }
        }
      }`);
    }
  }
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + d], [x + w, y + d]]) {
    ctx.solid.push(`drawPost(pix, vec2(${num(cx)}, ${num(cy)}), 0.0, ${num(rise)}, ${num(part.postHalf ?? 0.0042)}, ${V(iron, 0)}, ${V(iron, 1)}, ${V(iron, 2)}, ${num(20.1 + cx + cy)});`);
  }
  const bx = x + w * 0.14;
  const by = y + d * 0.22;
  const bw = w * 0.72;
  const bd = d * 0.46;
  ctx.solid.push(`
    drawIsoBox(pix, vec2(${num(bx)}, ${num(by)}), vec2(${num(bx + bw)}, ${num(by + bd)}), ${num(seat)}, 0.011,
      ${V(wood, 2)}, ${V(wood, 1)}, ${V(wood, 0)},
      ${V(wood, 0)}, ${V(wood, 0)}, ${V(wood, 1)},
      8.0, 0.0, ${num(20.3 + bx + by)});
    drawIsoBox(pix, vec2(${num(bx)}, ${num(by)}), vec2(${num(bx + bw)}, ${num(by + 0.03)}), ${num(seat + 0.038)}, 0.036,
      ${V(wood, 1)}, ${V(wood, 1)}, ${V(wood, 2)},
      ${V(wood, 0)}, ${V(wood, 0)}, ${V(wood, 1)},
      0.0, 0.0, ${num(20.25 + bx + by)});`);
  for (const [lx, ly] of [[bx + 0.02, by + 0.02], [bx + bw - 0.02, by + 0.02], [bx + 0.02, by + bd - 0.02], [bx + bw - 0.02, by + bd - 0.02]]) {
    ctx.solid.push(`drawPost(pix, vec2(${num(lx)}, ${num(ly)}), 0.0, ${num(seat)}, 0.003, ${V(wood, 0)}, ${V(wood, 0)}, ${V(wood, 1)}, ${num(19.8 + lx + ly)});`);
  }
  ctx.groundAdjust.push(`if (inRect(pix.g, vec2(${num(x)}, ${num(y)}), vec2(${num(w)}, ${num(d)}))) shade -= 0.07;`);
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.2;
    const gx = x - over + (w + over * 2) * t;
    const gy = y + d + over;
    ctx.overlay.push(`drip(pix, toScreen(vec2(${num(gx)}, ${num(gy)}), ${num(rise)}), ${num(i * 0.55)}, 2.5);`);
  }
}

function emitLamp(part, ctx) {
  const id = ident(part.name || "lamp");
  const at = part.at || [0.2, 0.2];
  const rise = part.rise ?? 0.2;
  const iron = useRamp(ctx.spec, part.pole || "iron");
  const glow = useRamp(ctx.spec, part.ramp || part.color || "amber");
  const glowE = part.glow == null ? "u_lampGlow" : typeof part.glow === "string" ? `u_${part.glow}` : num(part.glow);
  if (glowE === "u_lampGlow" && !ctx.paramKeys.has("lampGlow")) {
    throw new Error('lamp uses u_lampGlow. Add params.lampGlow, or set lamp.glow to a number.');
  }
  const pool = part.pool || [0.26, 0.18];
  ctx.prelude.push(`vec2 lamp_${id}_head;`);
  ctx.poseProps.push(`lamp_${id}_head = toScreen(vec2(${num(at[0])}, ${num(at[1])}), ${num(rise)}) + vec2(0.01, -0.006);`);
  const z = 20 + at[0] + at[1];
  ctx.solid.push(`
    drawPost(pix, vec2(${num(at[0])}, ${num(at[1])}), 0.0, ${num(rise)}, 0.0034, ${V(iron, 0)}, ${V(iron, 1)}, ${V(iron, 2)}, ${num(z)});
    {
      vec2 base = toScreen(vec2(${num(at[0])}, ${num(at[1])}), ${num(rise)});
      vec2 head = lamp_${id}_head;
      vec2 n; float h;
      if (hitCapsule(pix.p, base, head, 0.7 / uGrid, n, h) >= 0.0) cover(pix, ${num(z + 0.2)}, ${V(iron, 1)});
      float hd = length(pix.p - head);
      if (hd < 0.036 && hd > 0.016 && ${glowE} * 0.9 > pix.th) cover(pix, ${num(z + 0.3)}, ${V(glow, 1)});
      if (hitDisc(pix.p, head + vec2(0.0, -0.014), 0.012, n) >= 0.0) cover(pix, ${num(z + 0.5)}, ${V(iron, 0)});
      if (hitDisc(pix.p, head, 0.016, n) >= 0.0) cover(pix, ${num(z + 0.45)}, ${V(glow, Math.min(2, glow.length - 1))});
      if (hitDisc(pix.p, head + vec2(0.0, 0.004), 0.011, n) >= 0.0) cover(pix, ${num(z + 0.42)}, ${V(glow, 1)});
    }`);
  ctx.afterGround.push(`
    if (pix.mat > 0) {
      float d = length((pix.g - vec2(${num(at[0])}, ${num(at[1])})) / vec2(${num(pool[0])}, ${num(pool[1])}));
      float fall = clamp(1.0 - d, 0.0, 1.0);
      fall = fall * fall * ${glowE};
      if (fall > pix.th * 0.55) pix.rgb = fall > 0.48 ? ${V(glow, Math.min(2, glow.length - 1))} : ${V(glow, 1)};
    }`);
  ctx.reflect.push(`
    if (pix.mat == 2) {
      vec2 head = lamp_${id}_head;
      float dy = pix.p.y - head.y;
      float wob = sin(pix.p.y * 80.0 + uTime / uDuration * 6.2831853 * 3.0) * (2.2 / uGrid) * u_shimmer;
      float nx = abs(pix.p.x - head.x + wob) / (0.018 + max(dy, 0.0) * 0.2);
      float ny = dy / ${num(part.streak ?? 0.15)};
      if (dy > 0.004 && nx < 1.0 && ny < 1.0) {
        float a = (1.0 - ny) * (1.0 - nx) * ${glowE};
        float brk = sin(pix.p.y * 70.0 + uTime / uDuration * 6.2831853 * 3.0);
        if (a > pix.th * 0.45 && brk < 0.72) pix.rgb = ny < 0.45 ? ${V(glow, Math.min(2, glow.length - 1))} : ${V(glow, 1)};
      }
    }`);
}

function emitRain(part, ctx) {
  const patch = ctx.spec.parts.find((p) => p.kind === "patch");
  const c = part.center || patch?.center || [0.5, 0.5];
  const r = part.radii || patch?.radii || [0.7, 0.5];
  const col = glslVec(part.color || "#d7e4ea");
  const dens = part.density == null ? "u_rain" : typeof part.density === "string" ? `u_${part.density}` : num(part.density);
  if (dens === "u_rain" && !ctx.paramKeys.has("rain")) {
    throw new Error('rain uses u_rain. Add params.rain, or set rain.density to a number.');
  }
  const angle = part.angle ?? 0.4;
  const columns = part.columns ?? 52;
  const thick = part.thick ?? 0.18;
  const len = part.len ?? 0.14;
  const slab = patch?.slab;
  const vig = slab
    ? `slabCov(pix.g, vec2(${num(slab.x)}, ${num(slab.y)}), vec2(${num(slab.w)}, ${num(slab.d)}), ${num(patch.edge ?? 0.05)})`
    : `smoothstep(1.2, 0.55, length((pix.g - vec2(${num(c[0])}, ${num(c[1])})) / max(vec2(${num(r[0])}, ${num(r[1])}), vec2(0.001))))`;
  ctx.overlay.push(`
    {
      float vig = ${vig};
      vec2 dirv = normalize(vec2(${num(angle)}, 1.0));
      vec2 nrm = vec2(-dirv.y, dirv.x);
      float across = dot(pix.p, nrm);
      float along = dot(pix.p, dirv);
      float id = floor(across * ${num(columns)});
      float h = hash11(id);
      float f = fract(along * ${num(part.along ?? 14)} - (uTime / uDuration) * 6.0 - h);
      if (fract(across * ${num(columns)}) < ${num(thick)} && h < 0.62 * ${dens} && f < ${num(len)} && vig > pix.th) pix.rgb = ${col};
    }`);
}

function emitSlab(part, ctx) {
  const at = part.at || [0, 0];
  const w = part.w ?? 0.2;
  const d = part.d ?? 0.12;
  const rise = part.rise ?? 0.05;
  const thick = part.thick ?? part.skirt ?? 0.02;
  const top = useRamp(ctx.spec, part.ramp || "wood");
  const side = useRamp(ctx.spec, part.skirtRamp || part.side || part.ramp || "wood");
  const freq = part.planks ?? 0;
  const alongY = part.plankAxis === "y" ? 1 : 0;
  const z = 20 + at[0] + at[1] + (part.zBias || 0);
  ctx.solid.push(`drawIsoBox(pix, vec2(${num(at[0])}, ${num(at[1])}), vec2(${num(at[0] + w)}, ${num(at[1] + d)}), ${num(rise)}, ${num(thick)}, ${V(top, 0)}, ${V(top, 1)}, ${V(top, 2)}, ${V(side, 0)}, ${V(side, 1)}, ${V(side, 2)}, ${num(freq)}, ${num(alongY)}, ${num(z)});`);
}

function emitPost(part, ctx) {
  const at = part.at || [0, 0];
  const ramp = useRamp(ctx.spec, part.ramp || "ink");
  const z = 20 + at[0] + at[1] + (part.zBias || 0);
  ctx.solid.push(`drawPost(pix, vec2(${num(at[0])}, ${num(at[1])}), ${num(part.from ?? 0)}, ${num(part.rise ?? 0.08)}, ${num(part.half ?? 0.004)}, ${V(ramp, 0)}, ${V(ramp, 1)}, ${V(ramp, 2)}, ${num(z)});`);
}

function emitBall(part, ctx) {
  const ramp = useRamp(ctx.spec, part.ramp || part.color || "orange");
  const r = part.r ?? 0.015;
  const cycles = part.cycles ?? 6;
  const shadow = ctx.spec.ramps?.ink ? V(useRamp(ctx.spec, "ink"), 0) : V(ramp, 0);
  if (part.pattern === "cascade") {
    const hands = part.hands || ["juggler.handB", "juggler.handF"];
    const j = (h) => {
      const [a, b] = h.split(".");
      return `${ident(a)}_${b}`;
    };
    const A = j(hands[0]);
    const B = j(hands[1]);
    ctx.solid.push(`
      {
        float s = fract(uTime / uDuration * ${num(cycles)} + ${num(part.phase ?? 0)});
        float u = fract(s * 2.0);
        vec2 from = s < 0.5 ? ${A} : ${B};
        vec2 to = s < 0.5 ? ${B} : ${A};
        vec2 pos = mix(from, to, easeSmooth(u));
        pos.y -= sin(u * 3.14159) * ${typeof part.flight === "string" ? `u_${part.flight}` : num(part.flight ?? 0.085)};
        vec2 n;
        float hy = sin(u * 3.14159);
        vec2 sh = vec2(pos.x, max(${A}.y, ${B}.y) + 0.02);
        if (pix.mat > 0 && pix.z < 15.0 && length((pix.p - sh) / vec2(0.012, 0.005)) < 1.0 && 0.4 * (1.0 - hy) > pix.th) pix.rgb = ${shadow};
        if (hitDisc(pix.p, pos, ${num(r)}, n) >= 0.0) cover(pix, 47.0, ${rampCall(ramp, "shadeForm(n)", "pix.th")});
      }`);
    return;
  }
  let groundExpr;
  if (part.hand) {
    const [who, joint] = part.hand.split(".");
    groundExpr = `vec2(${ident(who)}_${joint}.x + 0.014, ${ident(who)}_footF.y)`;
  } else if (part.at) {
    groundExpr = `toScreen(vec2(${num(part.at[0])}, ${num(part.at[1])}), 0.0)`;
  } else throw new Error("ball needs at: [x, y] or hand: \"someone.handF\"");
  ctx.solid.push(`
    {
      float s = fract(uTime / uDuration * ${num(cycles)});
      float height = abs(sin(s * 6.2831853));
      vec2 gnd = ${groundExpr};
      vec2 pos = gnd + vec2(0.0, -height * ${typeof part.height === "string" ? `u_${part.height}` : num(part.height ?? 0.055)});
      if (pix.mat > 0 && pix.z < 15.0) {
        float sr = mix(0.02, 0.007, height);
        if (length((pix.p - gnd) / vec2(sr, sr * 0.42)) < 1.0 && 0.5 > pix.th * (0.45 + height)) pix.rgb = ${shadow};
      }
      vec2 n;
      if (hitDisc(pix.p, pos, ${num(r)}, n) >= 0.0) cover(pix, 47.0, ${rampCall(ramp, "shadeForm(n)", "pix.th")});
    }`);
}

function emitHoop(part, ctx) {
  const at = part.at || [0.8, 0.3];
  const rise = part.rise ?? 0.2;
  const pole = useRamp(ctx.spec, part.pole || "iron");
  const board = useRamp(ctx.spec, part.board || "mist");
  const rim = useRamp(ctx.spec, part.rim || "orange");
  const z = 20 + at[0] + at[1];
  ctx.solid.push(`
    drawPost(pix, vec2(${num(at[0])}, ${num(at[1])}), 0.0, ${num(rise)}, 0.0038, ${V(pole, 0)}, ${V(pole, 1)}, ${V(pole, 2)}, ${num(z)});
    {
      vec2 top = toScreen(vec2(${num(at[0])}, ${num(at[1])}), ${num(rise)});
      vec2 bc = top + vec2(0.0, -0.03);
      vec2 boardHalf = vec2(0.03, 0.02);
      if (abs(pix.p.x - bc.x) < boardHalf.x && abs(pix.p.y - bc.y) < boardHalf.y) {
        float shade = 0.74;
        if (abs(pix.p.x - bc.x) > boardHalf.x - 0.0035 || abs(pix.p.y - bc.y) > boardHalf.y - 0.003) shade = 0.28;
        cover(pix, ${num(z + 0.3)}, ${rampCall(board, "shade", "pix.th")});
      }
      vec2 rimC = top + vec2(0.006, 0.006);
      float e = length((pix.p - rimC) / vec2(0.016, 0.0075));
      if (e < 1.0 && e > 0.58) cover(pix, ${num(z + 0.45)}, ${V(rim, Math.min(1, rim.length - 1))});
      for (int i = 0; i < 4; i++) {
        float fx = (float(i) - 1.5) * 0.0065;
        vec2 a = rimC + vec2(fx, 0.003);
        vec2 b = rimC + vec2(fx * 0.35, 0.02);
        vec2 n; float hgt;
        if (hitCapsule(pix.p, a, b, 0.45 / uGrid, n, hgt) >= 0.0) cover(pix, ${num(z + 0.35)}, ${V(pole, Math.min(2, pole.length - 1))});
      }
    }`);
}

function emitRod(part, ctx) {
  const bits = (part.hand || "fisher.handF").split(".");
  if (bits.length !== 2) throw new Error("rod.hand should look like \"fisher.handF\"");
  const hv = `${ident(bits[0])}_${bits[1]}`;
  const tip = part.tip || { at: [1, 0.8], rise: 0.1 };
  const col = glslVec(part.color || "#14181e");
  const sag = part.sag ?? 0.014;
  const bite = part.biteSag ?? 0;
  const from = part.biteFrom ?? 4.8;
  const to = part.biteTo ?? 10.2;
  let bobber = "";
  if (part.bobber) {
    const b = part.bobber;
    const line = glslVec(part.line || "#8d4e58");
    const red = glslVec(b.color || "#c45448");
    bobber = `
      vec2 bob = toScreen(vec2(${num(b.at[0])}, ${num(b.at[1])}), 0.0);
      bob.y += sin(uTime / uDuration * 6.2831853 * 4.0) * ${num(b.bob ?? 0.0035)};
      if (uTime > ${num(b.dipFrom ?? from)} && uTime < ${num(b.dipTo ?? to)}) bob.y += ${num(b.depth ?? 0.01)} + sin(uTime / uDuration * 6.2831853 * 18.0) * 0.0028;
      if (pix.p.y > min(tip.y, bob.y) && pix.p.y < max(tip.y, bob.y)) {
        float x = mix(tip.x, bob.x, (pix.p.y - tip.y) / max(1e-4, bob.y - tip.y));
        if (abs(pix.p.x - x) <= 0.65 / uGrid && mod(pix.cell.y, 2.0) < 1.0) cover(pix, 49.0, ${line});
      }
      vec2 n;
      if (hitDisc(pix.p, bob, 1.7 / uGrid, n) >= 0.0) cover(pix, 50.0, pix.p.y > bob.y ? ${red} : vec3(1.0));
      if (hitDisc(pix.p, bob + vec2(0.0, 1.3 / uGrid), 1.15 / uGrid, n) >= 0.0 && pix.p.y > bob.y) cover(pix, 50.1, ${red});`;
  }
  ctx.solid.push(`
    {
      vec2 hand = ${hv};
      vec2 tip = toScreen(vec2(${num(tip.at[0])}, ${num(tip.at[1])}), ${num(tip.rise ?? 0.1)});
      float flex = ${num(sag)};
      if (uTime > ${num(from)} && uTime < ${num(to)}) flex += ${typeof part.biteSag === "string" ? `u_${part.biteSag}` : num(bite)};
      vec2 ctrl = mix(hand, tip, 0.55) + vec2(0.0, flex);
      drawBezier(pix, hand, ctrl, tip, 1.0 / uGrid, ${col}, 48.0);
      ${bobber}
    }`);
}

function emitFish(part) {
  const fish = part.fish;
  if (!fish) return "";
  const bite = fish.bite || null;
  const count = fish.count ?? 3;
  let biteGlsl = "";
  if (bite) {
    const t0 = bite.t0 ?? 4.6;
    const t1 = bite.t1 ?? 5.5;
    const t2 = bite.t2 ?? 8.4;
    const t3 = bite.t3 ?? 10.6;
    biteGlsl = `
        if (k == 0) {
          vec2 rest = g;
          vec2 bob = vec2(${num(bite.bobber[0])}, ${num(bite.bobber[1])});
          vec2 pier = vec2(${num(bite.pier[0])}, ${num(bite.pier[1])});
          if (uTime > ${num(t0)} && uTime < ${num(t1)}) {
            g = mix(rest, bob, easeSmooth((uTime - ${num(t0)}) / ${num(t1 - t0)}));
          } else if (uTime >= ${num(t1)} && uTime < ${num(t2)}) {
            g = bob + 0.028 * vec2(sin(uTime * 17.0), cos(uTime * 13.0));
          } else if (uTime >= ${num(t2)} && uTime < ${num(t3)}) {
            g = mix(bob, pier, easeSmooth((uTime - ${num(t2)}) / ${num(Math.max(0.001, t3 - t2))}));
          } else if (uTime >= ${num(t3)}) {
            g = mix(pier, rest, easeSmooth((uTime - ${num(t3)}) / max(0.001, uDuration - ${num(t3)})));
          }
        }`;
  }
  return `
float fishMask(vec2 p) {
  float m = 0.0;
  for (int k = 0; k < ${count}; k++) {
    float a = uTime * 6.2831853 / uDuration + float(k) * ${num(6.2831853 / count)};
    float rad = ${num(fish.orbit ?? 0.24)} + float(k) * 0.035;
    vec2 g = vec2(${num(fish.center[0])}, ${num(fish.center[1])}) + vec2(cos(a), sin(a) * 1.4) * rad;
    vec2 dirg = normalize(vec2(-sin(a), cos(a) * 1.4));
    ${biteGlsl}
    vec2 s = toScreen(g, 0.0);
    vec2 sd = uAxisX * dirg.x + uAxisY * dirg.y;
    float sl = length(sd);
    sd = sl > 1e-5 ? sd / sl : vec2(1.0, 0.0);
    vec2 u = vec2(dot(p - s, sd), dot(p - s, vec2(-sd.y, sd.x)));
    float body = length(u / vec2(0.02, 0.007));
    float tail = (u.x < -0.012 && u.x > -0.03 && abs(u.y) < (-0.008 - u.x) * 0.7) ? 1.0 : 0.0;
    m = max(m, max(1.0 - step(1.0, body), tail));
  }
  return m;
}
`;
}

function emitGround(ctx) {
  const part = ctx.spec.parts.find((p) => p.kind === "patch");
  if (!part) return "void paint_ground(inout Pix pix) {}\n";
  const base = useRamp(ctx.spec, part.ramp || "grass");
  const center = part.center || [0.5, 0.5];
  const radii = part.radii || [0.7, 0.55];
  const edge = part.edge ?? 0.16;
  const allWet = !!part.water;
  const layers = [{ id: 1, ramp: base, wet: allWet }];
  let classify = "";
  if (part.water) {
    classify += `shade = mix(0.78, 0.3, clamp(length((pix.g - vec2(${num(center[0])}, ${num(center[1])})) / vec2(${num(radii[0])}, ${num(radii[1])})), 0.0, 1.0));\n`;
    classify += `shade += (noise(pix.g * 2.2) - 0.5) * 0.04;\n`;
  } else {
    classify += `shade = 0.64 + (noise(pix.g * 2.4) - 0.5) * 0.06;\n`;
  }
  for (const rc of part.rects || []) {
    const id = layers.length + 1;
    const ramp = useRamp(ctx.spec, rc.ramp);
    layers.push({ id, ramp, wet: !!rc.wet || allWet });
    classify += `if (inRect(pix.g, vec2(${num(rc.x)}, ${num(rc.y)}), vec2(${num(rc.w)}, ${num(rc.d)}))) { which = ${id}; shade = ${num(rc.shade ?? (rc.wet ? 0.46 : 0.6))}; shade += (noise(pix.g * 3.5) - 0.5) * 0.05; }\n`;
  }
  let puddles = "";
  const rippleE = part.rippleAmp == null ? "0.0" : typeof part.rippleAmp === "string" ? `u_${part.rippleAmp}` : num(part.rippleAmp);
  const rippleGain = part.rippleGain ?? 0.55;
  const puddleE = part.puddle == null ? "0.65" : typeof part.puddle === "string" ? `u_${part.puddle}` : num(part.puddle);
  const period = part.ripplePeriod ?? 5;
  for (const [i, pd] of (part.puddles || []).entries()) {
    puddles += `
      {
        vec2 pc = toScreen(vec2(${num(pd.at[0])}, ${num(pd.at[1])}), 0.0);
        float pe = length((pix.p - pc) / vec2(${num(pd.r?.[0] ?? 0.06)}, ${num(pd.r?.[1] ?? 0.034)}));
        if (pe < 1.15 && (which == 2 || ${allWet ? "true" : "false"})) {
          shade -= (1.0 - clamp(pe, 0.0, 1.0)) * ${num(pd.dark ?? 0.2)} * ${puddleE};
          shade += rings(pix.p, pc, ${num(period)}, ${num(pd.phase ?? i * 1.6)}, ${num(pd.reach ?? 0.05)}) * ${rippleE} * ${num(rippleGain)};
        }
      }`;
  }
  for (const rp of part.ripples || []) {
    puddles += `shade += rings(pix.p, toScreen(vec2(${num(rp.at[0])}, ${num(rp.at[1])}), 0.0), ${num(rp.period ?? period)}, ${num(rp.phase ?? 0)}, ${num(rp.reach ?? 0.05)}) * ${rippleE} * 0.5;\n`;
  }
  let shadows = "";
  for (const s of part.shadows || []) {
    const ox = s.offset?.[0] ?? 0.03;
    const oy = s.offset?.[1] ?? 0.05;
    shadows += `if (inRect(pix.g - vec2(${num(ox)}, ${num(oy)}), vec2(${num(s.x)}, ${num(s.y)}), vec2(${num(s.w)}, ${num(s.d)}))) shade -= ${num(s.amount ?? 0.2)};\n`;
  }
  for (const s of part.mirrors || []) {
    const ox = s.offset?.[0] ?? 0.0;
    const oy = s.offset?.[1] ?? 0.08;
    shadows += `{
      vec2 wg = pix.g + vec2(sin(pix.p.y * 90.0 + uTime / uDuration * 6.2831853 * 2.0) * 0.015 * u_shimmer, 0.0);
      if (inRect(wg - vec2(${num(ox)}, ${num(oy)}), vec2(${num(s.x)}, ${num(s.y)}), vec2(${num(s.w)}, ${num(s.d)}))) shade -= ${num(s.amount ?? 0.1)};
    }\n`;
  }
  const fishFn = emitFish({ ...part, durationHint: ctx.spec.duration });
  const fishCall = part.fish ? "shade -= fishMask(pix.p) * 0.4;\n" : "";
  const wetTest = allWet
    ? "true"
    : layers.filter((l) => l.wet).map((l) => `which == ${l.id}`).join(" || ") || "false";
  let color = "";
  for (const layer of layers) {
    color += `if (which == ${layer.id}) pix.rgb = ${rampCall(layer.ramp, "shade", "pix.th")};\n`;
  }
  return `
${fishFn}
void paint_ground(inout Pix pix) {
  float cov = ${part.slab
    ? `slabCov(pix.g, vec2(${num(part.slab.x)}, ${num(part.slab.y)}), vec2(${num(part.slab.w)}, ${num(part.slab.d)}), ${num(edge)})`
    : `ellipseCov(pix.g, vec2(${num(center[0])}, ${num(center[1])}), vec2(${num(radii[0])}, ${num(radii[1])}), ${num(edge)})`};
  if (cov <= pix.th) return;
  float shade = 0.6;
  int which = 1;
  ${classify}
  ${puddles}
  ${shadows}
  ${fishCall}
  ${ctx.groundAdjust.join("\n")}
  shade = clamp(shade, 0.0, 1.0);
  ${color}
  pix.mat = (${wetTest}) ? 2 : 1;
  pix.z = 10.0;
}
`;
}

function emitDrip(spec) {
  const rain = spec.parts.find((p) => p.kind === "rain");
  const col = glslVec(rain?.color || spec.ramps?.mist?.[2] || spec.ramps?.foam?.[0] || "#d7e4ea");
  return `
void drip(inout Pix pix, vec2 origin, float phase, float period) {
  if (u_drips < 0.01) return;
  float u = mod(uTime + phase, period) / period;
  if (u > 0.82) return;
  vec2 pos = origin + normalize(vec2(0.32, 1.0)) * (u / 0.82) * 0.07;
  if (length(pix.p - pos) <= 0.95 / uGrid) pix.rgb = ${col};
}
`;
}

const EMITTERS = {
  person: emitPerson,
  umbrella: emitUmbrella,
  shelter: emitShelter,
  lamp: emitLamp,
  rain: emitRain,
  slab: emitSlab,
  post: emitPost,
  ball: emitBall,
  hoop: emitHoop,
  rod: emitRod,
  patch: () => {},
  glsl(part, ctx) {
    const phase = part.phase || "overlay";
    const src = part.source || "";
    if (phase === "ground") ctx.groundAdjust.push(src);
    else if (phase === "solid") ctx.solid.push(src);
    else ctx.overlay.push(src);
  },
};

export function compile(spec) {
  if (!spec?.parts) throw new Error("compile() expected a scene from scene()");
  const params = mergeParams(spec);
  const paramKeys = new Set(params.map((p) => p.key));
  const ctx = {
    spec,
    params,
    paramKeys,
    ids: new Set(),
    people: [],
    prelude: [],
    posePeople: [],
    poseProps: [],
    groundAdjust: [],
    afterGround: [],
    solid: [],
    reflect: [],
    overlay: [],
  };
  const patches = spec.parts.filter((p) => p.kind === "patch");
  if (patches.length > 1) throw new Error("A scene gets one patch. Put roads, courts, and rugs in patch.rects.");
  for (const part of spec.parts) {
    const fn = EMITTERS[part.kind];
    if (!fn) throw new Error(`Unknown part kind "${part.kind}" on "${part.name || "?"}"`);
    fn(part, ctx);
  }
  const decls = params.map((p) => `uniform float u_${p.key};`).join("\n");
  const keep = params.map((p) => `u_${p.key}`).join(" + ") || "0.0";
  const frag = `#version 300 es
precision highp float;
out vec4 o;
${decls}
${LIB}
${emitDrip(spec)}
${ctx.prelude.join("\n")}
${emitGround(ctx)}
void main() {
  Pix pix = openPix();
  ${ctx.posePeople.join("\n  ")}
  ${ctx.poseProps.join("\n  ")}
  paint_ground(pix);
  ${ctx.afterGround.join("\n  ")}
  ${ctx.reflect.join("\n  ")}
  ${ctx.solid.join("\n  ")}
  ${ctx.overlay.join("\n  ")}
  pix.rgb += vec3(0.0 * (${keep}));
  o = vec4(pix.rgb, 1.0);
}
`;
  return { vert: VERT, frag, params, spec };
}

/**
 * Scene authoring helpers.
 *
 * A scene is plain data: camera, palette ramps, named params, and parts.
 * Params become uniforms, so a playground slider and an agent can retune
 * them without rewriting the shader. Pose angles are degrees in the
 * character's local frame (see SKILL.md). A pose field may be a number
 * or a GLSL expression string when it needs to follow a knob.
 *
 *   90  up
 *    0  character's right
 *  -90  down
 */

import { pocketCamera } from "./spec.js";

function flatten(parts, out = []) {
  for (const p of parts || []) {
    if (p == null) continue;
    if (Array.isArray(p)) flatten(p, out);
    else out.push(p);
  }
  return out;
}

export function param(value, opts = {}) {
  return {
    value,
    min: opts.min ?? 0,
    max: opts.max ?? 1,
    step: opts.step ?? 0.01,
    label: opts.label || "",
    doc: opts.doc || "",
    group: opts.group || "scene",
    ...opts,
    value,
  };
}

export function scene(spec) {
  if (!spec || !spec.name) throw new Error("scene() needs a name");
  return {
    duration: 10,
    fps: 12,
    grid: 360,
    bayer: 4,
    background: "#ffffff",
    poster: 0,
    camera: { ...pocketCamera },
    light: { dir: [-0.42, -0.88], ambient: 0.42, diffuse: 0.55 },
    ramps: {},
    params: {},
    parts: [],
    ...spec,
    camera: { ...pocketCamera, ...(spec.camera || {}) },
    light: { dir: [-0.42, -0.88], ambient: 0.42, diffuse: 0.55, ...(spec.light || {}) },
    parts: flatten(spec.parts),
  };
}

const part = (kind) => (opts) => ({ kind, ...opts });

/** Dithered ground ellipse. rects override the base ramp. wet rects take reflections. */
export const patch = part("patch");
/** A box with a lit top and two darker side faces. rise and thick are screen heights. */
export const slab = part("slab");
/** A screen-vertical post. half is the screen half-width. */
export const post = part("post");
/** Open shelter: four posts, a roof, a bench, drips along the eave. */
export const shelter = part("shelter");
/**
 * Articulated figure. Anchor is the hip, in ground coordinates.
 * plant: "stand" lifts the hip by the leg length. plant: "seat" uses seatRise.
 * facing: 1 looks to their right (screen right), -1 mirrors the pose.
 * armF / legF are the front limbs (drawn over the body). handF is the prop hand.
 */
export const person = part("person");
/** Ellipse canopy + shaft. hand: "name.handF" or "name.handB". */
export const umbrella = part("umbrella");
/** Post, lantern head, and a warm pool on wet ground. */
export const lamp = part("lamp");
/** Diagonal streaks. They fade with the ground vignette and loop with the scene. */
export const rain = part("rain");
/** Orange (or any) ball. pattern: "bounce" | "cascade". */
export const ball = part("ball");
/** Pole, backboard, rim. */
export const hoop = part("hoop");
/** Bezier rod from a hand to a tip, plus an optional bobber and line. */
export const rod = part("rod");
/**
 * Escape hatch. source is GLSL that runs in main() with pix, the library,
 * joints, and uniforms in scope. phase: "ground" | "solid" | "overlay".
 */
export const glsl = part("glsl");

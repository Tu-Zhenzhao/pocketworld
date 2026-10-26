/**
 * Fishing pier. Twelve seconds, stepped at 12fps.
 * reference.jpg is a concept still. The scene is conformed to the spec
 * (2:1 camera, white margin, Bayer, a shared palette), not traced.
 * The bite is the beat: bobber dips, a splash, rings, the rod flexes,
 * one fish leaves the school and comes back before the loop closes.
 * The kid's calves are the secondary motion. Tune `calfSwing`.
 */
import { scene, param, patch, slab, post, person, rod, glsl } from "../../src/scene.js";

const ink = "#111215";
const water = ["#254455", "#3d6d7c", "#5a93a0", "#d5e6ea"];
const wood = ["#603a28", "#9e6b45", "#e0b57a"];
const blue = ["#1a3058", "#3a5a88", "#8aa4c4"];
const green = ["#2e4030", "#4e6848", "#8aa484"];

export default scene({
  name: "Fishing pier",
  id: "fishing",
  duration: 12,
  fps: 12,
  grid: 360,
  bayer: 4,
  poster: 6,
  background: "#ffffff",
  light: { dir: [-0.48, -0.8], ambient: 0.3, diffuse: 0.68 },
  ramps: {
    ink: [ink, "#2a241c", "#4a4038"],
    water,
    wood,
    skirt: [ink, "#2a241c", "#603a28"],
    rust: ["#6e2e28", "#c45c3a", "#f0b0a0"],
    blue,
    skin: ["#9e6b45", "#f0c8aa", "#d5e6ea"],
    hat: ["#9e6b45", "#e0b57a", "#d5e6ea"],
    pants: blue,
    green,
  },
  params: {
    calfSwing: param(18, { min: 0, max: 36, step: 0.5, label: "Calf swing", doc: "Degrees the kid's dangling calves travel. Lazy is around 14, a fidget is 28." }),
    breath: param(1.4, { min: 0, max: 6, step: 0.05, label: "Breath", doc: "Degrees of torso rise on every figure." }),
    ripples: param(1, { min: 0, max: 1.5, step: 0.02, label: "Bite rings", doc: "Strength of the rings that follow the splash." }),
    rodFlex: param(0.02, { min: 0, max: 0.06, step: 0.001, label: "Rod flex", doc: "Extra sag in the rod while the fish is on, in screen units." }),
    reflection: param(0.55, { min: 0, max: 1, step: 0.02, group: "craft" }),
  },
  parts: [
    patch({
      name: "pond",
      water: true,
      center: [0.52, 0.48],
      radii: [0.88, 0.74],
      edge: 0.18,
      ramp: "water",
      fish: {
        count: 4,
        center: [0.72, 0.62],
        orbit: 0.16,
        bite: { bobber: [0.98, 0.78], pier: [0.84, 0.55], t0: 4.5, t1: 5.4, t2: 8.3, t3: 10.4 },
      },
      shadows: [
        { x: 0.06, y: 0.16, w: 1.0, d: 0.22, amount: 0.24, offset: [0.02, 0.07] },
        { x: 0.7, y: 0.16, w: 0.36, d: 0.52, amount: 0.26, offset: [0.02, 0.07] },
      ],
      mirrors: [
        { x: 0.06, y: 0.16, w: 1.0, d: 0.22, amount: 0.1, offset: [0.0, 0.1] },
        { x: 0.7, y: 0.16, w: 0.36, d: 0.52, amount: 0.1, offset: [0.0, 0.1] },
      ],
    }),
    slab({
      name: "walk",
      at: [0.06, 0.16],
      w: 1.02,
      d: 0.22,
      rise: 0.064,
      skirt: 0.034,
      ramp: "wood",
      skirtRamp: "skirt",
      planks: 11,
    }),
    slab({
      name: "end",
      at: [0.7, 0.16],
      w: 0.36,
      d: 0.52,
      rise: 0.064,
      skirt: 0.034,
      ramp: "wood",
      skirtRamp: "skirt",
      planks: 8,
      plankAxis: "y",
      zBias: 0.15,
    }),
    ...[[0.08, 0.36], [0.38, 0.36], [0.7, 0.36], [0.7, 0.66], [1.04, 0.36], [1.04, 0.66]].map((at, i) => post({
      name: `post${i}`,
      at,
      rise: 0.064,
      half: 0.0045,
      ramp: "ink",
    })),
    slab({
      name: "cooler",
      at: [0.5, 0.2],
      w: 0.1,
      d: 0.08,
      rise: 0.086,
      skirt: 0.02,
      ramp: "blue",
      skirtRamp: "ink",
      zBias: 0.2,
    }),
    person({
      name: "friend",
      at: [0.32, 0.24],
      scale: 0.162,
      facing: 1,
      plant: "stand",
      hairCover: 0.35,
      hat: { type: "bucket", ramp: "hat" },
      colors: { skin: "skin", hair: "ink", torso: "green", arm: "green", thigh: "pants", calf: "pants", shoe: "ink", ink: "ink" },
      pose: { torso: 88, head: 84, armF: [-70, -84], armB: [-100, -110], legF: [-88, -90], legB: [-92, -90] },
      motions: [{ type: "breathe", amp: "breath", cycles: 3 }, { type: "sway", amp: 1.5, cycles: 1 }],
    }),
    person({
      name: "fisher",
      at: [0.82, 0.42],
      scale: 0.168,
      facing: 1,
      plant: "seat",
      seatRise: 0.066,
      hairCover: 0.2,
      hat: { type: "bucket", ramp: "hat" },
      colors: { skin: "skin", hair: "ink", torso: "blue", arm: "blue", thigh: "pants", calf: "pants", shoe: "ink", ink: "ink" },
      pose: { torso: 82, head: 78, armF: [24, -15], armB: [-96, -70], legF: [8, -70], legB: [-4, -82] },
      motions: [{ type: "breathe", amp: "breath", cycles: 3, phase: 0.6 }],
    }),
    person({
      name: "kid",
      at: [0.9, 0.62],
      scale: 0.14,
      facing: 1,
      plant: "seat",
      seatRise: 0.066,
      hairCover: 0.55,
      colors: {
        skin: "skin", hair: "ink", torso: "rust", arm: "rust",
        thigh: "rust", calf: "skin", shoe: "hat", ink: "ink",
      },
      pose: {
        torso: 76,
        head: 80,
        armF: [-40, -70],
        armB: [-110, -100],
        legF: [6, -72],
        legB: [-2, -80],
      },
      motions: [
        { type: "breathe", amp: "breath", cycles: 3, phase: 1 },
        { type: "dangle", bone: "legF.l", amp: "calfSwing", cycles: 4, phase: 0 },
        { type: "dangle", bone: "legB.l", amp: "calfSwing", cycles: 4, phase: 1.3 },
      ],
    }),
    rod({
      name: "rod",
      hand: "fisher.handF",
      tip: { at: [1.02, 0.7], rise: 0.1 },
      sag: 0.012,
      biteSag: "rodFlex",
      biteFrom: 4.7,
      biteTo: 10.2,
      color: ink,
      line: "#6e2e28",
      bobber: { at: [0.98, 0.78], bob: 0.003, depth: 0.012, dipFrom: 4.8, dipTo: 8.6, color: "#c45c3a" },
    }),
    glsl({
      name: "bite",
      phase: "ground",
      source: `
        {
          vec2 c = toScreen(vec2(0.98, 0.78), 0.0);
          float age = mod(uTime - 5.0 + uDuration, uDuration);
          if (age < 4.2) {
            for (int i = 0; i < 3; i++) {
              float rt = age - float(i) * 0.65;
              if (rt > 0.0) {
                float R = rt * 0.013;
                float d = length((pix.p - c) * vec2(1.0, 1.65));
                shade += u_ripples * (1.0 - rt / 4.2) * (1.0 - smoothstep(0.0, 1.35 / uGrid, abs(d - R)));
              }
            }
          }
        }
      `,
    }),
    glsl({
      name: "splash",
      phase: "overlay",
      source: `
        if (uTime > 4.9 && uTime < 5.55) {
          vec2 b = toScreen(vec2(0.98, 0.78), 0.0);
          vec2 d = (pix.p - b) / vec2(0.022, 0.015);
          float hsh = hash21(pix.cell + floor(uTime * 12.0));
          if (length(d) < 1.0 && hsh > 0.58 && pix.p.y < b.y + 0.006) pix.rgb = vec3(1.0);
        }
      `,
    }),
  ],
});

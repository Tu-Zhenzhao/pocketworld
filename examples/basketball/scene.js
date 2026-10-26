/**
 * One player, one ball, one hoop. reference.jpg is a concept still,
 * conformed to the spec rather than traced. The dribble is the whole loop:
 * eight bounces in six seconds, and the arm pushes with the same count.
 */
import { scene, param, patch, person, ball, hoop } from "../../src/scene.js";

export default scene({
  name: "Driveway hoop",
  id: "basketball",
  duration: 6,
  fps: 12,
  grid: 360,
  bayer: 4,
  poster: 0.4,
  background: "#ffffff",
  light: { dir: [-0.5, -0.78], ambient: 0.32, diffuse: 0.66 },
  ramps: {
    ink: ["#1a1c16", "#2e3228", "#4a5044"],
    grass: ["#3d5a28", "#6a8a3a", "#c6d48a"],
    court: ["#c4a060", "#e0c48a", "#f4e6c4"],
    line: ["#f4f0e6", "#ffffff", "#ffffff"],
    rust: ["#8a3418", "#e06830", "#f0b090"],
    skin: ["#a07050", "#f0c0a0", "#f8e0d0"],
    hair: ["#1c140e", "#3a2a1c", "#5a4030"],
    orange: ["#c04818", "#f07828", "#f8c090"],
    iron: ["#2a2e28", "#5a6058", "#a8b0a4"],
    board: ["#d8d2c6", "#f4f0e8", "#ffffff"],
  },
  params: {
    bounce: param(0.058, { min: 0.02, max: 0.1, step: 0.002, label: "Bounce height", doc: "How high the ball climbs between the hand and the concrete, in screen units." }),
    breath: param(1.2, { min: 0, max: 6, step: 0.05, label: "Breath" }),
  },
  parts: [
    patch({
      name: "yard",
      center: [0.5, 0.5],
      radii: [0.92, 0.72],
      edge: 0.16,
      ramp: "grass",
      rects: [
        { name: "court", x: 0.1, y: 0.14, w: 0.86, d: 0.68, ramp: "court", shade: 0.62 },
      ],
    }),
    hoop({
      name: "hoop",
      at: [0.84, 0.28],
      rise: 0.24,
      pole: "iron",
      board: "board",
      rim: "orange",
    }),
    person({
      name: "player",
      at: [0.4, 0.48],
      scale: 0.21,
      facing: 1,
      plant: "stand",
      hairCover: 0.5,
      colors: { skin: "skin", hair: "hair", torso: "rust", arm: "skin", thigh: "ink", calf: "skin", shoe: "ink", ink: "ink" },
      pose: { torso: 86, head: 84, armF: [-40, -70], armB: [-100, -110], legF: [-82, -88], legB: [-96, -90] },
      motions: [
        { type: "breathe", amp: "breath", cycles: 3 },
        { type: "dribble", bone: "armF.u", amp: 28, cycles: 8 },
        { type: "sway", amp: 1.2, cycles: 4 },
      ],
    }),
    ball({
      name: "ball",
      ramp: "orange",
      r: 0.016,
      hand: "player.handF",
      cycles: 8,
      height: "bounce",
    }),
  ],
});

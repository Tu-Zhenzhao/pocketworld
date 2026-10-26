/**
 * Three balls, one person, a rug of ground.
 * reference.jpg is a concept still, conformed to the spec rather than traced.
 * Each ball is the same cascade a third of a cycle apart.
 * The arms swing with the same count, so a hand is up when a ball leaves it.
 */
import { scene, param, patch, person, ball } from "../../src/scene.js";

export default scene({
  name: "Juggler",
  id: "juggler",
  duration: 6,
  fps: 12,
  grid: 360,
  bayer: 4,
  poster: 0.5,
  background: "#ffffff",
  light: { dir: [-0.4, -0.86], ambient: 0.34, diffuse: 0.62 },
  ramps: {
    ink: ["#241c16", "#241c16", "#4a4038"],
    ground: ["#6a7038", "#a8b060", "#d8dcb0"],
    cloth: ["#3a3a68", "#6a6aa0", "#c0c0e0"],
    skin: ["#c09070", "#f0c8aa", "#f8e4d4"],
    hair: ["#2a1c14", "#4a3428", "#6a5040"],
    hat: ["#6a3030", "#a85048", "#e0a098"],
    coral: ["#c04838", "#f07860", "#f8c0b0"],
    cream: ["#e0d2b0", "#f4ecd4", "#fffaf0"],
    teal: ["#2a6868", "#48a0a0", "#b0d8d4"],
  },
  params: {
    flight: param(0.12, { min: 0.04, max: 0.18, step: 0.002, label: "Flight", doc: "How high each ball arcs above the hands, in screen units." }),
    breath: param(1.1, { min: 0, max: 6, step: 0.05, label: "Breath" }),
  },
  parts: [
    patch({
      name: "rug",
      center: [0.5, 0.58],
      radii: [0.78, 0.56],
      edge: 0.2,
      ramp: "ground",
    }),
    person({
      name: "juggler",
      at: [0.5, 0.55],
      scale: 0.27,
      facing: 1,
      plant: "stand",
      hairCover: 0.3,
      hat: { type: "cap", ramp: "hat" },
      colors: { skin: "skin", hair: "hair", torso: "cloth", arm: "skin", thigh: "ink", calf: "cloth", shoe: "ink", ink: "ink" },
      pose: { torso: 88, head: 86, armF: [-55, -40], armB: [-70, -50], legF: [-88, -90], legB: [-92, -90] },
      motions: [
        { type: "breathe", amp: "breath", cycles: 3 },
        { type: "swing", bone: "armF.u", amp: 42, cycles: 3, phase: 0 },
        { type: "swing", bone: "armB.u", amp: 42, cycles: 3, phase: 3.1416 },
        { type: "swing", bone: "armF.l", amp: 18, cycles: 3, phase: 0.4 },
        { type: "swing", bone: "armB.l", amp: 18, cycles: 3, phase: 3.5 },
      ],
    }),
    ball({ name: "a", ramp: "coral", r: 0.018, pattern: "cascade", hands: ["juggler.handB", "juggler.handF"], phase: 0, cycles: 3, flight: "flight" }),
    ball({ name: "b", ramp: "cream", r: 0.018, pattern: "cascade", hands: ["juggler.handB", "juggler.handF"], phase: 0.333, cycles: 3, flight: "flight" }),
    ball({ name: "c", ramp: "teal", r: 0.018, pattern: "cascade", hands: ["juggler.handB", "juggler.handF"], phase: 0.666, cycles: 3, flight: "flight" }),
  ],
});

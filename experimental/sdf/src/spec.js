/**
 * The pocket-world spec, measured from the reference series and then
 * standardized so every scene looks like it belongs together.
 *
 * Fishing frame (1474×1432, ~1:1):
 *   content bbox x 112–1388, y 412–1062 → 86% of width, 43% of height
 *   margins L 7.9%, R 5.8%, T 30%, B 26%
 *   long pier edge ~34° from horizontal (atan(1/1.48))
 *   dominant colors after video compression: #5a93a0 water, #111215 ink,
 *   #8cb8c0 foam, #183040 deep water, #b89058 wood
 *
 * Basketball (1450×1346): content ~88% × 53%
 * Juggler (1450×1346): content ~58% × 47% (one figure, more margin)
 * Market stall (1786×1658): content ~84% × 59%
 *
 * The long edges sit between true isometric (30°) and 2:1 dimetric
 * (atan(1/2) = 26.6°). We standardize on 2:1 dimetric — the pixel-art
 * cousin of that measurement — and keep people screen-vertical.
 *
 * See skills/pocketworld/spec.md for the prose version an agent should follow.
 */

/** One world unit along X moves 2px right and 1px down; Y is the mirror. */
export const pocketCamera = {
  origin: [0.5, 0.4],
  axisX: [0.3, 0.15],
  axisY: [-0.3, 0.15],
};

export const SPEC = {
  aspect: 1,
  grid: 360,
  fps: 12,
  bayer: 4,
  duration: [8, 12],
  projection: "2:1 dimetric",
  axisAngleDeg: Math.atan(0.5) * (180 / Math.PI),
  fill: { width: [0.58, 0.86], height: [0.4, 0.6] },
  margins: { left: 0.08, right: 0.08, top: 0.18, bottom: 0.16 },
  palette: { target: 16, hardMax: 24 },
  background: "#ffffff",
  light: "upper left",
  camera: pocketCamera,
};

/** Hex and GLSL color helpers. Palette discipline lives in the scene; this only converts. */

export function hexToRgb(hex) {
  let h = String(hex).trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) throw new Error(`Bad color "${hex}"`);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) throw new Error(`Bad color "${hex}"`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function glslVec(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => (c / 255).toFixed(4));
  return `vec3(${r}, ${g}, ${b})`;
}

/** Repeat the last stop so every ramp handed to the shader has 3 or 4 colors. */
export function normalizeRamp(colors) {
  if (!colors || !colors.length) throw new Error("Empty ramp");
  const out = colors.slice(0, 4);
  while (out.length < 3) out.push(out[out.length - 1]);
  return out;
}

/**
 * Pocketworld's fragment-shader library.
 * One idea: a shade in 0..1, then a Bayer threshold, then a palette ramp.
 * Never mix two arbitrary RGB colors — that invents hues the palette doesn't have.
 * Coverage is hard (a pixel is in or out). The dither is the only softness.
 */
export const LIB = /* glsl */ `
struct Pix {
  vec3 rgb;
  vec2 p;
  vec2 g;
  vec2 cell;
  float z;
  float th;
  int mat;
};

uniform vec2 uRes;
uniform float uGrid;
uniform float uTime;
uniform float uDuration;
uniform float uBayer;
uniform vec2 uOrigin;
uniform vec2 uAxisX;
uniform vec2 uAxisY;
uniform vec3 uBg;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return clamp(bayer2(a * 0.5) * 0.25 + bayer2(a), 0.0, 0.999);
}
float bayer8(vec2 a) {
  return clamp(bayer4(a * 0.5) * 0.25 + bayer2(a), 0.0, 0.999);
}
float thresholdOf(vec2 cell) {
  return uBayer > 6.0 ? bayer8(cell) : bayer4(cell);
}

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  return 0.55 * noise(p) + 0.30 * noise(p * 2.1 + 3.1) + 0.15 * noise(p * 4.3 + 7.2);
}

vec2 dir(float deg, float len) {
  float a = radians(deg);
  return vec2(cos(a), -sin(a)) * len;
}
float faceAngle(float localDeg, float facing) {
  return facing >= 0.0 ? localDeg : (180.0 - localDeg);
}
float easeSmooth(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float easeIn(float x) { x = clamp(x, 0.0, 1.0); return x * x; }
float easeOut(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - (1.0 - x) * (1.0 - x); }
float easeBump(float x) { x = clamp(x, 0.0, 1.0); return sin(x * 3.14159265); }

vec2 toScreen(vec2 g, float h) {
  return uOrigin + uAxisX * g.x + uAxisY * g.y + vec2(0.0, -h);
}
vec2 toGround(vec2 p, float h) {
  vec2 q = p - uOrigin + vec2(0.0, h);
  float d = uAxisX.x * uAxisY.y - uAxisY.x * uAxisX.y;
  return vec2(q.x * uAxisY.y - uAxisY.x * q.y, uAxisX.x * q.y - uAxisX.y * q.x) / d;
}

bool inPara(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 ab = b - a;
  vec2 ac = c - a;
  vec2 ap = p - a;
  float d = ab.x * ac.y - ab.y * ac.x;
  if (abs(d) < 1e-8) return false;
  float u = (ap.x * ac.y - ap.y * ac.x) / d;
  float v = (ab.x * ap.y - ab.y * ap.x) / d;
  return u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0;
}
bool inRect(vec2 g, vec2 o, vec2 s) {
  return g.x >= o.x && g.x <= o.x + s.x && g.y >= o.y && g.y <= o.y + s.y;
}

float shadeForm(vec2 n) {
  float lenN = length(n);
  vec2 nn = lenN > 1e-5 ? n / lenN : vec2(0.0, -1.0);
  vec2 L = vec2(u_lightX, u_lightY);
  float lenL = length(L);
  L = lenL > 1e-5 ? L / lenL : vec2(-0.4, -0.9);
  float form = dot(nn, L) * 0.5 + 0.5;
  float hi = clamp(u_ambient + u_diffuse, 0.0, 1.0);
  return mix(clamp(u_ambient, 0.0, 1.0), hi, clamp(form, 0.0, 1.0));
}
float jointAO(float h) {
  return mix(0.78, 1.0, smoothstep(0.0, 0.22, min(h, 1.0 - h)));
}

vec3 ramp3(vec3 a, vec3 b, vec3 c, float v, float th) {
  float x = clamp(v, 0.0, 1.0) * 2.0;
  float i = floor(x);
  if (fract(x) > th) i += 1.0;
  if (i < 0.5) return a;
  if (i < 1.5) return b;
  return c;
}
vec3 ramp4(vec3 a, vec3 b, vec3 c, vec3 d, float v, float th) {
  float x = clamp(v, 0.0, 1.0) * 3.0;
  float i = floor(x);
  if (fract(x) > th) i += 1.0;
  if (i < 0.5) return a;
  if (i < 1.5) return b;
  if (i < 2.5) return c;
  return d;
}

void cover(inout Pix pix, float z, vec3 col) {
  if (z >= pix.z) {
    pix.z = z;
    pix.rgb = col;
  }
}
void stipple(inout Pix pix, vec3 col, float amount) {
  if (amount > pix.th) pix.rgb = col;
}

float hitCapsule(vec2 p, vec2 a, vec2 b, float r, out vec2 n, out float h) {
  vec2 ba = b - a;
  float L2 = dot(ba, ba);
  h = L2 < 1e-8 ? 0.0 : clamp(dot(p - a, ba) / L2, 0.0, 1.0);
  vec2 o = p - (a + ba * h);
  float dist = length(o);
  if (dist > r) { n = vec2(0.0, -1.0); return -1.0; }
  n = dist > 1e-5 ? o / dist : vec2(0.0, -1.0);
  return dist;
}
float hitTaper(vec2 p, vec2 a, vec2 b, float r0, float r1, out vec2 n, out float h) {
  vec2 ba = b - a;
  float L2 = dot(ba, ba);
  h = L2 < 1e-8 ? 0.0 : clamp(dot(p - a, ba) / L2, 0.0, 1.0);
  float r = mix(r0, r1, h);
  vec2 o = p - (a + ba * h);
  float dist = length(o);
  if (dist > r) { n = vec2(0.0, -1.0); return -1.0; }
  n = dist > 1e-5 ? o / dist : vec2(0.0, -1.0);
  return dist;
}
float hitDisc(vec2 p, vec2 c, float r, out vec2 n) {
  vec2 o = p - c;
  float dist = length(o);
  if (dist > r) { n = vec2(0.0, -1.0); return -1.0; }
  n = dist > 1e-5 ? o / dist : vec2(0.0, -1.0);
  return dist;
}

float rings(vec2 p, vec2 c, float period, float phase, float reach) {
  float rt = mod(uTime + phase, period);
  float R = (rt / period) * reach;
  vec2 d = (p - c) * vec2(1.0, 1.65);
  float w = 1.25 / uGrid;
  float a = 1.0 - rt / period;
  return a * (1.0 - smoothstep(0.0, w, abs(length(d) - R)));
}

vec2 reflectPoint(vec2 p, vec2 foot, float squash) {
  float dy = p.y - foot.y;
  if (dy <= 0.002) return vec2(-9.0);
  float wob = sin(p.y * 150.0 + uTime / uDuration * 6.2831853 * 3.0) * (1.6 / uGrid) * u_shimmer;
  return vec2(p.x - wob, foot.y - dy / max(squash, 0.25));
}

Pix openPix() {
  Pix pix;
  vec2 cell = floor(gl_FragCoord.xy / uRes * uGrid);
  pix.cell = cell;
  pix.p = (cell + 0.5) / uGrid;
  pix.p.y = 1.0 - pix.p.y;
  pix.th = thresholdOf(cell);
  pix.rgb = uBg;
  pix.z = 0.0;
  pix.mat = 0;
  pix.g = toGround(pix.p, 0.0);
  return pix;
}

void drawIsoBox(inout Pix pix, vec2 g0, vec2 g1, float rise, float thick,
                vec3 t0, vec3 t1, vec3 t2, vec3 k0, vec3 k1, vec3 k2,
                float plankFreq, float plankAlongY, float z) {
  vec2 a = toScreen(vec2(g0.x, g0.y), rise);
  vec2 b = toScreen(vec2(g1.x, g0.y), rise);
  vec2 c = toScreen(vec2(g0.x, g1.y), rise);
  if (inPara(pix.p, a, b, c)) {
    float shade = 0.86;
    if (plankFreq > 0.5) {
      vec2 gt = toGround(pix.p, rise);
      float u = plankAlongY > 0.5 ? gt.y : gt.x;
      if (fract(u * plankFreq) < 0.14) shade = 0.22;
      else shade += (hash21(floor(gt * plankFreq)) - 0.5) * 0.1;
    }
    cover(pix, z + 0.03, ramp3(t0, t1, t2, shade, pix.th));
  }
  if (thick <= 0.001) return;
  vec2 x0 = toScreen(vec2(g1.x, g0.y), rise);
  vec2 x1 = toScreen(vec2(g1.x, g1.y), rise);
  vec2 x2 = toScreen(vec2(g1.x, g0.y), max(0.0, rise - thick));
  if (inPara(pix.p, x0, x1, x2)) cover(pix, z + 0.02, ramp3(k0, k1, k2, 0.58, pix.th));
  vec2 y0 = toScreen(vec2(g0.x, g1.y), rise);
  vec2 y1 = toScreen(vec2(g1.x, g1.y), rise);
  vec2 y2 = toScreen(vec2(g0.x, g1.y), max(0.0, rise - thick));
  if (inPara(pix.p, y0, y1, y2)) cover(pix, z + 0.01, ramp3(k0, k1, k2, 0.34, pix.th));
}

void drawPost(inout Pix pix, vec2 g, float rise0, float rise1, float halfW, vec3 c0, vec3 c1, vec3 c2, float z) {
  vec2 top = toScreen(g, rise1);
  vec2 bot = toScreen(g, rise0);
  float y0 = min(top.y, bot.y);
  float y1 = max(top.y, bot.y);
  if (pix.p.y < y0 || pix.p.y > y1) return;
  if (abs(pix.p.x - top.x) > halfW) return;
  float shade = pix.p.x < top.x - halfW * 0.15 ? 0.78 : 0.36;
  cover(pix, z, ramp3(c0, c1, c2, shade, pix.th));
}

void drawBezier(inout Pix pix, vec2 a, vec2 ctrl, vec2 b, float w, vec3 col, float z) {
  vec2 prev = a;
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 6.0;
    vec2 q = mix(mix(a, ctrl, t), mix(ctrl, b, t), t);
    vec2 n; float h;
    if (hitCapsule(pix.p, prev, q, w, n, h) >= 0.0) cover(pix, z, col);
    prev = q;
  }
}

float ellipseCov(vec2 g, vec2 center, vec2 radii, float edgeAmp) {
  vec2 d = (g - center) / max(radii, vec2(0.001));
  float e = length(d) + (fbm(g * 3.1) - 0.5) * edgeAmp;
  return smoothstep(1.04, 0.78, e);
}
`;

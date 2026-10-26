/**
 * One fragment shader, two profiles.
 *
 * Shared pieces are the motion library: Bayer dither, OKLab, noise, rain,
 * cloth breeze, motes, and a small steam puff. Each profile's main() is the
 * approved composite. Time is continuous. The dither is what makes motion
 * step from cell to cell.
 *
 * Bayer is 4×4. That is the locked look (the approved bus stop and rooftop).
 */

const shared = `
float bayer2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}
vec3 oklab(vec3 c){
  c = mix(c/12.92, pow((c+.055)/1.055, vec3(2.4)), step(.04045, c));
  vec3 l = pow(mat3(.4122214708,.2119034982,.0883024619, .5363325363,.6806995451,.2817188376,
                    .0514459929,.1073969566,.6299787005) * c, vec3(1./3.));
  return mat3(.2104542553,1.9779984951,.0259040371, .7936177850,-2.4285922050,.7827717662,
              -.0040720468,.4505937099,-.8086757660) * l;
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hash1(float n){return fract(sin(n*91.345)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
vec4 fetch(sampler2D s, vec2 c){ return texelFetch(s, ivec2(clamp(c,vec2(0),vec2(G-1.))), 0); }
vec4 samp(sampler2D s, vec2 p){ return texture(s, p/G); }
float ease(float x){ return x*x*(3.-2.*x); }

// Steam / smoke. Three puffs, a 4s rise, seamless when ph = TAU * t / loop.
// Not called by the approved scenes. Mix it in before quantize:
//   col = mix(col, vec3(.93,.94,.95), steam(p, origin, ph) * .35 * mask);
float steam(vec2 p, vec2 origin, float ph){
  float mo = 0.;
  for(int i=0;i<3;i++){
    float fi = float(i);
    float age = fract(ph / TAU * 3. + fi / 3.);
    vec2 q = origin + vec2(1.6*sin(ph*2. + fi*2.1), -age*16.);
    float w = sin(3.14159265*age);
    vec2 e = p - q;
    mo = max(mo, exp(-dot(e,e)/(1.4+age*5.5))*w);
  }
  return mo;
}
`;

const rainLayer = `
// Soft rain streak. u is constant along a streak. A drop travels exactly \`rep\`
// cells per loop, so the seam is invisible. rep/slot must be an integer.
float rainLayer(vec2 p, float t, float slope, float lane, float len, float rep, float slot, float dens, float wid, float seed){
  float u = p.x + p.y*slope;
  float li = floor(u/lane);
  float off = (hash1(li*3.7+seed)-.5)*(lane-2.*wid);
  float du = (u - (li+.5)*lane - off)/sqrt(1.+slope*slope);
  float across = exp(-du*du/(2.*wid*wid));
  if(across < .02) return 0.;
  float v = p.y - rep/uLoop*t + hash1(li*7.1+seed)*rep;
  float k = mod(floor(v/slot), rep/slot);
  if(hash(vec2(li+seed*13., k)) > dens) return 0.;
  float f = slot*(1.-fract(v/slot));
  float L = len*(.7+.6*hash(vec2(k,li+3.)));
  float along = smoothstep(0.,.9,f) * exp(-f/L);
  return across*along;
}
`;

const clothLayer = `
// Breeze on one cloth or foliage piece.
// s: along the anchor line (0..1). The phase travels along that line.
// 4s breath (3 per 12s loop) + 2s harmonic + a 12s gust.
float breeze(float s, float ph, float phase){
  return (sin(ph*3. - TAU*.65*s + phase) + .22*sin(ph*6. - TAU*1.3*s + 2.*phase + 1.)) * (.82 + .18*sin(ph + phase*.7));
}
float breezeD(float s, float ph, float phase){
  return cos(ph*3. - TAU*.65*s + phase);
}
// f is the cfield texel: w, s, amp, phase, packed. See prep.
vec2 clothDisp(vec4 f, float ph, out float fold){
  float w = f.r*1.15, s = f.g*1.4 - .2, A = f.b*4., phs = f.a*TAU;
  float b = breeze(s, ph, phs);
  float ww = pow(clamp(w,0.,1.15), 1.35);
  vec2 n = normalize(vec2(-.9, .45));
  fold = breezeD(s, ph, phs)*w;
  return A*ww*b*n + vec2(0., -.35*A*w*w*pow(abs(b), 1.5));
}
float moteField(vec2 p, float ph){
  float mo = 0.;
  for(int i=0;i<8;i++){ if(i>=uNM) break; float fi=float(i);
    vec2 cen = uMote[i] + vec2(5.*sin(ph + fi*1.7) + 2.*sin(ph*2.+fi), -4.*cos(ph + fi*1.7) + 1.5*cos(ph*3.+fi*2.3));
    float tw = .5+.5*sin(ph*3. + fi*2.1);
    vec2 e = p - cen; mo = max(mo, exp(-dot(e,e)/(2.*.55*.55))*tw); }
  return mo;
}
`;

const rainMain = `
void main(){
  vec2 c = floor(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * G);
  vec2 p = c + .5;
  float t = uT, ph = TAU*t/uLoop;
  vec4 m = fetch(uMask, c), m2 = fetch(uMask2, c), m3 = fetch(uMask3, c);
  float wet = m.r, rainAmt = m.g, glow = m.b, detail = m2.g, outl = m2.b, covBig = m3.b;

  vec3 col = fetch(uBase, c).rgb; float cov = m2.r;
  // umbrella sway, 4s, about the hand. His shoulders rise on a 4s breath.
  float sw = radians(1.7)*sin(ph*3. + .6);
  vec2 d = p - uPivot; vec2 pu = uPivot + mat2(cos(sw),-sin(sw),sin(sw),cos(sw))*d;
  float ua = samp(uMask3, pu).r, ua0 = m3.r;
  float br = .5-.5*cos(ph*3. + 2.2); br = ease(br);
  vec2 pm = p + vec2(0., .45*br*samp(uMask3, p).g);
  float ma = samp(uMask3, pm).g, ma0 = m3.g;
  if(max(max(ua,ua0),max(ma,ma0)) > .001){
    vec3 bg = fetch(uFill, c).rgb; float bgc = fetch(uMask4, c).r;
    vec3 cc = bg; float cv = bgc;
    float mA = clamp(ma*3.,0.,1.);
    cc = mix(cc, samp(uBase, pm).rgb, mA); cv = mix(cv, samp(uMask2, pm).r, mA);
    float uA = clamp(ua*2.,0.,1.);
    cc = mix(cc, samp(uBase, pu).rgb, uA); cv = mix(cv, samp(uMask2, pu).r, uA);
    float inf = clamp(max(max(ua,ua0),max(ma,ma0))*4.,0.,1.);
    col = mix(col, cc, inf); cov = mix(cov, cv, inf);
    outl *= 1.-inf;
  }

  // lamp glow breathes, 6s
  float lb = .5+.5*sin(ph*2. - 1.);
  col = mix(col, vec3(1.,.86,.58), glow*(.06+.10*lb)*(1.-detail));

  // water shimmer. Noise walks a circle at loop harmonics 1, 2 and 4.
  if(wet > .02){
    vec2 q = p*vec2(.16,.36);
    float n1 = noise(q + 2.5*vec2(cos(ph), sin(ph)));
    float n2 = noise(q*1.9 + 7.3 + 1.6*vec2(cos(ph*2.+1.), sin(ph*2.+1.)));
    float n3 = noise(p*vec2(.45,.9) + 3.1 + 1.2*vec2(cos(ph*4.), sin(ph*4.)));
    float sp = smoothstep(.60,.86, .55*n1 + .3*n2 + .15*n3);
    col = mix(col, vec3(.80,.86,.93), wet*sp*.32);
    float wob = noise(vec2(p.y*.3, 1.7) + 2.*vec2(cos(ph*2.), sin(ph*2.))) - .5;
    col *= 1. + wet*glow*wob*.22;
  }

  // ripples. 13 heartbeats per loop (every 0.92s) plus small rings on a 3s cycle.
  float rip = 0.;
  if(wet > .4){
    for(int i=0;i<21;i++){
      float fi = float(i);
      float t0, life, rmax;
      if(i<13){ t0 = fi*uLoop/13.; life = 2.4; rmax = 9.; }
      else    { t0 = mod(fi*1.37, 3.); life = 1.6; rmax = 5.; }
      float per = i<13 ? uLoop : 3.;
      float age = mod(t - t0, per);
      if(age > life) continue;
      int pi = i<13 ? i : 13 + (i-13)*3 + int(mod(floor((t - t0)/3.), 4.)) % 3;
      vec2 cen = uRip[pi % 40];
      float s = age/life;
      float r = .8 + rmax*(1.-pow(1.-s,3.));
      vec2 e = (p - cen)*vec2(1.,2.2);
      float dd = length(e), gr = length(e*vec2(1.,2.2))/max(dd,1e-3);
      float ring = exp(-pow((dd-r)/gr,2.)/(2.*.35*.35));
      float ring2 = exp(-pow((dd-.55*r)/gr,2.)/(2.*.35*.35))*.45;
      float a = pow(1.-s,2.)*smoothstep(0.,.06,s);
      rip = max(rip, (ring+ring2)*a);
    }
    col = mix(col, vec3(.83,.88,.94), clamp(rip,0.,1.)*.75*smoothstep(.4,.8,wet));
  }

  // drips: bead, gravity fall, splash. Period is 6, 4 or 3s.
  float fx = 0.;
  for(int i=0;i<12;i++){
    if(i>=uND) break;
    vec3 dp = uDrip[i]; float fi = float(i);
    float per = uLoop/float(2 + int(hash1(fi+.3)*3.));
    float age = mod(t + hash1(fi)*per, per);
    float hang = 1.1, fall = .42*sqrt(dp.z/40.);
    float y, a, sm;
    if(age < hang){ y = 0.; a = ease(age/hang)*.7; sm = .5; }
    else if(age < hang+fall){ float s=(age-hang)/fall; y = dp.z*s*s; a = .9; sm = .5+2.*s; }
    else { a = 0.; y = 0.; sm = .5; }
    if(a > 0.){
      vec2 dv = p - (dp.xy + vec2(0., y));
      float g = exp(-dv.x*dv.x/(2.*.32)) * exp(-pow(max(0.,-dv.y)/sm + max(0.,dv.y)/.6, 2.)*.5);
      float lum = dot(col, vec3(.3,.59,.11));
      vec3 dc = lum > .6 ? vec3(.40,.47,.57) : vec3(.88,.92,.97);
      col = mix(col, dc, g*a);
      fx = max(fx, g*a);
    }
    float sa = age - hang - fall;
    if(sa > 0. && sa < .5){
      vec2 gp = dp.xy + vec2(0., dp.z);
      float dd = length((p-gp)*vec2(1.,2.1)), rr = .5 + 3.5*(1.-pow(1.-sa/.5,2.));
      float ring = exp(-pow(dd-rr,2.)/.18)*(1.-sa/.5);
      col = mix(col, vec3(.83,.88,.94), ring*.7);
    }
  }

  float r = 0.;
  float rz = rainAmt * smoothstep(.15,.7,covBig);
  if(rz > .01){
    r = max(r, .55*rainLayer(p,t,.42, 6.,5., 240., 20., .55, .38, 1.));
    r = max(r, .75*rainLayer(p,t,.42, 9.,7., 336., 28., .5, .45, 2.));
    r = max(r, .95*rainLayer(p,t,.42,13.,10.,432., 36., .45, .55, 3.));
    r *= smoothstep(0.,.7,rz);
    vec3 rc = mix(vec3(.80,.85,.92), vec3(1.,.90,.72), glow*.8);
    col = mix(col, rc, r);
  }

  float th = bayer4(c);
  float spread = uSpread*mix(1., .45, detail)*(1.-outl)*uDither;
  vec3 L = oklab(clamp(col,0.,1.)); L.x += (th-.5)*spread;
  int best = 0; float bd = 1e9;
  for(int i=0;i<24;i++){ if(i>=uN-3) break;
    vec3 e = (L - uLab[i])*vec3(1.,2.,2.); float dd = dot(e,e);
    if(dd < bd){ bd = dd; best = i; } }
  vec3 outc = uPal[best];
  // Paper test. Drips can carry a few cells into the fringe. Rain on paper is a faint speck.
  if(max(cov, fx*.9) < mix(.1, .9, th)*uDither + .5*(1.-uDither)){
    outc = uPal[uN-3];
    if(r > .22 && th < r*1.2) outc = uPal[uN-2];
  }
  o = vec4(outc, 1.);
}
`;

const laundryMain = `
void main(){
  vec2 c = floor(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * G);
  vec2 p = c + .5;
  float t = uT, ph = TAU*t/uLoop;
  vec4 m = fetch(uMask, c), m2 = fetch(uMask2, c), m3 = fetch(uMask3, c);
  float detail = m.g, inCloth = m.a;
  vec3 col = fetch(uBase, c).rgb; float cov = m.r;
  vec3 bg = fetch(uFill, c).rgb; float bgc = m.b;

  if(m3.g > .004){
    vec4 sf = samp(uSfield, p);
    float b = breeze(sf.g*1.4-.2, ph, sf.a*TAU);
    vec2 d = sf.b*4.*sf.r*b*normalize(vec2(-.9,.45));
    float S0 = max(m3.r,.35), S1 = max(samp(uMask3, p - d).r,.35);
    col = mix(col, col/S0*S1, m3.g);
  }

  if(inCloth > .5){
    vec4 f = samp(uCfield, p);
    float fold; vec2 d = clothDisp(f, ph, fold);
    vec4 cl = samp(uCloth, p - d);
    float a = smoothstep(.25,.75, cl.a);
    vec3 cc = cl.rgb/max(cl.a,1e-3);
    cc *= 1. + .08*fold;
    vec4 cl0 = fetch(uCloth, c);
    if(max(cl0.a, cl.a) > .01){
      col = mix(bg, cc, a); cov = mix(bgc, 1., a);
    }
    col = mix(col, fetch(uBase,c).rgb, m3.b); cov = mix(cov, m.r, m3.b);
  }

  // creature: 3s breath (4 per loop), one ear flick per loop
  if(m2.g > .001 || m2.a > .001 || m2.r > .001){
    float br = ease(.5-.5*cos(ph*4.));
    float et = mod(t - 7.4, uLoop), ef = et < .5 ? sin(3.14159*et/.5) : 0.;  ef = ef*ef;
    vec2 q = p + vec2(0., .38*br*m2.g) + vec2(.25*ef, .55*ef)*m2.a;
    float ca = clamp(samp(uMask2, q).r*1.6, 0., 1.);
    float ca0 = m2.r;
    if(max(ca, ca0) > .01){
      vec3 cc = mix(bg, samp(uBase, q).rgb, ca);
      col = mix(col, cc, clamp(max(ca,ca0)*3.,0.,1.));
    }
  }

  float mo = moteField(p, ph);
  col = mix(col, vec3(1.,.97,.88), mo*.45*smoothstep(.3,.8,cov));

  float th = bayer4(c);
  float spread = uSpread*mix(1., .45, detail)*uDither;
  vec3 L = oklab(clamp(col,0.,1.)); L.x += (th-.5)*spread;
  int best = 0; float bd = 1e9;
  for(int i=0;i<24;i++){ if(i>=uN-1) break;
    vec3 e = (L - uLab[i])*vec3(1.,2.,2.); float dd = dot(e,e);
    if(dd < bd){ bd = dd; best = i; } }
  vec3 outc = uPal[best];
  if(cov < mix(.1, .9, th)*uDither + .5*(1.-uDither)) outc = uPal[uN-1];
  o = vec4(outc, 1.);
}
`;

const vert = `#version 300 es
in vec2 a;
void main(){gl_Position=vec4(a,0,1);}
`;

const rainFrag = `#version 300 es
precision highp float;
uniform sampler2D uBase, uFill, uMask, uMask2, uMask3, uMask4;
uniform float uT, uLoop, G, uSpread, uDither;
uniform vec3 uPal[24], uLab[24];
uniform int uN;
uniform vec3 uDrip[12];
uniform int uND;
uniform vec2 uRip[40];
uniform vec2 uPivot, uRes;
out vec4 o;
const float TAU = 6.2831853;
${shared}
${rainLayer}
${rainMain}
`;

const laundryFrag = `#version 300 es
precision highp float;
uniform sampler2D uBase, uFill, uCloth, uCfield, uMask, uMask2, uMask3, uSfield;
uniform float uT, uLoop, G, uSpread, uDither;
uniform vec3 uPal[24], uLab[24];
uniform int uN;
uniform vec2 uMote[8];
uniform int uNM;
uniform vec2 uRes;
out vec4 o;
const float TAU = 6.2831853;
${shared}
${clothLayer}
${laundryMain}
`;

export const shaders = {
  vert,
  rain: rainFrag,
  laundry: laundryFrag,
};

export const textureNames = {
  rain: ['base', 'fill', 'mask', 'mask2', 'mask3', 'mask4'],
  laundry: ['base', 'fill', 'cloth', 'cfield', 'mask', 'mask2', 'mask3', 'sfield'],
};

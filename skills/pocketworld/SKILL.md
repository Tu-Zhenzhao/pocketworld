# pocketworld

A pocket world is one looping diorama, drawn by one WebGL2 fragment shader. You author it as a JS module of named parts and named knobs. The compiler turns that into the shader. You never hand-edit the shader unless a part has no primitive for what you need, and then you add a short `glsl` snippet.

Read `spec.md` for the look and `reference-prompt.md` for the image prompt. This file is the workflow.

## The path

```
one-line idea
  → fill reference-prompt.md and make (or receive) a still
  → checklist the still
  → examples/<id>/scene.js + reference.jpg
  → render a poster frame
  → compare it with the reference
  → render a few more times, including near the loop seam
  → retune knobs when a person asks in plain language
```

Study loops that inspired the series are not in the repo. Do not copy them, and do not feed their frames to an image model.

## 1. Make the reference

Fill `reference-prompt.md` with the user's scene. Generate it, or ask the human to. Save the chosen image as `examples/<id>/reference.jpg`.

Image models like smooth 3D and full-bleed framing. That is expected. The checklist decides what you keep.

### Checklist

Accept and build when most of these hold:

- Square, or close, on a white field.
- One cluster of subject, not a comic page and not a cropped close-up.
- Long edges slope about 2 across for 1 down. People and posts are vertical.
- A handful of flat colors. Light feels like it comes from the upper left.
- You can point at every person and say where they look.

Regenerate, and say why, when:

- The camera is a front view, a perspective photo, or equal-angle isometric (1:1 in x and y).
- The subject is cut by the frame.
- There are several scenes in one image.

A smooth, slightly full-bleed concept (the rain bus stop reference is one) is still usable. Keep its composition, its palette, and who looks at whom. Draw it again in the spec: more white margin, Bayer fade, 2:1 camera, 16-ish colors, no bloom. Write that in a comment at the top of the scene file so the next edit doesn't try to trace the JPEG.

If the human insists on an off-spec image, build in the canonical camera anyway and treat the upload as a composition and color reference only. Tell them which checks failed.

## 2. Block the scene out

Copy the shape of `examples/juggler/scene.js` (small) or `examples/rain-bus-stop/scene.js` (ground, people, weather).

```js
import { scene, param, patch, person } from "../../src/scene.js";

export default scene({
  name: "A name a person would say",
  id: "kebab-case",
  duration: 10,
  fps: 12,
  grid: 360,
  bayer: 4,
  poster: 2,
  background: "#ffffff",
  light: { dir: [-0.45, -0.8], ambient: 0.3, diffuse: 0.68 },
  ramps: { /* 3 stops each, all from one list of ≤16 colors */ },
  params: { /* knobs. see below */ },
  parts: [ /* back to front doesn't matter; z is in the emitter */ ],
});
```

Order of work:

1. Sample the palette from the reference. Write the hex list in a comment. Ramps only borrow from that list. Target 16, stop at 24, white is the background and usually not a ramp stop.
2. One `patch`. Center and radii so the vignette lands in the spec's fill (roughly 60–80% wide, 40–55% tall). `edge` is the dithered fade into white.
3. Big shapes: `rects` on the patch for a road or a court, `slab` / `shelter` / `post` for structures.
4. People. Scale around 0.15–0.2 reads at grid 360. Smaller and the joints vanish. Larger and they stop being a diorama.
5. Props on joints: umbrella, rod, ball.
6. Motion last, and only the motion the scene is about.

`node cli/render.js compile examples/<id>/scene.js` prints every knob and writes the shader. A compile error names the line.

### Coordinates

Screen Y grows downward. World +X goes screen right-and-down. World +Y goes screen left-and-down. Height goes up.

A person's `at` is their hip, in ground units. `plant: "stand"` lifts the hip by about half the scale. `plant: "seat"` uses `seatRise`, which must match the bench or the deck or they float.

### Pose

Degrees in the character's own frame, before mirroring:

| degrees | meaning |
|---|---|
| 90 | up |
| 0 | character's right |
| -90 | down |

`facing: 1` looks toward screen right. `facing: -1` mirrors, and the screen angle becomes `180 - local`. A large negative local head angle on a mirrored person throws the head off the neck. For a seated bow toward screen left, keep the local head near 80 and subtract a little (`"84 - u_hisBow * 8"`), with `facing: -1`.

`armF` and `legF` are the front limbs, drawn over the body. `handF` is the prop hand. A pose field may be a number or a GLSL expression string (`"88 - u_herTurn * 0.5"`).

`gaze: { x, y }` shifts the eyes and nudges the head. Positive x looks to the character's right. Each component may be a param name. Around `1` is a clear look; past `1.2` the eyes leave the face.

### Parts

| kind | what you set |
|---|---|
| `patch` | `center`, `radii`, `edge`, `ramp`. `water: true` makes the whole ellipse wet. `rects: [{ x, y, w, d, ramp, shade, wet }]`. One patch per scene. |
| `slab` | deck or box. `at`, `w`, `d`, `rise`, `skirt`, `planks`, `plankAxis`, `zBias` |
| `post` | `at`, `rise`, `half` (screen half-width), `ramp` |
| `shelter` | `at`, `w`, `d`, `rise`, `seatRise`, ramps `roof` `iron` `wood`. Draws posts, roof, bench, eave drips. |
| `person` | `at`, `scale`, `facing`, `plant`, `seatRise`, `colors`, `pose`, `motions`, optional `coat`, `hat`, `gaze`, `hairCover` |
| `umbrella` | `hand: "her.handF"`, `over: "her"` so the canopy sits on the head, `radius`, `tilt`, `sway` (number, or a param name), `ramp` |
| `lamp` | `at`, `rise`, `pool: [rx, ry]`, `streak`, `glow` (number or param, default `lampGlow`) |
| `rain` | `density` (number or param, default `rain`), `color` hex from the palette, `angle` |
| `ball` | `pattern: "bounce"` with `hand` and `height`, or `"cascade"` with `hands`, `phase`, `flight`. `cycles` must divide the loop cleanly. |
| `hoop` | `at`, `rise`, ramps |
| `rod` | `hand`, `tip: { at, rise }`, `sag`, `biteSag` (number or param), `biteFrom`, `biteTo`, `bobber` |
| `glsl` | `phase: "ground" \| "solid" \| "overlay"`, `source`. Ground snippets see `shade`, `which`, `pix`. |

`coat: { ramp, length, flare, calves }` replaces the torso and hides the legs. `length` is a fraction of scale below the hip. `0.36` ends above the shoes, so the shoes still show. `calves: false` keeps a long coat clean.

`hat: { type: "bucket" \| "cap", ramp }` is a crown and a brim, drawn under the eyes so the face survives.

Colors on a person are ramp names: `skin`, `hair`, `torso`, `arm`, `hand`, `thigh`, `calf`, `shoe`, `ink`.

### Knobs

`param(value, { min, max, step, label, doc })`. A knob does nothing until some part mentions it. The compiler keeps every uniform alive so the driver will not strip it, but alive is not the same as used.

Ways to use one:

- `amp: "calfSwing"` on a motion
- a pose string that contains `u_herTurn`
- `gaze: { x: "herGaze", y: 0.05 }`
- `rain({ density: "rain" })`, `lamp` glow, `ball` `height` / `flight`, `rod` `biteSag`, `umbrella` `sway`, patch `rippleAmp` / `puddle`

Craft knobs exist on every scene: `ambient`, `diffuse`, `lightX`, `lightY`, `shimmer`, `breath`, `reflection`, `drips`. Set them in `light` or override them in `params` (use `group: "craft"` if you want the playground to file them with the light).

Reserved names, do not use: `time`, `grid`, `bayer`, `res`, `duration`, `origin`, `bg`.

### Motion

Each motion has an integer `cycles` count per loop. The emitter uses `uTime / uDuration * TAU * cycles`. A speed like `sin(uTime * 1.7)` pops at the seam. Don't.

| type | bones | notes |
|---|---|---|
| `breathe` | torso, and a little on the head | also lifts the hip. Under 1° is almost still. |
| `sway` | torso, head | |
| `swing`, `dangle` | the `bone` you name | same motion, two names |
| `walk` | legs and opposite arms | in place |
| `dribble` | `armF.u` | pair its `cycles` with the ball |
| `cast` | front arm | only between `from` and `to`, so it can end before the loop |
| `keys` | one bone | `{ t, v, ease }` with ease `smooth` `in` `out` `bump` `linear`. At least two keys. |

An event that does not wrap (a splash, a bite) must finish before `duration`, and if you compute an age use `mod(uTime - start + uDuration, uDuration)` so the window never straddles the seam.

Rain scrolls 6 cycles. Shelter and umbrella drips use a 2.5s period, puddle rings a 5s period. Both divide a 10s loop. If you change the duration, change the periods so they still divide it.

Z, if you are debugging overlap: ground is 10, objects sit near `20 + x + y`, people are `20.55 + x + y` so they win against a bench, the umbrella is 42, rain and drips paint last with no z. A shelter roof is higher than the person. If it eats a face, shrink `d` or move the sitter toward the open side. Wet ground is `mat == 2` and is the only place reflections and the lamp pool land.

Puddles draw on the first wet rect (layer id 2) unless the whole patch is water. Put the wet rect first.

## 3. Render and compare

Headless Chrome needs SwiftShader. `cli/render.js` already launches it that way. A favicon 404 in the console is noise.

```
node cli/render.js still examples/<id>/scene.js --time 2.4 --out /tmp/frame.png --size 720
node cli/render.js compare examples/<id>/scene.js --time 2.4 --out /tmp/compare.png
node cli/render.js gif examples/<id>/scene.js --out docs/<id>.gif
node cli/render.js mp4 examples/<id>/scene.js --out docs/<id>.mp4
```

`compare` looks for `reference.png`, `reference.jpg`, or `reference.jpeg` beside the scene. Pass `--ref` to override. The reference is scaled with a soft filter and padded white. The frame stays nearest-neighbor. You are comparing composition, not pixels.

Then:

- Poster frame. Silhouette first: can you tell the action with the image squinting?
- Two more times, including one near the end of the loop (`duration - 0.1`). Rain, balls, and calves should have moved. The pose should not pop.
- People. Three tones on a coat or a sleeve, not one flat stamp. If the dark stop is missing, lower `ambient` before you add colors.
- Reflections on wet ground should be recognizable as the thing above them, stippled, a little short, shimmering.
- Count unique non-white colors. Over 24 means two ramps that should have shared a stop.

`npm run dev` opens the playground at `http://127.0.0.1:8787/playground/`. Every param is a slider. Space pauses. Saving the scene reloads the page.

## 4. When a person asks in plain language

| they say | you change |
|---|---|
| calves swing lazily | `calfSwing` down toward 14, `dangle` on `legF.l` and `legB.l`, integer cycles |
| calves fidget | `calfSwing` toward 28 |
| the reflection is too loud / too faint | `reflection`. Lower lets Bayer break it up. |
| the puddle should be darker | `puddle` |
| the lamp is colder | `lampGlow` up. The pool only hits wet ground. Move the lamp onto the road if the glow is sitting on grass. |
| more rain / almost dry | `rain` |
| she isn't looking at him | `herGaze` toward 1.1 and `herTurn` toward 14. The head string has to mention `u_herTurn` or the slider is a no-op. |
| he should bow more | `hisBow`. Keep the local head angle near 80 on a mirrored sitter. |
| they're too alive / too still | `breath`. The bus stop wants it under 1. |
| the umbrella should drift | `sway: "aParam"` on the umbrella. A number is a fixed tilt bias, not a swing. `0` is still. |
| the ball is mushy / too low | `bounce` or `flight` |
| the rod should bend when the fish is on | `rodFlex`, and `biteSag: "rodFlex"` |
| faces are flat | `ambient` 0.3, `diffuse` 0.68 |
| light from the other side | `lightX` |
| the loop pops | an oscillator whose cycle count is not an integer across `duration` |
| the sitter is floating | `seatRise` equal to the bench or the deck rise |
| the coat ate the shoes | `coat.length` down, around 0.36 |
| the roof ate his head | smaller shelter `d`, or move him toward the open edge |

Add a new named param when the ask doesn't map. Wire it in the same edit. A slider that doesn't change the picture is a bug.

## Style

- Palette discipline. One list, ramps cut from it, Bayer does the blend.
- 12 fps. Motion is a pose change between frames, not a blur.
- Aliasing is the look. Hard coverage. The dither is the only softness, and it belongs in the fade to white, in shadows, in rain, in reflections.
- White margin is part of the picture. If the vignette touches the edge, shrink `radii` or pull the camera axes in. Don't change the camera per scene unless you have a reason you can say out loud. The default 2:1 is the series.
- Secondary motion is what makes a loop watchable: breath, a dangling calf, drips, a shimmer in the reflection. The hero bus stop is the exception on purpose. There, the people are still and the rain is the motion.
- Volume comes from the ramp, not from more geometry. A capsule with three tones beats a stack of boxes.

## Detail checklist, before you call it done

- Secondary motion, and it survives the loop seam.
- Contact shadows under feet, and a cast shadow where a slab hangs over water.
- Reflections on anything marked wet. Lamp streak included, if there is a lamp.
- A dark side and a light side on every person.
- A silhouette you can name: coat, umbrella, bow, dangling legs.
- Fill inside the spec. Measure the non-white bbox.
- Palette ≤ 24, ideally around 16.
- The poster frame and a mid-loop frame both look like the reference's idea, not like a diagram of the code.

## Recipes

**Seated person, legs dangling.** `plant: "seat"`, `seatRise` matching the seat, thighs nearly horizontal (`legF: [6, -72]`), `dangle` on both lower legs with different `phase`.

**Seated person, quiet, facing someone.** Same seat. `facing: -1` if they look screen-left. Head `"84 - u_bow * 8"`. `gaze: { x: -0.4, y: "bow" }`. `breathe` at under a degree if the scene is a held moment.

**Someone standing under an umbrella, looking at the sitter.** `facing: 1` if the sitter is screen-right. Arms `armF: [18, 55]` so the hand is up. `umbrella({ hand: "her.handF", over: "her", tilt: -0.22, sway: 0 })`. Gaze x is a param defaulting near 1.1.

**Wet road and a lamp.** Patch of grass, first rect a wet road, second rect a dry pad under the shelter so the interior doesn't mirror. Lamp `at` on the road, `pool` wide enough to reach the figures' reflections. `reflection` near 0.9 when the reflection is the point of the picture.

**A bite on a line.** Bobber `dipFrom` / `dipTo` inside the loop. `biteSag` on the rod for the same window. A ground `glsl` snippet draws rings with `mod(uTime - start + uDuration, uDuration)`. An overlay snippet draws the splash for a few tenths of a second and then stops. Fish `bite` times match. See `examples/fishing/scene.js`.

**A dribble.** Ball `cycles` and the dribble motion `cycles` are the same integer. `height: "bounce"`.

**A cascade.** Three balls, `phase` 0, 0.333, 0.666, same `cycles` as the arm swings, opposite phase on the two arms. `flight: "flight"`.

## Gotchas already paid for

These failed once. They will fail again if you don't look.

- `half` is a reserved word in the shader. So are `sample`, `input`, `output`, `filter`. The post helper's half-width is `halfW`.
- Ambient at 0.48 plus a 3-stop ramp never selects the dark stop. Figures go flat. Use ~0.3.
- Mirrored head angles are not "the number you picture". Use the bow recipe.
- An umbrella without `over` hangs off the hand and reads as a cane.
- A param that nothing references does not move. Pose strings and the string fields on ball, rod, rain, lamp, gaze, and sway are the hooks.
- Shimmer, rain, bob, and breath must be integer cycles. `sin(uTime * 1.7)` looks fine until the loop restarts.
- One patch. Extra materials are rects. The wet one goes first if you want puddles.
- `seatRise` is absolute, not a fraction of the person.
- Coat length is below the hip, in fractions of scale.
- Node cannot load `src/element.js` (it registers a custom element). Scenes import `src/scene.js` only. The render page imports `src/player.js`.
- Chrome without SwiftShader reports no WebGL2. Use the CLI, don't invent a new launcher.
- Concept JPEGs are fuller and smoother than the spec. Conform. Don't chase the JPEG's anti-aliasing.

## Where things live

| path | role |
|---|---|
| `src/scene.js` | the authoring API |
| `src/compile.js` | scene → fragment shader |
| `src/glsl.js` | SDF, Bayer, ramps, camera |
| `src/player.js` | `mount(canvas, spec)` |
| `src/element.js` | `<pocket-world src="...">` |
| `src/spec.js` | the numbers |
| `cli/render.js` | still, gif, mp4, frames, compare, gallery |
| `cli/dev.js` | playground |
| `examples/*/scene.js` | the worlds |
| `examples/*/reference.jpg` | the still you built from |
| `docs/` | rendered gif and mp4 |

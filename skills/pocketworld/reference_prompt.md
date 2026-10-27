# Reference Image Standard & Prompt Guide

Before writing `scene.json` or animating layers, you need a high-quality reference image. **Generating one with an image model is the recommended path.**

The shader never redraws people or places from scratch; it animates cutouts and warps of the pixels in this image, quantizing them into a short OKLab palette with an ordered Bayer dither. If the reference still is wrong, the shader cannot fix it.

---

## 1. The Core Contract: Loose on Content, Firm on Style

You are free to depict any story, scene, or setting—a rainy bus stop, a rooftop laundry terrace, old friends playing chess under a tree, a winter campsite with a campfire, a night ramen stall, a greenhouse in morning mist.

**Pocketworld is loose on content, but firm on style.**

### What a good reference looks like:
- **Square (1:1, 1024×1024)**: The canonical coordinate system for `scene.json` and prep.
- **Isometric diorama perspective**: 2:1 dimetric perspective (ground plane recedes down-left and down-right; vertical lines stay upright; camera looks slightly down like an architectural model or diorama on a table).
- **Plain white / clean background**: Pure white paper background (`#FFFFFF`) with generous empty margins on all four sides. The diorama floats as a self-contained subject whose perimeter dissolves or fades softly into the paper.
- **Pixel-art / painterly pixel aesthetic**: Distinct, readable forms with visible material texture (wet stone, cloth, foliage, canvas, wood, water) that will translate cleanly into a 260-cell dither grid.
- **Low-saturation refined palette**: Natural watercolor/gouache tones. Muted earthy or atmospheric hues with 1–2 restrained warm or cool accent colors. Never neon or candy-colored.
- **No black outlines**: Shapes and depth must read purely through value, lighting, and color contrast—never comic ink contours or heavy dark strokes.
- **Subjects separated with clear gaps**: Figures and props have distinct negative space or clear separation so they can be isolated into clean polygon masks.
- **Moving parts drawn clearly and unoccluded**: Anything that moves later (cloth, an umbrella, a hand holding a fan, tree branches, animal ears, flames, puddles, fishing rod) must be clearly visible, delineated, and separable from whatever lies behind it.
- **No text, watermark, logo, or border**: No lettering, signatures, or decorative border cards that pollute the palette or texture atlas.

### Composition & Footprint Variety (Do not over-constrain to a square block)

User guidance:
> "在生成这些图画的时候，不要简简单单的就是限制于就是这么一个正方形区域，没有明显的边界，或者说那种淡淡的感觉，其实都很好，你看以前那个那个艺术家，角度其实一样的，但里面内容是很闲适，很风格的，有长一点儿的，有短一点儿的，有专门就是一个像舞台一样的抛球的呀，对吧？这个我觉得可以加一下，就是在skill里面提一下就行了"

**Key Principle**: Keep the identical **2:1 dimetric camera angle** and **1024×1024 square canvas on white paper margins**, but vary the diorama footprint to match the subject:
- **Square island block**: e.g., a city sidewalk curb, bus stop corner, or courtyard (`examples/rain-bus-stop`, `examples/chess-under-tree`).
- **Long strip / elongated slice**: e.g., a narrow pier, riverbank, alleyway, or shoreline.
- **Short narrow slice**: e.g., a doorway threshold, garden wall, or cafe window.
- **Small circular/oval stage or platform**: e.g., a street performer or juggler on a small round wooden stage.
- **Open vignette with soft fading perimeter**: No hard geometric ground cut; water ripples, mist, ground haze, or cobblestones gently dissolve and fade into the pure white paper without hard edges (e.g. `examples/lake-boat`, `examples/snow-campfire`).

Choose the composition that best frames the emotional rhythm and atmosphere of your scene. `check-ref` validates the 1:1 square canvas, clean white margins, low saturation, and luminance—it does not require a blocky shape.

### What is NOT acceptable:
- ❌ **Random street photos or real-life snapshots**: Photography lacks diorama isolation, contains noisy backgrounds, real-world lens distortion, and chaotic lighting that breaks inpainting and palette clustering.
- ❌ **Cluttered edge-to-edge scenes**: Backgrounds that fill the entire frame up to the borders (sky, pavement, or walls extending to the 1024×1024 edges).
- ❌ **Heavy black outlines or vector cel-shading**: Cartoony ink contours create jarring dark fringes in ordered dithering and destroy OKLab quantization.
- ❌ **Oversaturated or candy-colored palettes**: Neon colors cause harsh clipping in the shader and fail the calm, refined aesthetic.
- ❌ **Cropped subjects or occluded moving parts**: Figures cut off by canvas edges, or moving elements tangled into the background so they cannot be cleanly cut out and inpainted.

---

## 2. Fill-in-the-Blanks Prompt Template

Copy and fill this prompt for your image generator (Midjourney, DALL-E, Flux, Imagen, Stable Diffusion):

```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin.
Composition: [CHOOSE FOOTPRINT: square island block | long horizontal or diagonal strip | short narrow slice | small round stage/platform | open vignette with soft dissolving edges].
The scene is [ONE-SENTENCE SCENE SUMMARY: who, where, time of day, atmosphere].
2:1 dimetric perspective, like a miniature model on a desk: the ground recedes down-left and down-right, figures stand upright, camera looks slightly down.
Soft lighting [DAYLIGHT OR ONE PRACTICAL LAMP].
Delicate low-saturation refined palette, muted painterly watercolor tones, no black outlines, no ink contours, no comic art, no text, no watermark, no border, no frame.
Diorama perimeter fades softly into the clean white paper.
Materials: [NAME 2-4 VISIBLE MATERIALS: e.g. wet asphalt, linen cloth, stone pavers, weathered wood, pine needles, calm water].
Key accents: [1-2 RESTRAINED ACCENT COLOURS: e.g. warm amber lamp glow, dusty-rose umbrella, mustard coat].
Figures and gestures: [LIST FIGURES AND THEIR POSE/GESTURE with distinct negative space].
Moving elements: [LIST 1-3 MOVING PARTS: e.g. cloth on line, swaying umbrella, handheld fan, animal ear, campfire flame, fishing rod, ripples] clearly delineated and unoccluded with visible space around them.
Painterly pixel diorama aesthetic, airy and clean.
```

### Recommended Negative Prompt:
```text
photorealistic, photograph, real-life street photo, black outlines, heavy ink contours, comic art, cel shading, vector graphic, text, watermark, signature, logo, border, frame, card border, edge-to-edge background, sky filling frame, cropped diorama, touching borders, oversaturated, neon candy colors, 3D plastic render, high gloss.
```

---

## 3. Five Worked Examples

These prompts reflect the approved scenes in this repository:

### 1. Rain at the bus stop (`examples/rain-bus-stop`)
```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. Composition: square island block. A quiet city bus stop at dusk in the pouring rain. 2:1 dimetric perspective, like a miniature architectural model on a desk: dark asphalt ground recedes down-left and down-right, lamp post stands upright, camera slightly above. Materials: wet glistening dark grey asphalt, a simple metal shelter bench, a puddle on the pavement, a glowing amber streetlamp on a slender post. Key accents: the warm amber glow of the lamp and a muted mustard-yellow raincoat. Figures and gestures: a woman in a mustard coat holds a dusty-rose umbrella standing by the curb; a man in a grey hoodie sits on the shelter bench with head bowed quietly. Moving parts clearly visible: the rose umbrella held high above the shoulder with clear space around it, the wet ground puddle ready for raindrops and ripples, soft lamp glow. Airy, clean, delicate low-saturation refined palette, no black outlines, no text, no border. Edges fade into the white paper.
```

### 2. Rooftop laundry (`examples/rooftop-laundry`)
```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. Composition: square rooftop terrace block. A sunlit Mediterranean rooftop terrace on a breezy afternoon. 2:1 dimetric perspective, like a model on a desk: terracotta tile roof plane recedes down-left and down-right, camera slightly above. Materials: weathered pale terracotta roof tiles, whitewashed parapet wall, wooden laundry poles, clothesline string. Key accents: pale sky-blue linen shirt and crisp white bedsheets catching golden afternoon sunlight. Figures and gestures: a young woman in a simple summer dress stands by the parapet gazing out; a sleepy ginger cat curled up on a warm sunlit stone ledge. Moving parts clearly visible and unoccluded: large rectangular white bedsheet and light-blue shirt hanging freely on the clothesline with clear gaps below for wind sway, the cat resting in clear silhouette with visible ears. Delicate low-saturation palette, soft daylight and cast shadows, no black outlines, no text, no frame. Diorama edges dissolve into the white paper.
```

### 3. Chess under the tree (`examples/chess-under-tree`)
```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. Composition: square stone courtyard block. Two elderly friends playing Chinese chess (xiangqi) under the shade of a broad summer tree in a courtyard. 2:1 dimetric perspective, like a miniature diorama on a table: cobblestone courtyard ground plane recedes down-left and down-right, tree trunk upright. Materials: grey stone pavers, gnarled tree bark, lush leafy green canopy, a small stone chess table with a wooden stool. Key accents: muted jade green foliage and the subtle ochre of the wooden fan. Figures and gestures: an elderly man sitting on the left contemplating his next move; the man on the right holding an open palm-leaf fan in one hand near his chest, looking at the board. Moving parts clearly visible and unoccluded: the leafy tree canopy above with distinct branch clusters, the man's forearm and palm-leaf fan held with clear space around it for a gentle fanning motion, a few loose leaves drifting toward the ground. Airy, clean, refined natural palette with restrained saturation, no black outlines, no comic contours, no text, no border. Edges fade softly into the white paper.
```

### 4. Campfire in the snow (`examples/snow-campfire`)
```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. Composition: open snow mound vignette fading softly into white. A peaceful winter wilderness campsite in fresh snow at twilight. 2:1 dimetric perspective, like a miniature model on a desk: gentle snow-covered ground recedes down-left and down-right, pine trees upright. Materials: pristine white powdery snow mound, a small dark canvas tent, a stone fire pit with leaping orange flames, a sleeping sled dog. Key accents: warm glowing orange and amber campfire light contrasting with cool slate-blue twilight snow. Figures and gestures: a lone camper in a dark winter parka kneeling near the fire warming hands; a husky dog lying curled up asleep on the snow beside the tent. Moving parts clearly visible and unoccluded: the campfire flame tongue rising clearly against the snow, the dog with visible upright ears and curled posture, subtle warm light falloff on the tent wall and snow surface. Delicate restrained palette, no black outlines, no text, no watermark, no frame. Diorama edges fade into the pure white paper.
```

### 5. Lake boat (`examples/lake-boat`)
```text
A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. Composition: open water vignette fading softly into white paper with no hard borders. An elderly fisherman in a weathered wooden boat in the middle of a calm lake at twilight, holding a slender fishing rod over the water. 2:1 dimetric perspective, like a miniature diorama on a desk: lake surface recedes down-left and down-right, fisherman and boat upright, camera slightly above. Materials: weathered wood boat, dark teal-blue calm lake water, straw hat, muted blue linen garments, slender bamboo fishing rod. Key accents: warm amber lantern glow at the boat's bow and soft twilight reflection. Figures and gestures: the fisherman sits quietly in silhouette holding the long slender rod over open water with clear negative space around it. Moving parts clearly visible and unoccluded: slender fishing rod extending into empty space for subtle trembling, calm open water for ripples and waves, drifting fireflies in the air above. Airy, clean, delicate low-saturation palette, no black outlines, no text, no border. Lake edges dissolve softly into the pure white paper.
```

---

## 4. CLI Helpers

You can generate a prompt or validate your reference image directly from the command line:

### Generate a prompt from an idea:
```bash
# English or Chinese or any language
node cli/pocketworld.js prompt "a quiet ramen cart on a rainy Tokyo backstreet with a glowing red lantern"
node cli/pocketworld.js prompt "雨夜拉面摊，一个厨师在煮面，一只橘猫在吃鱼"
```

### Validate a reference image:
```bash
node cli/pocketworld.js check-ref examples/your-scene/reference.jpg
# Or validate by scene directory:
node cli/pocketworld.js check-ref examples/your-scene
```
The validator checks:
1. **Dimensions**: Exact 1:1 square ratio (1024×1024 recommended).
2. **Background**: Pure clean white margins (floats on white page, no cropped borders).
3. **Saturation**: Restrained, refined palette (flags candy/neon oversaturation).
4. **Luminance**: Well-lit diorama on paper (flags overly dark images).

---

## 5. Post-Generation Quality Checklist

After your image model produces a candidate, check this list before proceeding:

| Check | Pass | Reject & Regenerate if... |
|---|---|---|
| **Ratio & Margins** | 1024×1024 square, wide white margin | Rectangular, or diorama touches/bleeds off the frame edge. |
| **Background** | Pure clean white paper (`#ffffff`) | Sky, ground, wall, or dark color fills the entire frame. |
| **Perspective** | 2:1 dimetric isometric | Flat 2D side view, top-down map, or extreme perspective distortion. |
| **Outlines** | Zero black ink outlines; forms read by value | Comic contours, bold black pen lines, or cel-shaded borders. |
| **Palette** | Low saturation, refined watercolor tones | Harsh neon, fluorescent accents, or candy-like oversaturation. |
| **Moving Parts** | Moving elements clearly delineated with gaps | A fan fused into a shirt, clothes fused into walls, or props occluded. |
| **Gestures** | Readable heads, hands, posture | Mangled hands, unrecognizable faces, or chaotic clutter. |
| **Artifacts** | Clean page | Text, watermark, logo, or multiple diorama cards on one canvas. |

Save the approved image to `examples/<name>/reference.jpg`.

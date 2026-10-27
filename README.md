# pocketworld

A bus stop in the rain. It keeps raining.

![Rain at the bus stop](examples/rain-bus-stop/out/loop.gif)

You bring a painting. pocketworld turns it into a little diorama of stacked pixels, then lets it breathe: rain, a lamp, a sheet on a line. One WebGL2 shader, a short palette, an ordered dither, sixty frames a second, the same twelve seconds forever.

The feeling comes from [shawn (@zzzzshawn)](https://x.com/zzzzshawn) and his Small plays, which are also "just one webgl shader" and a dither. This repo does not include that code or those pictures.

[The loop as video](examples/rain-bus-stop/out/loop.mp4), if you would rather not watch a GIF.

![Reference, then the diorama](examples/rain-bus-stop/out/compare.png)

## Laundry on the roof

The same recipe, a sunny scene. The sheets take the wind. The cat takes a breath. The woman stays where she was drawn.

![Rooftop laundry](examples/rooftop-laundry/out/loop.gif)

[Video](examples/rooftop-laundry/out/loop.mp4). [Reference beside the frame](examples/rooftop-laundry/out/compare.png).

## Chess under the tree

The generic `layers` profile: motion is a list of layers by physical category (soft deform, rigid rotate about a pivot, path, particles, surface waves, light). The leaves sway, a few fall, and the man fans himself: the fan is cut out and rotates about his grip, riding on a small forearm swing.

![Chess under the tree](examples/chess-under-tree/out/loop.gif)

[Video](examples/chess-under-tree/out/loop.mp4). [Reference beside the frame](examples/chess-under-tree/out/compare.png). [The fan at four phases](examples/chess-under-tree/out/fan_phases.png).

## Campfire in the snow

A winter campsite diorama. The campfire flames dance, warm amber light flickers across the snow and tent, the camper warms their hands, and the dog rests peacefully—its ear flicking occasionally using a rigid `duty` cycle.

![Campfire in the snow](examples/snow-campfire/out/loop.gif)

[Video](examples/snow-campfire/out/loop.mp4). [Reference beside the frame](examples/snow-campfire/out/compare.png). [The ear at four phases](examples/snow-campfire/out/dog_ear_phases.png).

## Lake boat

An elderly fisherman on a calm lake at twilight. The slender bamboo rod shivers with a light bite, the water ripples gently, a warm lantern glows from the bow, the fisherman breathes, and fireflies drift through the cool evening air.

![Fisherman on the lake](examples/lake-boat/out/loop.gif)

[Video](examples/lake-boat/out/loop.mp4). [Reference beside the frame](examples/lake-boat/out/compare.png). [The fishing rod at four phases](examples/lake-boat/out/fishing_rod_phases.png).

## Thirty seconds

```bash
npm install
python3 -m pip install -r requirements.txt

# Generate an image-generation prompt or validate a reference image:
node cli/pocketworld.js prompt "a quiet bus stop in the rain at dusk"
node cli/pocketworld.js check-ref examples/rain-bus-stop

# Build and render:
node cli/pocketworld.js prep examples/rain-bus-stop
node cli/pocketworld.js render examples/rain-bus-stop
npm run dev
```

The playground is `http://127.0.0.1:8787/playground/`. `render` writes a 60 fps MP4, a GIF, a side-by-side compare, a contact sheet, and a smoothness number.

```html
<script type="module" src="/src/element.js"></script>
<pocket-world src="examples/rain-bus-stop/build/manifest.json"></pocket-world>
```

## Make one

The workflow is [`skills/pocketworld/SKILL.md`](skills/pocketworld/SKILL.md). The short version:

0. **Reference image (loose on content, firm on style)**: Pocketworld animates layers from a reference painting. The reference must be an isometric small diorama island on a pure white background with wide margins, low saturation, no black outlines, and clearly separated moving parts (never random street photos or cluttered edge-to-edge scenes). Generating one with an image model is the recommended path:
   ```bash
   node cli/pocketworld.js prompt "<your scene idea in any language>"
   node cli/pocketworld.js check-ref examples/your-scene/reference.jpg
   ```
   Full prompt templates and worked examples are in [`reference_prompt.md`](skills/pocketworld/reference_prompt.md).
1. Save the keeper as `examples/your-scene/reference.jpg` and a `scene.json` beside it. Trace masks on the grid from `node cli/pocketworld.js overlay examples/your-scene`. `suggest` will guess key colours and pale cloth so you are not placing every point by hand.
2. `prep`, look at the still, then `render`. The compare image and the metric tell you if it holds. The skill lists which knob fixes which problem: too painterly, too greasy, a washed-out fold, choppy time, motion that is too loud or too shy.

An earlier try drew the people out of math. They looked like math. That code is in [`experimental/sdf/`](experimental/sdf/) and it is not how these are made.

## License

MIT. Copyright (c) 2026 Zhenzhao Tu.

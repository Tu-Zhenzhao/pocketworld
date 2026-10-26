# Reference image prompt

Fill the brackets. Generate one square still. The animation is made from this picture, so the drawing has to be right before any code runs.

## Spec

- **Square, 1024×1024.** That is the coordinate space `scene.json` uses.
- **Pure white background.** Not cream, not a sky that fills the frame. The diorama floats on the page.
- **A generous white margin** on every side. The edges of the scene haze into the paper. No hard rectangular frame, no border, no drop shadow card.
- **Isometric pocket diorama.** 2:1 dimetric: the ground plane runs down-right and down-left, and a vertical in the world is about twice a ground step. People stand upright. The camera looks down a little, the way a model on a desk does.
- **No black outlines.** Shapes read from colour and value. No ink, no comic contour, no text, no watermark, no signature.
- **Airy and clean.** Soft light, small colour areas, visible material (wet stone, cloth, glass). Not a flat vector poster and not a muddy painting.
- **One moment, a few figures.** The people are the drawing. Get the gesture right. Everything that should move later (cloth, an umbrella, an animal, rain on the ground) must be visible and separable from what it stands in front of.

## Prompt

```
A square illustration of a tiny isometric diorama on a pure white background, 1024 by 1024, with a wide empty white margin. The scene is [ONE SENTENCE: who, where, the mood]. 2:1 dimetric, like a model on a desk: the floor recedes down-left and down-right, people stand upright, the camera is slightly above. Soft daylight or one practical lamp. Airy, clean, delicate colour, no black outlines, no text, no border, no frame. Edges fade into the white paper. [NAME THE MATERIALS AND THE ONE WARM OR COOL ACCENT]. Painterly, but every silhouette is readable: [LIST THE FIGURES AND THE GESTURE OF EACH]. Leave the white page empty around the diorama.
```

## Rain at the bus stop, as an example

```
A square illustration of a tiny isometric diorama on a pure white background, 1024 by 1024, with a wide empty white margin. A quiet bus stop in the rain at dusk: a woman in a mustard coat holds a dusty-rose umbrella and looks at a man in a grey hoodie sitting on the bench, head bowed. 2:1 dimetric, like a model on a desk. One warm lamp on a post, wet blue-grey asphalt, a little grass. Airy, clean, delicate colour, no black outlines, no text, no border. Edges fade into the white paper. The rose umbrella and the mustard coat are the only warm accents besides the amber lamp. Painterly, but every silhouette is readable.
```

## After the image comes back

Reject it and generate again if any of these are true:

- The background is not white, or the diorama is cropped by the frame.
- Figures have black contours, or the whole image is flat vector shapes.
- You cannot point at the head, the hands, and the feet.
- Something that must move (a sheet, an umbrella, an animal) is the same colour as the wall behind it and you cannot see its edge.
- There is text, a logo, or a second scene in the margin.

Save the keeper as `examples/<name>/reference.jpg`.

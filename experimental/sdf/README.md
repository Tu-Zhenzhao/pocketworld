# Archived: procedural SDF pocketworld

This is the first version of the toolkit. One fragment shader drew the whole scene from signed-distance capsules, boxes, and a character rig. Fishing, basketball, juggler, and an earlier rain bus stop were built that way.

It is archived because the figures always came out crude: wrong proportions, no gesture, no story. The reference painting already has the drawing. The current pipeline (repo root) keeps those pixels and only adds texture, dither, and motion.

Nothing in this folder is wired into `pocketworld prep`, `pocketworld render`, or the playground. Imports inside `examples/` still point at `src/` here, so the old files can be read as a snapshot. Do not commit study videos, and do not bring this rig back as the default.

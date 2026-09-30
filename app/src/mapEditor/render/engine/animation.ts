/**
 * How long one engine frame lasts: the game updates at 60 frames a second.
 */
const ENGINE_FRAME_MS = 1000 / 60;

/**
 * How many engine frames each step of the tile animation lasts. Tilemap#update counts frames and steps the
 * animation every 30, so water moves twice a second.
 */
const FRAMES_PER_ANIMATION_STEP = 30;

/**
 * How far a rect's picture moves between animation steps: not at all, along the A1 water surface (two tiles to the
 * right a step, which is where the next frame sits on the sheet), or down a waterfall (one tile down a step).
 */
const TileAnimation = {
  none: 0,
  water: 1,
  waterfall: 2,
} as const;

/**
 * One of the three ways a rect animates.
 */
type TileAnimationKind = typeof TileAnimation[keyof typeof TileAnimation];

/**
 * Converts time spent on the map into the engine's frame count.
 * @param {number} elapsedMs Milliseconds since the map was shown.
 * @returns {number} Whole engine frames.
 */
const engineFramesAt = (elapsedMs: number): number =>
{
  return Math.floor(elapsedMs / ENGINE_FRAME_MS);
};

/**
 * Finds the animation step the engine shows after some time, as Tilemap#update derives animationFrame.
 * @param {number} elapsedMs Milliseconds since the map was shown.
 * @returns {number} The step, counting up from 0.
 */
const animationFrameAt = (elapsedMs: number): number =>
{
  return Math.floor(engineFramesAt(elapsedMs) / FRAMES_PER_ANIMATION_STEP);
};

/**
 * Finds which of the three water frames a step shows: the surface steps 0, 1, 2, 1 and repeats, as
 * Tilemap#_addAutotile's waterSurfaceIndex.
 * @param {number} animationFrame The step.
 * @returns {number} The frame, 0 to 2.
 */
const waterSurfaceIndex = (animationFrame: number): number =>
{
  return [ 0, 1, 2, 1 ][animationFrame % 4];
};

/**
 * Finds which of the three waterfall frames a step shows: they cycle 0, 1, 2.
 * @param {number} animationFrame The step.
 * @returns {number} The frame, 0 to 2.
 */
const waterfallIndex = (animationFrame: number): number =>
{
  return animationFrame % 3;
};

/**
 * Builds the animation vector every tilemap chunk reads: the water frame across, the waterfall frame down. Rects are
 * built at frame 0 and the tilemap shader moves each animated one by its frame, so an animation step changes two
 * numbers and never rebuilds a chunk.
 * @param {number} animationFrame The step.
 * @returns {[ number, number ]} The water frame and the waterfall frame.
 */
const animationVector = (animationFrame: number): [ number, number ] =>
{
  return [ waterSurfaceIndex(animationFrame), waterfallIndex(animationFrame) ];
};

export {
  animationFrameAt,
  animationVector,
  ENGINE_FRAME_MS,
  engineFramesAt,
  FRAMES_PER_ANIMATION_STEP,
  TileAnimation,
  waterfallIndex,
  waterSurfaceIndex,
};
export type { TileAnimationKind };

import type { MapTiles } from '../model/patches.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * Where a map is pinned while it changes size: the edge or corner that stays put. The map grows or shrinks away
 * from it, the way a canvas resize works in a paint program.
 */
type ResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/**
 * The nine anchors in reading order, as the three-by-three picker lays them out.
 */
const RESIZE_ANCHORS: readonly ResizeAnchor[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

/**
 * The smallest and largest a map may be on either side, as MZ allows.
 */
const MIN_MAP_SIZE = 1;
const MAX_MAP_SIZE = 256;

/**
 * How many layers a map's tile data holds: four of tiles, then shadows, then regions.
 */
const LAYER_COUNT = 6;

/**
 * An event that survives a resize, and where it stands afterwards.
 */
type MovedEvent = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
};

/**
 * A resize worked out: the new size and every cell of every layer, where each surviving event now stands, and the
 * events that would land outside the new size and go with the step.
 */
type ResizePlan = {
  readonly tiles: MapTiles;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly moved: readonly MovedEvent[];
  readonly dropped: readonly number[];
};

/**
 * What a resize starts from.
 */
type ResizeSource = {
  readonly width: number;
  readonly height: number;
  readonly cells: ArrayLike<number>;
  readonly events: readonly (RmmzMapEvent | null)[];
};

/**
 * Reports whether a size is one a map may have.
 * @param {number} size The width or height.
 * @returns {boolean} True for a whole number from 1 to 256.
 */
const isMapSize = (size: number): boolean =>
{
  return Number.isInteger(size) && size >= MIN_MAP_SIZE && size <= MAX_MAP_SIZE;
};

/**
 * Works out how far the old map shifts inside the new one on one axis. Pinned at the start it stays put; pinned at
 * the end it shifts by the whole change; centred it shifts by half, the odd cell going to the far side whether the
 * map grows or shrinks.
 * @param {'start' | 'middle' | 'end'} pin Which part of the axis stays put.
 * @param {number} change The new size minus the old.
 * @returns {number} How many cells the old map shifts, negative when it is cut from the start.
 */
const shiftAlong = (pin: 'start' | 'middle' | 'end', change: number): number =>
{
  switch (pin)
  {
    case 'start':
      return 0;
    case 'middle':
      // half, rounded toward zero, written so a change of one never comes out as negative zero.
      return (change - (change % 2)) / 2;
    case 'end':
      return change;
  }
};

/**
 * Reads which part of one axis an anchor pins, from the word naming that axis's start and the one naming its end.
 * @param {boolean} atStart True when the anchor names the axis's start (left, top).
 * @param {boolean} atEnd True when the anchor names the axis's end (right, bottom).
 * @returns {'start' | 'middle' | 'end'} The pin.
 */
const pinOf = (atStart: boolean, atEnd: boolean): 'start' | 'middle' | 'end' =>
{
  if (atStart)
  {
    return 'start';
  }

  return atEnd
    ? 'end'
    : 'middle';
};

/**
 * Reads which part of each axis an anchor pins.
 * @param {ResizeAnchor} anchor The anchor.
 * @returns {{ across: 'start' | 'middle' | 'end', down: 'start' | 'middle' | 'end' }} The pins.
 */
const pinsOf = (anchor: ResizeAnchor): { across: 'start' | 'middle' | 'end'; down: 'start' | 'middle' | 'end' } =>
{
  return {
    across: pinOf(anchor.endsWith('left'), anchor.endsWith('right')),
    down: pinOf(anchor.startsWith('top'), anchor.startsWith('bottom')),
  };
};

/**
 * Works out a resize: every layer's cells carried to where the anchor puts them, new cells empty, and every event
 * shifted with the tiles under it. Events that would land outside the new size are listed to go, since a map
 * cannot hold them there; the form warns about them before the resize is made.
 * @param {ResizeSource} source The map as it stands.
 * @param {number} width The new width.
 * @param {number} height The new height.
 * @param {ResizeAnchor} anchor What stays put.
 * @returns {ResizePlan} The plan.
 */
const planResize = (source: ResizeSource, width: number, height: number, anchor: ResizeAnchor): ResizePlan =>
{
  if (isMapSize(width) === false || isMapSize(height) === false)
  {
    throw new Error(`A map is ${MIN_MAP_SIZE} to ${MAX_MAP_SIZE} tiles on each side.`);
  }

  const pins = pinsOf(anchor);
  const offsetX = shiftAlong(pins.across, width - source.width);
  const offsetY = shiftAlong(pins.down, height - source.height);

  // each new cell takes the old cell the shift lands on it, or stays empty where the old map never reached.
  const data = new Array<number>(width * height * LAYER_COUNT).fill(0);
  for (let z = 0; z < LAYER_COUNT; z++)
  {
    for (let y = 0; y < height; y++)
    {
      const oldY = y - offsetY;
      for (let x = 0; x < width; x++)
      {
        const oldX = x - offsetX;
        if (oldX >= 0 && oldY >= 0 && oldX < source.width && oldY < source.height)
        {
          data[(z * height + y) * width + x] = source.cells[(z * source.height + oldY) * source.width + oldX];
        }
      }
    }
  }

  const moved: MovedEvent[] = [];
  const dropped: number[] = [];
  source.events.forEach(event =>
  {
    if (event === null)
    {
      return;
    }

    const x = event.x + offsetX;
    const y = event.y + offsetY;
    if (x < 0 || y < 0 || x >= width || y >= height)
    {
      dropped.push(event.id);
      return;
    }

    moved.push({ id: event.id, x, y });
  });

  return { tiles: { width, height, data }, offsetX, offsetY, moved, dropped };
};

export { isMapSize, MAX_MAP_SIZE, MIN_MAP_SIZE, planResize, RESIZE_ANCHORS };
export type { MovedEvent, ResizeAnchor, ResizePlan, ResizeSource };

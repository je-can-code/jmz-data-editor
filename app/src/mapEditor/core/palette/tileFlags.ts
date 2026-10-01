import { unshapedTile } from '../tiles/tileRoles.ts';

/**
 * The bits of a tileset's flags the editor reads and edits, as the engine reads them. The passage bits block a step
 * out of the tile in one direction each; the star draws a tile above characters and makes passage look past it; the
 * rest mark ladders, bushes, counters and damage floors; and the top four bits hold the terrain tag. The bits in
 * between (boats, ships and airships) are MZ's own and are never touched here.
 */
const FlagBit = {
  down: 0x01,
  left: 0x02,
  right: 0x04,
  up: 0x08,
  passage: 0x0f,
  star: 0x10,
  ladder: 0x20,
  bush: 0x40,
  counter: 0x80,
  damage: 0x100,
} as const;

/**
 * Where the terrain tag starts in a tile's flags, and its mask once shifted down.
 */
const TERRAIN_SHIFT = 12;
const TERRAIN_MASK = 0x0f;

/**
 * The highest terrain tag MZ offers.
 */
const MAX_TERRAIN_TAG = 7;

/**
 * One direction a step can leave a tile by.
 */
type PassageDirection = 'down' | 'left' | 'right' | 'up';

/**
 * The four directions, with the passage bit each is blocked by, in the order the engine numbers them (2, 4, 6, 8).
 */
const PASSAGE_DIRECTIONS: readonly { readonly direction: PassageDirection; readonly bit: number }[] = [
  { direction: 'down', bit: FlagBit.down },
  { direction: 'left', bit: FlagBit.left },
  { direction: 'right', bit: FlagBit.right },
  { direction: 'up', bit: FlagBit.up },
];

/**
 * Reads one tile's flags from a tileset. A tileset's flags list can stop short of the last tile id, as some written
 * by tools do; the engine reads a missing entry as 0, and so does this.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile id.
 * @returns {number} The flags.
 */
const flagsOf = (flags: ArrayLike<number>, tileId: number): number =>
{
  return flags[tileId] ?? 0;
};

/**
 * Reads the flags the editor shows for a tile: an autotile kind's are read from its shape 0, the shape a kind is
 * painted in before its neighbours shape it, since the shapes of a kind can differ (MZ edges an open ceiling's sides).
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile id, in any shape.
 * @returns {number} The flags.
 */
const shownFlags = (flags: ArrayLike<number>, tileId: number): number =>
{
  return flagsOf(flags, unshapedTile(tileId));
};

/**
 * Reads a terrain tag out of a tile's flags.
 * @param {number} flag The tile's flags.
 * @returns {number} The tag, 0 for none.
 */
const terrainTagOf = (flag: number): number =>
{
  return (flag >> TERRAIN_SHIFT) & TERRAIN_MASK;
};

export { FlagBit, flagsOf, MAX_TERRAIN_TAG, PASSAGE_DIRECTIONS, shownFlags, TERRAIN_MASK, TERRAIN_SHIFT, terrainTagOf };
export type { PassageDirection };

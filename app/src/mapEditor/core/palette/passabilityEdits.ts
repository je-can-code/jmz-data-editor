import type { DocumentHub } from '../history/DocumentHub.ts';
import { documentHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { TILESETS_KEY } from '../model/documentKeys.ts';
import { floorJoins, Neighbour } from '../tiles/autotileShapes.ts';
import {
  AUTOTILE_SHAPE_COUNT,
  autotileKind,
  autotileShape,
  isAutotile,
  isWallTopKind,
  makeAutotileId,
  TileId,
  tileSheet,
} from '../tiles/tileIds.ts';
import { describeTile } from './paletteLayout.ts';
import {
  FlagBit,
  flagsOf,
  MAX_TERRAIN_TAG,
  PASSAGE_DIRECTIONS,
  shownFlags,
  TERRAIN_SHIFT,
  terrainTagOf,
  type PassageDirection,
} from './tileFlags.ts';

/**
 * What the passability editor edits, one at a time, as MZ's tileset editor offers it: passage (open, blocked, or a
 * star drawn above characters), passage by direction, ladders, bushes, counters, damage floors and terrain tags.
 */
type FlagMode = 'passage' | 'directions' | 'ladder' | 'bush' | 'counter' | 'damage' | 'terrain';

/**
 * The modes in the order the editor offers them.
 */
const FLAG_MODES: readonly FlagMode[] = [ 'passage', 'directions', 'ladder', 'bush', 'counter', 'damage', 'terrain' ];

/**
 * The modes that switch one bit on and off, with the bit and the name the history gives it.
 */
const TOGGLED_FLAGS: Readonly<Record<'ladder' | 'bush' | 'counter' | 'damage', { readonly bit: number; readonly name: string }>> = {
  ladder: { bit: FlagBit.ladder, name: 'ladder' },
  bush: { bit: FlagBit.bush, name: 'bush' },
  counter: { bit: FlagBit.counter, name: 'counter' },
  damage: { bit: FlagBit.damage, name: 'damage floor' },
};

/**
 * What a tile's passage reads as in the editor: open, blocked every way, or a star, which MZ draws above characters
 * and passage looks past.
 */
type PassageState = 'open' | 'blocked' | 'star';

/**
 * One click in the passability editor: which mode, and for directions the way out clicked, for terrain tags which
 * way to count.
 */
type FlagClick =
  | { readonly mode: 'passage' }
  | { readonly mode: 'directions'; readonly direction: PassageDirection }
  | { readonly mode: 'ladder' | 'bush' | 'counter' | 'damage' }
  | { readonly mode: 'terrain'; readonly delta: number };

/**
 * One tile id's new flags.
 */
type FlagChange = readonly [ tileId: number, flag: number ];

/**
 * What a click comes to: the name the history gives it, and every tile id whose flags change.
 */
type FlagEdit = {
  readonly label: string;
  readonly changes: readonly FlagChange[];
};

/**
 * How many tile ids a tileset's flags list covers when MZ writes it.
 */
const FLAG_COUNT = TileId.MAX;

/**
 * Which shapes of each autotile kind a ladder, bush, counter or damage floor was on when a click switched it off, for
 * one tileset, so switching it back on puts it on exactly those shapes again rather than on all 48. MZ ships kinds
 * whose shapes differ (some grass is a bush everywhere but its bottom corners), and switching such a flag off and on
 * again must leave the kind as it was. The note lasts as long as the window; once it closes, only the file says where
 * a flag is, and switching one on puts it on every shape.
 */
class SwitchedOffShapes
{
  #shapes = new Map<string, readonly number[]>();

  /**
   * Notes which shapes of a kind a flag is on, as a click switches it off.
   * @param {number} kind The autotile kind.
   * @param {number} bit The flag's bit.
   * @param {readonly number[]} shapes The shapes it is on.
   */
  remember(kind: number, bit: number, shapes: readonly number[]): void
  {
    this.#shapes.set(`${kind}:${bit}`, [ ...shapes ]);
  }

  /**
   * Recalls which shapes of a kind a flag was on when a click here last switched it off.
   * @param {number} kind The autotile kind.
   * @param {number} bit The flag's bit.
   * @returns {readonly number[]} The shapes; none when it was never switched off here.
   */
  recall(kind: number, bit: number): readonly number[]
  {
    return this.#shapes.get(`${kind}:${bit}`) ?? [];
  }
}

/**
 * The window's notes of switched-off shapes, one per tileset, kept for as long as it is open.
 */
const switchedOffByTileset = new Map<number, SwitchedOffShapes>();

/**
 * Finds the window's note of the shapes flags were switched off on, for one tileset, starting it the first time.
 * @param {number} tilesetId The tileset.
 * @returns {SwitchedOffShapes} The note.
 */
const switchedOffShapesFor = (tilesetId: number): SwitchedOffShapes =>
{
  const existing = switchedOffByTileset.get(tilesetId);
  if (existing !== undefined)
  {
    return existing;
  }

  const created = new SwitchedOffShapes();
  switchedOffByTileset.set(tilesetId, created);
  return created;
};

/**
 * Reports whether a tile's flags can be edited. B's first tile is the empty tile, which MZ keeps a star so an empty
 * layer never blocks a step, and ids no sheet holds are on no palette.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for every tile on a sheet but the empty one.
 */
const isEditableTile = (tileId: number): boolean =>
{
  return tileSheet(tileId) !== 'none';
};

/**
 * Lists the tile ids an edit to a tile writes: every shape of an autotile kind, since the engine reads the flags of
 * whichever shape a map stores, or the one tile otherwise.
 * @param {number} tileId The tile id, in any shape.
 * @returns {number[]} The ids.
 */
const flagIdsOf = (tileId: number): number[] =>
{
  if (isAutotile(tileId) === false)
  {
    return [ tileId ];
  }

  const kind = autotileKind(tileId);
  return Array.from({ length: AUTOTILE_SHAPE_COUNT }, (_, shape) => makeAutotileId(kind, shape));
};

/**
 * Reads a tile's passage as the editor shows it.
 * @param {number} flag The tile's flags.
 * @returns {PassageState} A star when starred, blocked when every way out is, open otherwise.
 */
const passageStateOf = (flag: number): PassageState =>
{
  if ((flag & FlagBit.star) !== 0)
  {
    return 'star';
  }

  return (flag & FlagBit.passage) === FlagBit.passage
    ? 'blocked'
    : 'open';
};

/**
 * Picks the passage a click moves a tile to: open, blocked, then a star, then open again, as MZ cycles them. An
 * autotile only goes between open and blocked, since MZ gives stars to plain tiles alone.
 * @param {number} tileId The tile id.
 * @param {PassageState} state Its passage now.
 * @returns {PassageState} Its passage after the click.
 */
const nextPassageState = (tileId: number, state: PassageState): PassageState =>
{
  if (state === 'open')
  {
    return 'blocked';
  }

  return state === 'blocked' && isAutotile(tileId) === false
    ? 'star'
    : 'open';
};

/**
 * Works out the passage bits MZ gives one shape of an open ceiling: each side the shape shows an edge on blocks the
 * step out that way, except the bottom, which only ever meets the wall face beneath; and the palette's sample shape,
 * which no map uses, is blocked every way. Every open ceiling Chef Adventure ships is written exactly this way.
 * @param {number} shape The shape, 0 to 47.
 * @returns {number} The passage bits.
 */
const ceilingPassage = (shape: number): number =>
{
  if (shape === 47)
  {
    return FlagBit.passage;
  }

  // a side the shape does not join its neighbour on is an edge, and an edge blocks the way out across it.
  const joins = floorJoins(shape);
  let bits = 0;
  if ((joins & Neighbour.west) === 0)
  {
    bits |= FlagBit.left;
  }

  if ((joins & Neighbour.north) === 0)
  {
    bits |= FlagBit.up;
  }

  if ((joins & Neighbour.east) === 0)
  {
    bits |= FlagBit.right;
  }

  return bits;
};

/**
 * Works out the passage bits one tile id keeps however open it is made: a ceiling's shape keeps MZ's edges (see
 * {@link ceilingPassage}), so opening a ceiling, or one way out of it, never lets a step leave across its edge; every
 * other tile keeps none.
 * @param {number} tileId The id, which for an autotile names its shape.
 * @returns {number} The passage bits.
 */
const edgePassage = (tileId: number): number =>
{
  return isAutotile(tileId) && isWallTopKind(autotileKind(tileId))
    ? ceilingPassage(autotileShape(tileId))
    : 0;
};

/**
 * Writes a passage state into one tile id's flags, keeping every other bit.
 * @param {number} flag The id's flags now.
 * @param {number} tileId The id, which for an autotile names its shape.
 * @param {PassageState} state The passage to write.
 * @returns {number} The new flags.
 */
const withPassage = (flag: number, tileId: number, state: PassageState): number =>
{
  const kept = flag & ~(FlagBit.passage | FlagBit.star);
  if (state === 'blocked')
  {
    return kept | FlagBit.passage;
  }

  if (state === 'star')
  {
    return kept | FlagBit.star;
  }

  return kept | edgePassage(tileId);
};

/**
 * Lists the changes a new value per id comes to, leaving out every id already holding it.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {readonly number[]} ids The ids to write.
 * @param {(flag: number, tileId: number) => number} next The new flags for each, from its flags now.
 * @returns {FlagChange[]} The changes.
 */
const changesFor = (flags: ArrayLike<number>, ids: readonly number[], next: (flag: number, tileId: number) => number): FlagChange[] =>
{
  return ids
    .map(id => [ id, next(flagsOf(flags, id), id) ] as const)
    .filter(([ id, value ]) => value !== flagsOf(flags, id));
};

/**
 * Plans a passage click: the tile moves to its next passage state, on every shape for an autotile kind.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile.
 * @returns {FlagEdit} The edit.
 */
const passageEdit = (flags: ArrayLike<number>, tileId: number): FlagEdit =>
{
  const next = nextPassageState(tileId, passageStateOf(shownFlags(flags, tileId)));
  const words: Readonly<Record<PassageState, string>> = { open: 'open', blocked: 'blocked', star: 'above characters' };
  return {
    label: `${describeTile(tileId)}: ${words[next]}`,
    changes: changesFor(flags, flagIdsOf(tileId), (flag, id) => withPassage(flag, id, next)),
  };
};

/**
 * Plans a click on one way out of a tile: blocked when it was open, open when it was blocked, going by the shown
 * flags, and written to every shape of an autotile kind. Opening a way out of a ceiling leaves it blocked on the
 * shapes whose edge faces that way, as opening a ceiling's passage does, so a second click puts every shape back.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile.
 * @param {PassageDirection} direction The way out clicked.
 * @returns {FlagEdit} The edit.
 */
const directionEdit = (flags: ArrayLike<number>, tileId: number, direction: PassageDirection): FlagEdit =>
{
  const { bit } = PASSAGE_DIRECTIONS.find(each => each.direction === direction) as { bit: number };
  const block = (shownFlags(flags, tileId) & bit) === 0;
  return {
    label: `${describeTile(tileId)}: ${direction} ${block ? 'blocked' : 'open'}`,
    changes: changesFor(flags, flagIdsOf(tileId), (flag, id) => (block ? flag | bit : (flag & ~bit) | (edgePassage(id) & bit))),
  };
};

/**
 * Lists the tile ids switching a flag on writes: the shapes of an autotile kind it was on when a click here last
 * switched it off, or every id the tile has when it never was.
 * @param {number} tileId The tile.
 * @param {number} bit The flag's bit.
 * @param {SwitchedOffShapes} switchedOff The tileset's note of the shapes flags were switched off on.
 * @returns {number[]} The ids.
 */
const switchedOnIds = (tileId: number, bit: number, switchedOff: SwitchedOffShapes): number[] =>
{
  const kind = autotileKind(tileId);
  const shapes = isAutotile(tileId)
    ? switchedOff.recall(kind, bit)
    : [];
  return shapes.length > 0
    ? shapes.map(shape => makeAutotileId(kind, shape))
    : flagIdsOf(tileId);
};

/**
 * Plans a click that switches a ladder, bush, counter or damage floor on or off, going by the shown flags, and
 * written to every shape of an autotile kind. Switching it off notes which shapes had it, and switching it back on
 * puts it on just those shapes again (see {@link SwitchedOffShapes}).
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile.
 * @param {'ladder' | 'bush' | 'counter' | 'damage'} mode Which flag.
 * @param {SwitchedOffShapes} switchedOff The tileset's note of the shapes flags were switched off on.
 * @returns {FlagEdit} The edit.
 */
const toggleEdit = (flags: ArrayLike<number>, tileId: number, mode: 'ladder' | 'bush' | 'counter' | 'damage', switchedOff: SwitchedOffShapes): FlagEdit =>
{
  const { bit, name } = TOGGLED_FLAGS[mode];
  const on = (shownFlags(flags, tileId) & bit) === 0;
  const ids = flagIdsOf(tileId);
  if (on === false && isAutotile(tileId))
  {
    // note the shapes it is on before it goes, so switching it back on can put it on exactly those again.
    const shapes = ids.filter(id => (flagsOf(flags, id) & bit) !== 0).map(autotileShape);
    switchedOff.remember(autotileKind(tileId), bit, shapes);
  }

  return {
    label: `${describeTile(tileId)}: ${name} ${on ? 'on' : 'off'}`,
    changes: on
      ? changesFor(flags, switchedOnIds(tileId, bit, switchedOff), flag => flag | bit)
      : changesFor(flags, ids, flag => flag & ~bit),
  };
};

/**
 * Plans a click on a terrain tag: counted up or down by one, going round from 7 to 0 and back, and written to every
 * shape of an autotile kind.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile.
 * @param {number} delta 1 to count up, -1 to count down.
 * @returns {FlagEdit} The edit.
 */
const terrainEdit = (flags: ArrayLike<number>, tileId: number, delta: number): FlagEdit =>
{
  const span = MAX_TERRAIN_TAG + 1;
  const tag = ((terrainTagOf(shownFlags(flags, tileId)) + Math.sign(delta)) % span + span) % span;
  const mask = ~(0x0f << TERRAIN_SHIFT);
  return {
    label: `${describeTile(tileId)}: terrain tag ${tag}`,
    changes: changesFor(flags, flagIdsOf(tileId), flag => (flag & mask) | (tag << TERRAIN_SHIFT)),
  };
};

/**
 * Plans what a click in the passability editor does to a tile's flags. The flags of an autotile kind are shown from
 * its shape 0 and written to all 48 of its shapes, except that a ladder, bush, counter or damage floor switched back on
 * goes on just the shapes it was on when switched off, as the tileset's note recalls; a tile that cannot be edited
 * comes to no changes.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile clicked.
 * @param {FlagClick} click The mode, and what else the click says.
 * @param {SwitchedOffShapes} switchedOff The tileset's note of the shapes flags were switched off on (see
 * {@link switchedOffShapesFor}); without one, a flag switched on goes on every shape.
 * @returns {FlagEdit} The edit; no changes when nothing would change.
 */
const planFlagEdit = (flags: ArrayLike<number>, tileId: number, click: FlagClick, switchedOff = new SwitchedOffShapes()): FlagEdit =>
{
  if (isEditableTile(tileId) === false)
  {
    return { label: '', changes: [] };
  }

  switch (click.mode)
  {
    case 'passage':
      return passageEdit(flags, tileId);
    case 'directions':
      return directionEdit(flags, tileId, click.direction);
    case 'terrain':
      return terrainEdit(flags, tileId, click.delta);
    default:
      return toggleEdit(flags, tileId, click.mode, switchedOff);
  }
};

/**
 * Writes a flag edit into the tilesets as one step in their history, so it undoes like any other edit and saves with
 * the rest. A tileset whose flags list stops short of an id being written has it filled out with zeros to every tile
 * id first, as MZ writes every tileset, in the same step; a missing entry already read as 0, so nothing else changes.
 * @param {DocumentHub} hub The window's documents; the tilesets must be held.
 * @param {number} tilesetId The tileset.
 * @param {FlagEdit} edit The edit.
 * @returns {HistoryStep | null} The step, or null when the edit changes nothing.
 */
const editTilesetFlags = (hub: DocumentHub, tilesetId: number, edit: FlagEdit): HistoryStep | null =>
{
  if (edit.changes.length === 0)
  {
    return null;
  }

  const flags = hub.document(TILESETS_KEY).valueAt([ tilesetId, 'flags' ]);
  if (Array.isArray(flags) === false)
  {
    throw new Error(`tileset ${tilesetId} has no flags to edit`);
  }

  const highest = Math.max(...edit.changes.map(([ tileId ]) => tileId));
  return hub.edit(edit.label, [ documentHistoryKey(TILESETS_KEY) ], tx =>
  {
    if (highest >= flags.length)
    {
      const missing = Math.max(FLAG_COUNT, highest + 1) - flags.length;
      tx.splice(TILESETS_KEY, [ tilesetId, 'flags' ], flags.length, 0, new Array<number>(missing).fill(0));
    }

    edit.changes.forEach(([ tileId, flag ]) => tx.set(TILESETS_KEY, [ tilesetId, 'flags', tileId ], flag));
  });
};

export {
  ceilingPassage,
  editTilesetFlags,
  FLAG_MODES,
  flagIdsOf,
  isEditableTile,
  nextPassageState,
  passageStateOf,
  planFlagEdit,
  SwitchedOffShapes,
  switchedOffShapesFor,
};
export type { FlagChange, FlagClick, FlagEdit, FlagMode, PassageState };

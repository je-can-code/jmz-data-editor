import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ceilingPassage,
  editTilesetFlags,
  flagIdsOf,
  isEditableTile,
  nextPassageState,
  passageStateOf,
  planFlagEdit,
  SwitchedOffShapes,
  switchedOffShapesFor,
  type FlagChange,
} from '../../../../src/mapEditor/core/palette/passabilityEdits.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { isWallTopKind, makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { locateGameProject } from '../../../support/gameProject.ts';

/*
 * The passability editor's flag edits.
 *
 * A click in the editor changes a tileset's flags, and those flags decide where the player can walk, so every edit
 * must change exactly the bits its mode names and nothing else: MZ's own boat, ship and airship bits and the terrain
 * tag ride along untouched. An autotile kind is shown from its shape 0 and written to all 48 of its shapes, since the
 * engine reads whichever shape a map stores, and never to the kind beside it; a ladder, bush, counter or damage floor
 * switched back on goes on just the shapes it was on when switched off, since MZ ships grass that is a bush on only
 * some shapes, and switching it off and on again must leave the kind as it was. Passage cycles open, blocked, star as
 * MZ's does (stars for plain tiles alone), and an open ceiling gets MZ's own edges, which every open ceiling Chef
 * Adventure ships matches; opening one way out of a ceiling keeps the edges facing that way too, so clicking a way out
 * twice changes nothing. Each edit is one undoable step in the tilesets' history, and a flags list written short by
 * a tool is filled out with zeros in the same step, so undo takes that back out too.
 */
const MZ_BITS = 0x600;

/**
 * Builds a tileset's flags: every id holding MZ's boat and ship bits, as the upper tiles of every shipped tileset do.
 * @returns {number[]} The flags.
 */
const shippedLikeFlags = (): number[] => new Array<number>(TileId.MAX).fill(MZ_BITS);

/**
 * Writes one value to every shape of an autotile kind.
 * @param {number[]} flags The flags.
 * @param {number} kind The kind.
 * @param {number} value The value.
 * @returns {number[]} The same flags.
 */
const fillKind = (flags: number[], kind: number, value: number): number[] =>
{
  flagIdsOf(makeAutotileId(kind, 0)).forEach(id =>
  {
    flags[id] = value;
  });
  return flags;
};

/**
 * Builds flags holding grass kind 20 as MZ's world map ships it: a bush on every shape but its bottom corners (shapes
 * 38 to 41 and 43 to 46), and kind 21 beside it plain.
 * @returns {number[]} The flags.
 */
const partBushGrass = (): number[] =>
{
  const flags = fillKind(shippedLikeFlags(), 20, MZ_BITS | 0x40);
  [ 38, 39, 40, 41, 43, 44, 45, 46 ].forEach((shape) =>
  {
    flags[makeAutotileId(20, shape)] = MZ_BITS;
  });
  return flags;
};

/**
 * Applies changes to a copy of some flags, as saving an edit and clicking again would see them.
 * @param {readonly number[]} flags The flags.
 * @param {readonly FlagChange[]} changes The changes.
 * @returns {number[]} The changed copy.
 */
const applied = (flags: readonly number[], changes: readonly FlagChange[]): number[] =>
{
  const copy = [ ...flags ];
  changes.forEach(([ id, value ]) =>
  {
    copy[id] = value;
  });
  return copy;
};

describe('passageStateOf', () =>
{
  it('reads a star before anything else, then blocked every way, then open', () =>
  {
    // Arrange: a star, a star with a way blocked, every way blocked, two ways blocked, and none.
    const flags = [ 0x10, 0x11, MZ_BITS | 0x0f, MZ_BITS | 0x03, MZ_BITS ];

    // Act.
    const states = flags.map(passageStateOf);

    // Assert.
    expect(states)
      .toStrictEqual([ 'star', 'star', 'blocked', 'open', 'open' ]);
  });
});

describe('nextPassageState', () =>
{
  it('cycles a plain tile through open, blocked and star', () =>
  {
    // Arrange: a B tile.

    // Act.
    const next = [ nextPassageState(5, 'open'), nextPassageState(5, 'blocked'), nextPassageState(5, 'star') ];

    // Assert.
    expect(next)
      .toStrictEqual([ 'blocked', 'star', 'open' ]);
  });

  it('takes an autotile between open and blocked alone', () =>
  {
    // Arrange: an A2 kind.
    const tileId = makeAutotileId(20, 0);

    // Act.
    const next = [ nextPassageState(tileId, 'open'), nextPassageState(tileId, 'blocked'), nextPassageState(tileId, 'star') ];

    // Assert.
    expect(next)
      .toStrictEqual([ 'blocked', 'open', 'open' ]);
  });
});

describe('ceilingPassage', () =>
{
  it('blocks the way out across each edge a shape shows, but never the bottom, and the palette\'s sample shape every way', () =>
  {
    // Arrange: an inside, the left, top, right and bottom edges, left and right, top and bottom, the top-left corner,
    // three edges without the bottom, every edge, and the sample shape.
    const shapes = [ 0, 16, 20, 24, 28, 32, 33, 34, 42, 46, 47 ];

    // Act.
    const bits = shapes.map(ceilingPassage);

    // Assert.
    expect(bits)
      .toStrictEqual([ 0x0, 0x2, 0x8, 0x4, 0x0, 0x6, 0x8, 0xa, 0xe, 0xe, 0xf ]);
  });
});

const game = locateGameProject();

describe.skipIf(game === null)('the open ceilings Chef Adventure ships', () =>
{
  it('are every one written exactly as an open ceiling is written here', () =>
  {
    // Arrange: every ceiling kind MZ wrote open: its inside open and its sample shape blocked every way.
    const tilesets = JSON.parse(readFileSync(`${game as string}/data/Tilesets.json`, 'utf8')) as (RmmzTileset | null)[];
    const open = tilesets.flatMap(tileset => (tileset === null ? [] : Array.from({ length: 128 }, (_, kind) => ({ tileset, kind }))))
      .filter(({ tileset, kind }) =>
      {
        const ids = flagIdsOf(makeAutotileId(kind, 0));
        return isWallTopKind(kind) && ((tileset.flags[ids[0]] ?? 0) & 0x0f) === 0 && ((tileset.flags[ids[47]] ?? 0) & 0x0f) === 0x0f;
      });

    // Act: every shape of each whose passage bits differ from what opening it here would write.
    const mismatches = open.flatMap(({ tileset, kind }) => flagIdsOf(makeAutotileId(kind, 0))
      .filter((id, shape) => ((tileset.flags[id] ?? 0) & 0x0f) !== ceilingPassage(shape))
      .map(id => `${tileset.id}:${id}`));

    // Assert.
    expect([ open.length, mismatches ])
      .toStrictEqual([ 390, [] ]);
  });
});

describe('flagIdsOf', () =>
{
  it('lists all 48 shapes of an autotile kind, from its first to its last', () =>
  {
    // Arrange: A2 kind 20, given in shape 30.

    // Act.
    const ids = flagIdsOf(makeAutotileId(20, 30));

    // Assert.
    expect([ ids.length, ids[0], ids[47] ])
      .toStrictEqual([ 48, makeAutotileId(20, 0), makeAutotileId(20, 47) ]);
  });

  it('lists a plain tile alone', () =>
  {
    // Arrange.

    // Act.
    const ids = flagIdsOf(TileId.A5 + 3);

    // Assert.
    expect(ids)
      .toStrictEqual([ TileId.A5 + 3 ]);
  });
});

describe('isEditableTile', () =>
{
  it('refuses the empty tile and ids no sheet holds, and takes every other tile', () =>
  {
    // Arrange: the empty tile, the gap between E and A5, a B tile, the first A5 tile, the first and last autotile ids,
    // and one past the last.
    const tiles = [ 0, 1100, 5, TileId.A5, TileId.A1, TileId.MAX - 1, TileId.MAX ];

    // Act.
    const editable = tiles.map(isEditableTile);

    // Assert.
    expect(editable)
      .toStrictEqual([ false, false, true, true, true, true, false ]);
  });
});

describe('planFlagEdit', () =>
{
  it('blocks an open plain tile and nothing beside it, keeping MZ\'s own bits and its terrain tag', () =>
  {
    // Arrange: B tile 6 carries terrain tag 1; B tile 7 beside it is open too.
    const flags = shippedLikeFlags();
    flags[5] = MZ_BITS | 0x1000;

    // Act.
    const edit = planFlagEdit(flags, 5, { mode: 'passage' });

    // Assert.
    expect(edit)
      .toStrictEqual({ label: 'B tile 6: blocked', changes: [ [ 5, MZ_BITS | 0x1000 | 0x0f ] ] });
  });

  it('gives a blocked plain tile a star, and opens a starred one', () =>
  {
    // Arrange.
    const flags = shippedLikeFlags();
    flags[5] = MZ_BITS | 0x0f;
    flags[6] = MZ_BITS | 0x10;

    // Act.
    const edits = [ planFlagEdit(flags, 5, { mode: 'passage' }), planFlagEdit(flags, 6, { mode: 'passage' }) ];

    // Assert.
    expect(edits)
      .toStrictEqual([
        { label: 'B tile 6: above characters', changes: [ [ 5, MZ_BITS | 0x10 ] ] },
        { label: 'B tile 7: open', changes: [ [ 6, MZ_BITS ] ] },
      ]);
  });

  it('blocks every shape of an autotile kind, and none of the kind beside it', () =>
  {
    // Arrange: A2 kinds 20 and 21, both open.
    const flags = shippedLikeFlags();

    // Act.
    const edit = planFlagEdit(flags, makeAutotileId(20, 9), { mode: 'passage' });

    // Assert.
    const ids = edit.changes.map(([ id ]) => id);
    expect([ edit.label, edit.changes.length, Math.min(...ids), Math.max(...ids), edit.changes.every(([ , value ]) => value === (MZ_BITS | 0x0f)) ])
      .toStrictEqual([ 'A2 decoration 5: blocked', 48, makeAutotileId(20, 0), makeAutotileId(20, 47), true ]);
  });

  it('never gives an autotile a star: a blocked kind opens', () =>
  {
    // Arrange.
    const flags = fillKind(shippedLikeFlags(), 20, MZ_BITS | 0x0f);

    // Act.
    const edit = planFlagEdit(flags, makeAutotileId(20, 0), { mode: 'passage' });

    // Assert.
    expect([ edit.label, edit.changes.every(([ , value ]) => value === MZ_BITS) ])
      .toStrictEqual([ 'A2 decoration 5: open', true ]);
  });

  it('opens a blocked ceiling with MZ\'s edges, leaving its sample shape blocked', () =>
  {
    // Arrange: ceiling kind 80, blocked every way.
    const flags = fillKind(shippedLikeFlags(), 80, MZ_BITS | 0x0f);

    // Act.
    const edit = planFlagEdit(flags, makeAutotileId(80, 0), { mode: 'passage' });

    // Assert: the inside opens, the left edge keeps left blocked, and the sample shape needs no change.
    const written = new Map(edit.changes);
    expect([ edit.changes.length, written.get(makeAutotileId(80, 0)), written.get(makeAutotileId(80, 16)), written.has(makeAutotileId(80, 47)) ])
      .toStrictEqual([ 47, MZ_BITS, MZ_BITS | 0x2, false ]);
  });

  it('blocks one way out of every shape of a kind, then opens it again', () =>
  {
    // Arrange: tall grass (A2 kind 36), a bush, and kind 37 beside it.
    const flags = fillKind(shippedLikeFlags(), 36, MZ_BITS | 0x40);

    // Act.
    const block = planFlagEdit(flags, makeAutotileId(36, 0), { mode: 'directions', direction: 'down' });
    const open = planFlagEdit(applied(flags, block.changes), makeAutotileId(36, 0), { mode: 'directions', direction: 'down' });

    // Assert.
    const ids = block.changes.map(([ id ]) => id);
    expect([ block.label, block.changes.length, Math.max(...ids), block.changes[0][1], open.label, open.changes[0][1] ])
      .toStrictEqual([ 'A2 decoration 21: down blocked', 48, makeAutotileId(36, 47), MZ_BITS | 0x40 | 0x1, 'A2 decoration 21: down open', MZ_BITS | 0x40 ]);
  });

  it('opens a way out of a ceiling only where its shape shows no edge that way, so a second click puts every shape back', () =>
  {
    // Arrange: ceiling kind 80 open with MZ's edges, its top edge (shape 20) blocking the way up, then the way up
    // blocked on every shape by a first click.
    const flags = shippedLikeFlags();
    flagIdsOf(makeAutotileId(80, 0)).forEach((id, shape) =>
    {
      flags[id] = MZ_BITS | ceilingPassage(shape);
    });
    const ceiling = makeAutotileId(80, 0);
    const blocked = applied(flags, planFlagEdit(flags, ceiling, { mode: 'directions', direction: 'up' }).changes);

    // Act.
    const reopened = applied(blocked, planFlagEdit(blocked, ceiling, { mode: 'directions', direction: 'up' }).changes);

    // Assert: the inside opens again, the top edge keeps the way up blocked, and every shape is back as it was.
    expect([ reopened[makeAutotileId(80, 0)], reopened[makeAutotileId(80, 20)], reopened.every((value, id) => value === flags[id]) ])
      .toStrictEqual([ MZ_BITS, MZ_BITS | 0x8, true ]);
  });

  it('opens a way out of every shape of a kind that is not a ceiling, the wall face under a ceiling included', () =>
  {
    // Arrange: wall face kind 88, on the row under ceiling kind 80, with the way up blocked on every shape.
    const flags = fillKind(shippedLikeFlags(), 88, MZ_BITS | 0x8);

    // Act.
    const edit = planFlagEdit(flags, makeAutotileId(88, 0), { mode: 'directions', direction: 'up' });

    // Assert.
    expect([ edit.label, edit.changes.length, edit.changes.every(([ , value ]) => value === MZ_BITS) ])
      .toStrictEqual([ 'A4 wall face 9: up open', 48, true ]);
  });

  it('touches only the way out clicked', () =>
  {
    // Arrange: an A5 tile with the way up blocked.
    const flags = shippedLikeFlags();
    flags[TileId.A5] = MZ_BITS | 0x8;

    // Act.
    const edit = planFlagEdit(flags, TileId.A5, { mode: 'directions', direction: 'left' });

    // Assert.
    expect(edit)
      .toStrictEqual({ label: 'A5 tile 1: left blocked', changes: [ [ TileId.A5, MZ_BITS | 0x8 | 0x2 ] ] });
  });

  it('switches a bush, a ladder, a counter or a damage floor on or off by what the tile shows', () =>
  {
    // Arrange: B tile 6 already a ladder; the rest plain.
    const flags = shippedLikeFlags();
    flags[5] = MZ_BITS | 0x20;

    // Act.
    const edits = [
      planFlagEdit(flags, makeAutotileId(36, 0), { mode: 'bush' }),
      planFlagEdit(flags, 5, { mode: 'ladder' }),
      planFlagEdit(flags, TileId.A5 + 1, { mode: 'counter' }),
      planFlagEdit(flags, 6, { mode: 'damage' }),
    ];

    // Assert.
    expect(edits.map(edit => [ edit.label, edit.changes.length, edit.changes[0][1] ]))
      .toStrictEqual([
        [ 'A2 decoration 21: bush on', 48, MZ_BITS | 0x40 ],
        [ 'B tile 6: ladder off', 1, MZ_BITS ],
        [ 'A5 tile 2: counter on', 1, MZ_BITS | 0x80 ],
        [ 'B tile 7: damage floor on', 1, MZ_BITS | 0x100 ],
      ]);
  });

  it('switches a flag back on just where it was when switched off, as MZ ships grass that is a bush on only some shapes', () =>
  {
    // Arrange: grass kind 20 a bush on every shape but its bottom corners, as MZ's world map ships it, switched off by a
    // first click.
    const flags = partBushGrass();
    const switchedOff = new SwitchedOffShapes();
    const grass = makeAutotileId(20, 0);
    const off = applied(flags, planFlagEdit(flags, grass, { mode: 'bush' }, switchedOff).changes);

    // Act.
    const on = planFlagEdit(off, grass, { mode: 'bush' }, switchedOff);

    // Assert: a bush again on the 40 shapes it was, and every shape back as MZ shipped it.
    const after = applied(off, on.changes);
    expect([ on.label, on.changes.length, after.every((value, id) => value === flags[id]) ])
      .toStrictEqual([ 'A2 decoration 5: bush on', 40, true ]);
  });

  it('switches a flag on every shape of a kind it was never switched off on here, and a different flag likewise', () =>
  {
    // Arrange: grass kind 20 a bush on all but its bottom corners, switched off; kind 21 beside it, and the ladder on
    // kind 20 itself, never switched off.
    const flags = partBushGrass();
    const switchedOff = new SwitchedOffShapes();
    const off = applied(flags, planFlagEdit(flags, makeAutotileId(20, 0), { mode: 'bush' }, switchedOff).changes);

    // Act.
    const edits = [
      planFlagEdit(off, makeAutotileId(21, 0), { mode: 'bush' }, switchedOff),
      planFlagEdit(off, makeAutotileId(20, 0), { mode: 'ladder' }, switchedOff),
    ];

    // Assert.
    expect(edits.map(edit => [ edit.label, edit.changes.length ]))
      .toStrictEqual([ [ 'A2 decoration 6: bush on', 48 ], [ 'A2 decoration 5: ladder on', 48 ] ]);
  });

  it('counts a terrain tag up and down, going round between 7 and 0, keeping every other bit', () =>
  {
    // Arrange: B tile 6 has no tag and is blocked; B tile 7 has tag 7.
    const flags = shippedLikeFlags();
    flags[5] = MZ_BITS | 0x0f;
    flags[6] = MZ_BITS | 0x7000;

    // Act.
    const edits = [
      planFlagEdit(flags, 5, { mode: 'terrain', delta: 1 }),
      planFlagEdit(flags, 6, { mode: 'terrain', delta: 1 }),
      planFlagEdit(flags, 5, { mode: 'terrain', delta: -1 }),
    ];

    // Assert.
    expect(edits)
      .toStrictEqual([
        { label: 'B tile 6: terrain tag 1', changes: [ [ 5, MZ_BITS | 0x0f | 0x1000 ] ] },
        { label: 'B tile 7: terrain tag 0', changes: [ [ 6, MZ_BITS ] ] },
        { label: 'B tile 6: terrain tag 7', changes: [ [ 5, MZ_BITS | 0x0f | 0x7000 ] ] },
      ]);
  });

  it('changes nothing for the empty tile', () =>
  {
    // Arrange.
    const flags = shippedLikeFlags();

    // Act.
    const edit = planFlagEdit(flags, 0, { mode: 'passage' });

    // Assert.
    expect(edit)
      .toStrictEqual({ label: '', changes: [] });
  });
});

describe('SwitchedOffShapes', () =>
{
  it('recalls the shapes noted for a kind and a flag, and none for a kind or flag never noted', () =>
  {
    // Arrange: the bush on kind 20 noted as on shapes 0 and 5.
    const switchedOff = new SwitchedOffShapes();
    switchedOff.remember(20, 0x40, [ 0, 5 ]);

    // Act.
    const recalled = [ switchedOff.recall(20, 0x40), switchedOff.recall(21, 0x40), switchedOff.recall(20, 0x20) ];

    // Assert.
    expect(recalled)
      .toStrictEqual([ [ 0, 5 ], [], [] ]);
  });
});

describe('switchedOffShapesFor', () =>
{
  it('keeps one note per tileset for the window', () =>
  {
    // Arrange: nothing; the window starts with no notes.

    // Act.
    const [ first, again, other ] = [ switchedOffShapesFor(1), switchedOffShapesFor(1), switchedOffShapesFor(2) ];

    // Assert.
    expect([ first === again, first === other ])
      .toStrictEqual([ true, false ]);
  });
});

describe('editTilesetFlags', () =>
{
  /**
   * Builds a tileset row.
   * @param {number} id The tileset id.
   * @param {number[]} flags Its flags.
   * @returns {RmmzTileset} The row.
   */
  const tilesetRow = (id: number, flags: number[]): RmmzTileset => ({ id, flags, mode: 1, name: `Tileset ${id}`, note: '', tilesetNames: [ 'A1', 'A2', '', '', '', 'B', '', '', '' ] });

  /**
   * A hub holding two tilesets: the first with a full flags list, the second with one a tool wrote short.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('tilesets', [ null, tilesetRow(1, shippedLikeFlags()), tilesetRow(2, new Array<number>(1587).fill(MZ_BITS)) ] as unknown as JsonValue);
    return hub;
  };

  /**
   * Reads a tileset's flags from the hub.
   * @param {DocumentHub} hub The hub.
   * @param {number} tilesetId The tileset.
   * @returns {number[]} Its flags.
   */
  const flagsOf = (hub: DocumentHub, tilesetId: number): number[] => hub.document('tilesets').valueAt([ tilesetId, 'flags' ]) as number[];

  it('writes an edit to one tileset as one step in the tilesets\' history, which undo takes back', () =>
  {
    // Arrange.
    const hub = buildHub();
    const edit = planFlagEdit(flagsOf(hub, 1), 5, { mode: 'passage' });

    // Act.
    const step = editTilesetFlags(hub, 1, edit);
    const after = [ flagsOf(hub, 1)[5], flagsOf(hub, 1)[6], flagsOf(hub, 2)[5] ];
    hub.undo('tilesets');

    // Assert.
    expect([ step?.label, step?.histories, after, flagsOf(hub, 1)[5], hub.history('tilesets').rows.length ])
      .toStrictEqual([ 'B tile 6: blocked', [ 'tilesets' ], [ MZ_BITS | 0x0f, MZ_BITS, MZ_BITS ], MZ_BITS, 1 ]);
  });

  it('fills a short flags list out with zeros in the same step, and undo takes them back out', () =>
  {
    // Arrange: tileset 2's list stops at id 1586, before any autotile.
    const hub = buildHub();
    const edit = planFlagEdit(flagsOf(hub, 2), makeAutotileId(20, 0), { mode: 'passage' });

    // Act.
    editTilesetFlags(hub, 2, edit);
    const after = [ flagsOf(hub, 2).length, flagsOf(hub, 2)[1586], flagsOf(hub, 2)[1587], flagsOf(hub, 2)[makeAutotileId(20, 3)] ];
    hub.undo('tilesets');

    // Assert.
    expect([ after, flagsOf(hub, 2).length ])
      .toStrictEqual([ [ TileId.MAX, MZ_BITS, 0, 0x0f ], 1587 ]);
  });

  it('records nothing for an edit that changes nothing', () =>
  {
    // Arrange.
    const hub = buildHub();

    // Act.
    const step = editTilesetFlags(hub, 1, { label: '', changes: [] });

    // Assert.
    expect([ step, hub.history('tilesets').rows ])
      .toStrictEqual([ null, [] ]);
  });

  it('refuses a tileset with no flags', () =>
  {
    // Arrange: tileset 3 does not exist.
    const hub = buildHub();

    // Act.
    const edit = () => editTilesetFlags(hub, 3, { label: 'x', changes: [ [ 5, 1 ] ] });

    // Assert.
    expect(edit)
      .toThrow('tileset 3 has no flags to edit');
  });
});

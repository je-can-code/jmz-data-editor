import { afterEach, describe, expect, it, vi } from 'vitest';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import type { StampOutcome } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import type { TilesetLayering } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { regionBrush, SHADOW_BRUSH, singleTileBrush, tileBrush, type Brush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { INITIAL_PAINT_SETTINGS, PaintState, type BlueprintInHand, type PaintSettings, type StampFit } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { ToolSession, type ToolPointer } from '../../../../src/mapEditor/core/tools/ToolSession.ts';
import { holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { fill, kindTile, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';
import { benchWith, cellsOf, layeringWith, stackAt, type PaintBench } from './support/paintFixtures.ts';

/*
 * One map view's painting.
 *
 * The session is what the tools do between a press of the left button and its release, and the promises it keeps are
 * the ones a person relies on at the canvas: every tool changes exactly what it should; every edit, a whole stroke
 * however long, is one step of the map's history, and undo takes it back to the very cells it found while redo puts
 * every one of them back; what a stroke paints with (the brush, the layer, Shift) is fixed when it starts; Escape
 * abandons whatever is in progress; and a failure mid-stroke never leaves a stroke open. Before and during a drag it
 * answers with what the map should show: the brush cursor, the ghost preview and the selection.
 */
const GRASS = 16;
const DIRT = 18;
const CLIFF_CORNER = TileId.A5 + 122;
const ROCK = TileId.A5 + 97;
const TREE = 10;

/**
 * A session over a bench, with the window's settings it reads and writes.
 */
type SessionBench = PaintBench & {
  readonly session: ToolSession;
  readonly state: PaintState;
};

/**
 * Builds a session painting on a bench's map.
 * @param {PaintBench} bench The bench.
 * @param {Partial<PaintSettings>} settings The settings to start from.
 * @param {TilesetLayering} layering The tileset's layering.
 * @returns {SessionBench} The session and its settings, with the bench.
 */
const sessionOn = (bench: PaintBench, settings: Partial<PaintSettings>, layering: TilesetLayering = layeringWith()): SessionBench =>
{
  const state = new PaintState({ ...INITIAL_PAINT_SETTINGS, ...settings });
  const session = new ToolSession({
    hub: bench.hub,
    map: () => bench.map,
    layering: () => layering,
    settings: () => state.settings,
    pickBrush: brush => state.setBrush(brush),
    pickTool: tool => state.setTool(tool),
    linkRefusal: () => null,
  });
  state.subscribe(next => session.toolChanged(next.tool));
  return { ...bench, session, state };
};

/**
 * Builds a pointer over a cell, with the keys held.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {Partial<ToolPointer>} keys The keys held, and any other field to change.
 * @returns {ToolPointer} The pointer.
 */
const at = (x: number, y: number, keys: Partial<ToolPointer> = {}): ToolPointer =>
{
  return { cell: { x, y }, quarter: { x, y, quarter: 0 }, shift: false, copy: false, override: false, ...keys };
};

/**
 * Drags the left button through cells: pressed on the first, moved through the rest, released on the last.
 * @param {ToolSession} session The session.
 * @param {ToolPointer[]} pointers The pointer at each step.
 */
const drag = (session: ToolSession, pointers: ToolPointer[]): void =>
{
  session.press(pointers[0]);
  pointers.slice(1).forEach(pointer => session.move(pointer));
  session.release(pointers[pointers.length - 1]);
};

/**
 * Builds a 4x3 map of grass joined all round, with a tree over its top-left cell.
 * @param {TestGrid} grid The map.
 */
const meadow = (grid: TestGrid): void =>
{
  fill(grid, 0, 0, 3, 2, 0, makeAutotileId(GRASS, 0));
  put(grid, 0, 0, 3, TREE);
};

/**
 * Runs one edit through a session, then undoes and redoes it, recording the map at each point.
 * @param {SessionBench} bench The session and bench.
 * @param {(session: ToolSession) => void} edit What the tool does.
 * @returns {{ before: number[], after: number[], undone: number[], redone: number[], labels: string[] }} The map
 * before, after, undone and redone, and the history's rows.
 */
const roundTrip = (bench: SessionBench, edit: (session: ToolSession) => void) =>
{
  const { hub, map, history, session } = bench;
  const before = cellsOf(map);
  edit(session);
  const after = cellsOf(map);
  const labels = hub.history(history).rows.map(row => row.label);
  hub.undo(history);
  const undone = cellsOf(map);
  hub.redo(history);
  return { before, after, undone, redone: cellsOf(map), labels };
};

describe('ToolSession: every tool round-trips through undo as one step', () =>
{
  /**
   * The tools, each with the settings it is used with and what it does.
   */
  const cases: { name: string; settings: Partial<PaintSettings>; edit: (session: ToolSession) => void; label: string }[] = [
    { name: 'the pen', settings: { tool: 'pen', brush: singleTileBrush(kindTile(DIRT)) }, edit: session => drag(session, [ at(0, 1), at(3, 1) ]), label: 'Paint tiles' },
    { name: 'the rectangle', settings: { tool: 'rectangle', brush: singleTileBrush(ROCK) }, edit: session => drag(session, [ at(1, 0), at(2, 2) ]), label: 'Draw a rectangle' },
    { name: 'the ellipse', settings: { tool: 'ellipse', brush: singleTileBrush(ROCK) }, edit: session => drag(session, [ at(0, 0), at(2, 2) ]), label: 'Draw an ellipse' },
    { name: 'the fill', settings: { tool: 'fill', brush: singleTileBrush(kindTile(DIRT)) }, edit: session => drag(session, [ at(2, 2) ]), label: 'Fill' },
    { name: 'the eraser', settings: { tool: 'eraser', brush: null }, edit: session => drag(session, [ at(0, 0), at(1, 1) ]), label: 'Erase tiles' },
    { name: 'the shadow pen', settings: { tool: 'pen', brush: SHADOW_BRUSH }, edit: session => drag(session, [ at(0, 0), at(1, 0, { quarter: { x: 1, y: 0, quarter: 1 } }) ]), label: 'Add shadows' },
    { name: 'the region pen', settings: { tool: 'pen', brush: regionBrush(4) }, edit: session => drag(session, [ at(0, 2), at(3, 2) ]), label: 'Paint regions' },
    { name: 'the swap', settings: { tool: 'swap', brush: singleTileBrush(kindTile(DIRT)) }, edit: session => drag(session, [ at(3, 2) ]), label: 'Swap tiles' },
  ];

  cases.forEach(({ name, settings, edit, label }) =>
  {
    it(`${name} changes the map as one step, undone to the very cells it found and redone`, () =>
    {
      // Arrange.
      const bench = sessionOn(benchWith(4, 3, meadow), settings);

      // Act.
      const { before, after, undone, redone, labels } = roundTrip(bench, edit);

      // Assert.
      expect([ after === before || after.join() === before.join(), labels, undone, redone ])
        .toEqual([ false, [ label ], before, after ]);
    });
  });

  it('the select tool moves an area as one step, undone and redone', () =>
  {
    // Arrange: a selection over the tree's cell.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'select' });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged from inside the selection two cells right.
    const { before, after, undone, redone, labels } = roundTrip(bench, session => drag(session, [ at(0, 0), at(2, 0) ]));

    // Assert.
    expect([ stackAt(bench.map, 2, 0)[3], after.join() === before.join(), labels, undone, redone ])
      .toEqual([ TREE, false, [ 'Move tiles' ], before, after ]);
  });
});

describe('ToolSession: the pen', () =>
{
  it('paints every cell it is dragged across and none it is not, as it goes', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act: pressed at 0, 1 and dragged straight to 3, 1, looking at the map before the release.
    bench.session.press(at(0, 1));
    bench.session.move(at(3, 1));
    const midway = [ 0, 1, 2, 3 ].map(x => bench.map.cellAt(x, 1, 0));
    bench.session.release(at(3, 1));

    // Assert: the whole row, and the row above still grass, only reshaped to show its edge.
    expect([ midway, stackAt(bench.map, 1, 0), bench.map.cellAt(1, 0, 0) === makeAutotileId(GRASS, 0) ])
      .toEqual([ [ ROCK, ROCK, ROCK, ROCK ], [ 'k16', 0, 0, 0 ], false ]);
  });

  it('paints the exact shape with Shift held at the press, leaving the neighbours\' shapes alone', () =>
  {
    // Arrange: grass in shape 9.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(makeAutotileId(DIRT, 9)) });

    // Act: Shift held at the press, let go before the release.
    bench.session.press(at(1, 1, { shift: true }));
    bench.session.release(at(1, 1));

    // Assert: dirt in shape 9 exactly, and the grass beside it still joined all round.
    expect([ bench.map.cellAt(1, 1, 0), bench.map.cellAt(2, 1, 0) ])
      .toEqual([ makeAutotileId(DIRT, 9), makeAutotileId(GRASS, 0) ]);
  });

  it('paints one stroke on the override\'s layer while its key is held, and automatically once let go', () =>
  {
    // Arrange: the override set to layer 3.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK), overrideLayer: 2 });

    // Act: one stroke with the key held, one without.
    drag(bench.session, [ at(1, 1, { override: true }) ]);
    drag(bench.session, [ at(2, 1) ]);

    // Assert: the rock laid on layer 3 over the grass, then replacing the grass on layer 1.
    expect([ stackAt(bench.map, 1, 1), stackAt(bench.map, 2, 1) ])
      .toEqual([ [ 'k16', 0, ROCK, 0 ], [ ROCK, 0, 0, 0 ] ]);
  });

  it('keeps the layer it started with when the override\'s key is let go mid-stroke', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act: pressed with the key held, which is let go before the stroke moves on.
    bench.session.press(at(1, 1, { override: true }));
    bench.session.keys({ shift: false, copy: false, override: false });
    bench.session.move(at(2, 1));
    bench.session.release(at(2, 1));

    // Assert: both cells on layer 3.
    expect([ stackAt(bench.map, 1, 1)[2], stackAt(bench.map, 2, 1)[2] ])
      .toEqual([ ROCK, ROCK ]);
  });

  it('lays a marked tile over the ground, as automatic layering does', () =>
  {
    // Arrange: the cliff corner marked to go on top.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(CLIFF_CORNER) }, layeringWith([ CLIFF_CORNER ]));

    // Act.
    drag(bench.session, [ at(2, 2) ]);

    // Assert.
    expect(stackAt(bench.map, 2, 2))
      .toEqual([ 'k16', CLIFF_CORNER, 0, 0 ]);
  });

  it('does nothing with nothing in hand', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: null });
    const before = cellsOf(bench.map);

    // Act.
    drag(bench.session, [ at(0, 0), at(3, 2) ]);

    // Assert.
    expect([ cellsOf(bench.map), bench.hub.history(bench.history).rows ])
      .toEqual([ before, [] ]);
  });
});

describe('ToolSession: shapes', () =>
{
  it('previews a rectangle while it is dragged and changes nothing until the release', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'rectangle', brush: singleTileBrush(ROCK) });
    const before = cellsOf(bench.map);

    // Act.
    bench.session.press(at(0, 1));
    bench.session.move(at(2, 2));
    const overlay = bench.session.overlay();
    const midway = cellsOf(bench.map);
    bench.session.release(at(2, 2));

    // Assert: six ghosts and the rectangle's extent, the map untouched, then six rocks.
    const rocks = [ 0, 1, 2 ].flatMap(x => [ 1, 2 ].map(y => bench.map.cellAt(x, y, 0))).filter(tileId => tileId === ROCK).length;
    expect([ overlay.ghostTiles.length, overlay.hover, midway, rocks ])
      .toEqual([ 6, { x: 0, y: 1, width: 3, height: 2 }, before, 6 ]);
  });

  it('lands nothing when Escape abandons the drag', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'ellipse', brush: singleTileBrush(ROCK) });
    const before = cellsOf(bench.map);

    // Act.
    bench.session.press(at(0, 0));
    bench.session.move(at(3, 2));
    bench.session.escape();
    bench.session.release(at(3, 2));

    // Assert.
    expect([ cellsOf(bench.map), bench.hub.history(bench.history).rows ])
      .toEqual([ before, [] ]);
  });
});

describe('ToolSession: the eyedropper', () =>
{
  it('picks the tiles dragged over, shapes and all, and goes back to the tool used before it', () =>
  {
    // Arrange: grass in shape 5 beside the tree, the swap in hand before the eyedropper.
    const bench = sessionOn(benchWith(4, 3, grid =>
    {
      meadow(grid);
      put(grid, 1, 0, 0, makeAutotileId(GRASS, 5));
    }), { tool: 'swap' });
    bench.state.setTool('eyedropper');

    // Act.
    drag(bench.session, [ at(0, 0), at(1, 0) ]);

    // Assert: the brush names the map's tileset (4), so it paints only on maps drawn with it.
    expect([ bench.state.settings.brush, bench.state.settings.tool ])
      .toEqual([ { kind: 'tiles', width: 2, height: 1, cells: [ TREE, makeAutotileId(GRASS, 5) ], tilesetId: 4 }, 'swap' ]);
  });

  it('picks from the override\'s layer while its key is held', () =>
  {
    // Arrange: the override on layer 1.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'eyedropper', overrideLayer: 0 });

    // Act: the tree's cell, with the key held.
    drag(bench.session, [ at(0, 0, { override: true }) ]);

    // Assert: the grass beneath the tree.
    expect(bench.state.settings.brush?.cells)
      .toEqual([ makeAutotileId(GRASS, 0) ]);
  });
});

describe('ToolSession: the select tool', () =>
{
  it('selects the area dragged over, and a press inside it copies with Ctrl held', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'select' });
    drag(bench.session, [ at(0, 0), at(1, 0) ]);
    const selected = bench.session.selection;

    // Act: dragged down a row with Ctrl held.
    drag(bench.session, [ at(0, 0, { copy: true }), at(0, 1, { copy: true }) ]);

    // Assert: the tree in both places, and the selection following the copy.
    expect([ selected, stackAt(bench.map, 0, 0)[3], stackAt(bench.map, 0, 1)[3], bench.session.selection, bench.hub.history(bench.history).rows.map(row => row.label) ])
      .toEqual([ { x: 0, y: 0, width: 2, height: 1 }, TREE, TREE, { x: 0, y: 1, width: 2, height: 1 }, [ 'Copy tiles' ] ]);
  });

  it('shows the lifted area where it would land while it is dragged', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'select' });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act.
    bench.session.press(at(0, 0));
    bench.session.move(at(1, 2));
    const overlay = bench.session.overlay();

    // Assert: the grass and the tree as ghosts one right and two down.
    expect([ overlay.ghostTiles.map(({ x, y, layer }) => [ x, y, layer ]), overlay.selectedCells, overlay.hoverLabel ])
      .toEqual([ [ [ 1, 2, 0 ], [ 1, 2, 3 ] ], { x: 1, y: 2, width: 1, height: 1 }, 'Move' ]);
  });

  it('lets the selection go on Escape, and when another tool is taken up', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'select' });
    drag(bench.session, [ at(0, 0), at(1, 1) ]);

    // Act.
    bench.session.escape();
    const afterEscape = bench.session.selection;
    drag(bench.session, [ at(0, 0), at(1, 1) ]);
    bench.state.setTool('pen');

    // Assert.
    expect([ afterEscape, bench.session.selection ])
      .toEqual([ null, null ]);
  });
});

/*
 * A placement of a blueprint's tiles travels with an area the select tool drags when the area holds it whole, every
 * layer it is compared on carried: moved, its spot follows the tiles, and one undo takes both back; copied, it is recorded
 * again where the copy lands. One the area holds only in part stays where it was.
 *
 * The tree (aa22) is a blueprint of one cell, on layer 4, placed at 0, 0; the grass strip (bb33) is two cells of the
 * ground, placed at 0, 2.
 */
describe('ToolSession: placements the select tool drags', () =>
{
  /**
   * A stamp of a size carrying the layers given.
   * @param {number} width The width.
   * @param {readonly number[]} layers The layers carried.
   * @returns {Stamp} The stamp.
   */
  const carrying = (width: number, layers: readonly number[]): Stamp =>
  {
    const values = new Array<number>(width * layers.length).fill(0);
    return stampOf({ width, tiles: { layers: [ ...layers ], values, calledFor: values.map(() => -1) }, events: [] });
  };

  /**
   * Builds a session with the select tool over the meadow, holding the two blueprints and their placements.
   * @returns {SessionBench} The session.
   */
  const placedMeadow = (): SessionBench =>
  {
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'select' });
    holdBlueprints(bench.hub, { aa22: { name: 'Tree', stamp: carrying(1, [ 3 ]) }, bb33: { name: 'Strip', stamp: carrying(2, [ 0 ]) } });
    holdBlueprintUses(bench.hub, [ { blueprintId: 'aa22', mapId: 1, x: 0, y: 0 }, { blueprintId: 'bb33', mapId: 1, x: 0, y: 2 } ]);
    return bench;
  };

  /**
   * Lists the placements the bench's record holds.
   * @param {SessionBench} bench The bench.
   * @returns {PlacedSpot[]} The placements.
   */
  const placements = (bench: SessionBench): PlacedSpot[] => usesOf(bench.hub.document(BLUEPRINT_USES_DOCUMENT));

  it('moves a placement the dragged area holds whole with it, as one step that one undo takes back', () =>
  {
    // Arrange: the tree's cell selected.
    const bench = placedMeadow();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged two cells right, then undone.
    drag(bench.session, [ at(0, 0), at(2, 0) ]);
    const moved = placements(bench);
    bench.hub.undo(bench.history);

    // Assert.
    expect([ moved, placements(bench) ])
      .toEqual([
        [ { blueprintId: 'aa22', x: 2, y: 0, mapId: 1 }, { blueprintId: 'bb33', x: 0, y: 2, mapId: 1 } ],
        [ { blueprintId: 'aa22', x: 0, y: 0, mapId: 1 }, { blueprintId: 'bb33', x: 0, y: 2, mapId: 1 } ],
      ]);
  });

  it('records a placement again where a copy of the area lands, the original staying', () =>
  {
    // Arrange.
    const bench = placedMeadow();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged a row down with Ctrl held.
    drag(bench.session, [ at(0, 0, { copy: true }), at(0, 1, { copy: true }) ]);

    // Assert.
    expect(placements(bench))
      .toEqual([
        { blueprintId: 'aa22', x: 0, y: 0, mapId: 1 },
        { blueprintId: 'aa22', x: 0, y: 1, mapId: 1 },
        { blueprintId: 'bb33', x: 0, y: 2, mapId: 1 },
      ]);
  });

  it('leaves a placement the area holds only in part where it was', () =>
  {
    // Arrange: one cell of the strip's two selected.
    const bench = placedMeadow();
    drag(bench.session, [ at(0, 2), at(0, 2) ]);

    // Act.
    drag(bench.session, [ at(0, 2), at(3, 2) ]);

    // Assert: the tiles moved, the strip's placement did not.
    expect([ bench.hub.history(bench.history).rows.map(row => row.label), placements(bench) ])
      .toEqual([ [ 'Move tiles' ], [ { blueprintId: 'aa22', x: 0, y: 0, mapId: 1 }, { blueprintId: 'bb33', x: 0, y: 2, mapId: 1 } ] ]);
  });

  it('moves a placed copy with its events, their links and its spot together, one undo putting all of it back byte for byte', () =>
  {
    // Arrange: the tree's placement with a copy of the tree's event standing on it, linked to it.
    const link = withBlueprintLink('', { blueprintId: 'aa22', eventId: 1, differences: [] });
    const bench = sessionOn(benchWith(4, 3, meadow, [ null, { ...createMapEvent(1, 0, 0), name: 'Sentry', note: link } ]), { tool: 'select' });
    holdBlueprints(bench.hub, { aa22: { name: 'Tree', stamp: carrying(1, [ 3 ]) } });
    holdBlueprintUses(bench.hub, [ { blueprintId: 'aa22', mapId: 1, x: 0, y: 0 } ]);
    const before = JSON.stringify(bench.map.toJson());
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged two cells right, then undone.
    drag(bench.session, [ at(0, 0), at(2, 0) ]);
    const sentry = bench.map.event(1);
    const moved = [ sentry?.x, sentry?.y, sentry?.note, stackAt(bench.map, 2, 0)[3], placements(bench) ];
    bench.hub.undo(bench.history);

    // Assert.
    expect([ moved, JSON.stringify(bench.map.toJson()) === before, placements(bench) ])
      .toEqual([
        [ 2, 0, link, TREE, [ { blueprintId: 'aa22', x: 2, y: 0, mapId: 1 } ] ],
        true,
        [ { blueprintId: 'aa22', x: 0, y: 0, mapId: 1 } ],
      ]);
  });
});

/*
 * An area the select tool lifts with every layer carries the events standing on it along with its tiles, in one step:
 * moved, they keep their ids; copied, each goes down as a new event. Lifted from the chosen layer alone, it carries none,
 * as copying it into a stamp does. Events that cannot go there, landing on another event or, moved, off the map, refuse
 * the whole drop, which changes nothing, and the author hears why; while the area is dragged each shows a ghost where it
 * would land, and the words beside the area say when a drop there would be refused.
 *
 * On the meadow a sentry (event 1) stands on the tree's cell, a lamp (event 2) at 2, 0, and a well (event 3) at 3, 2.
 *
 * A copy carrying copies of blueprints, an event linked to one or a placement of one held whole, is refused on a map that
 * may hold none, as placing a blueprint or duplicating a linked event there is, the words beside the area saying so as it
 * is dragged; a copy carrying neither, and any move, which adds no copy, go down there as anywhere.
 */
describe('ToolSession: events the select tool drags', () =>
{
  /**
   * Why the map in these tests may hold no copy of a blueprint, when it may not.
   */
  const REFUSAL = 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it';

  /**
   * Builds a session with the select tool over the meadow and its three events, hearing what a drop tells the author.
   * @param {Partial<PaintSettings>} settings The settings to change from the select tool's.
   * @param {{ refusal?: string | null, sentryNote?: string }} gate Why the map may hold no copy of a blueprint, if it may
   * not, and the sentry's note.
   * @returns {{ bench: SessionBench, told: [ string, boolean ][] }} The session, and what it told.
   */
  const selecting = (settings: Partial<PaintSettings> = {}, gate: { readonly refusal?: string | null; readonly sentryNote?: string } = {}) =>
  {
    const { refusal = null, sentryNote = '' } = gate;
    const events = [ null, { ...createMapEvent(1, 0, 0), name: 'Sentry', note: sentryNote }, { ...createMapEvent(2, 2, 0), name: 'Lamp' }, { ...createMapEvent(3, 3, 2), name: 'Well' } ];
    const bench = benchWith(4, 3, meadow, events);
    const state = new PaintState({ ...INITIAL_PAINT_SETTINGS, tool: 'select', ...settings });
    const told: [ string, boolean ][] = [];
    const session = new ToolSession({
      hub: bench.hub,
      map: () => bench.map,
      layering: () => layeringWith(),
      settings: () => state.settings,
      pickBrush: brush => state.setBrush(brush),
      pickTool: tool => state.setTool(tool),
      told: (message, refused) => told.push([ message, refused ]),
      linkRefusal: () => refusal,
    });
    return { bench: { ...bench, session, state }, told };
  };

  /**
   * Reads where an event stands, or null once the map holds no such event.
   * @param {SessionBench} bench The bench.
   * @param {number} eventId The event.
   * @returns {[ number, number ] | null} Its cell.
   */
  const standing = (bench: SessionBench, eventId: number): [ number, number ] | null =>
  {
    const event = bench.map.event(eventId);
    return event === null ? null : [ event.x, event.y ];
  };

  it('moves the events standing on the area with its tiles, keeping their ids, as one step undone and redone', () =>
  {
    // Arrange: the tree's cell selected, the sentry on it.
    const { bench } = selecting();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged one right and one down.
    const { before, after, undone, redone, labels } = roundTrip(bench, session => drag(session, [ at(0, 0), at(1, 1) ]));
    const afterRedo = standing(bench, 1);
    bench.hub.undo(bench.history);
    const afterUndo = standing(bench, 1);

    // Assert: the lamp and the well, never on the area, stay where they stand.
    expect([ labels, undone, redone, after.join() === before.join(), afterRedo, afterUndo, standing(bench, 2), standing(bench, 3) ])
      .toEqual([ [ 'Move tiles and 1 event' ], before, after, false, [ 1, 1 ], [ 0, 0 ], [ 2, 0 ], [ 3, 2 ] ]);
  });

  it('copies the events standing on the area as new ones, the originals staying, as one step', () =>
  {
    // Arrange.
    const { bench } = selecting();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged a row down with Ctrl held.
    drag(bench.session, [ at(0, 0, { copy: true }), at(0, 1, { copy: true }) ]);

    // Assert: the copy takes the next free id, 4.
    expect([ bench.hub.history(bench.history).rows.map(row => row.label), standing(bench, 1), standing(bench, 4), bench.map.event(4)?.name, stackAt(bench.map, 0, 1)[3] ])
      .toEqual([ [ 'Copy tiles and 1 event' ], [ 0, 0 ], [ 0, 1 ], 'Sentry', TREE ]);
  });

  it('carries no events when lifted from the chosen layer alone', () =>
  {
    // Arrange: layer 4 alone, where the tree stands.
    const { bench } = selecting({ strip: 3 });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act.
    drag(bench.session, [ at(0, 0), at(1, 1) ]);

    // Assert: the tree moved; the sentry did not.
    expect([ bench.hub.history(bench.history).rows.map(row => row.label), stackAt(bench.map, 1, 1)[3], standing(bench, 1) ])
      .toEqual([ [ 'Move tiles' ], TREE, [ 0, 0 ] ]);
  });

  it('refuses a move landing an event on another, changing nothing, and says why', () =>
  {
    // Arrange.
    const { bench, told } = selecting();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);
    const before = cellsOf(bench.map);

    // Act: dragged two right, the sentry onto the lamp.
    drag(bench.session, [ at(0, 0), at(2, 0) ]);

    // Assert.
    expect([ told, cellsOf(bench.map), bench.hub.history(bench.history).rows, standing(bench, 1), bench.session.selection ])
      .toEqual([ [ [ 'Another event is in the way.', true ] ], before, [], [ 0, 0 ], { x: 0, y: 0, width: 1, height: 1 } ]);
  });

  it('refuses a move taking an event off the map, saying so as it is dragged and at the drop', () =>
  {
    // Arrange: the tree's cell and the one beside it selected, grabbed by the right one.
    const { bench, told } = selecting();
    drag(bench.session, [ at(0, 0), at(1, 0) ]);

    // Act: dragged one left, the sentry past the edge.
    bench.session.press(at(1, 0));
    bench.session.move(at(0, 0));
    const overlay = bench.session.overlay();
    bench.session.release(at(0, 0));

    // Assert.
    expect([ overlay.hoverLabel, overlay.ghostEvents, told, standing(bench, 1), bench.hub.history(bench.history).rows ])
      .toEqual([ 'An event would leave the map', [], [ [ 'The map ends there.', true ] ], [ 0, 0 ], [] ]);
  });

  it('leaves out of a copy an event landing past the map\'s edge, and says so', () =>
  {
    // Arrange: as above.
    const { bench, told } = selecting();
    drag(bench.session, [ at(0, 0), at(1, 0) ]);

    // Act: copied one left.
    drag(bench.session, [ at(1, 0, { copy: true }), at(0, 0, { copy: true }) ]);

    // Assert: the tiles copied, the sentry's copy left out.
    expect([ bench.hub.history(bench.history).rows.map(row => row.label), told, bench.map.event(4) ])
      .toEqual([ [ 'Copy tiles' ], [ [ 'One of the selection\'s events fell past the map\'s edge and was left out.', false ] ], null ]);
  });

  it('shows the events it carries as ghosts where they would land, and says when one would land on another', () =>
  {
    // Arrange.
    const { bench } = selecting();
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged one right and one down, then on to the lamp.
    bench.session.press(at(0, 0));
    bench.session.move(at(1, 1));
    const clear = bench.session.overlay();
    bench.session.move(at(2, 0));
    const blocked = bench.session.overlay();

    // Assert.
    expect([ clear.hoverLabel, clear.ghostEvents.map(({ x, y, eventId }) => [ x, y, eventId ]), clear.blockedCells, blocked.hoverLabel, blocked.blockedCells ])
      .toEqual([ 'Move', [ [ 1, 1, 1 ] ], [], 'Another event is in the way', [ { x: 2, y: 0 } ] ]);
  });

  it('refuses a copy carrying a linked event onto a map that may hold none, saying so as it is dragged and at the drop', () =>
  {
    // Arrange: the sentry linked to the tree's blueprint, its cell selected, on a map that refuses links.
    const link = withBlueprintLink('', { blueprintId: 'aa22', eventId: 1, differences: [] });
    const { bench, told } = selecting({}, { refusal: REFUSAL, sentryNote: link });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);
    const before = cellsOf(bench.map);

    // Act: dragged a row down with Ctrl held.
    bench.session.press(at(0, 0, { copy: true }));
    bench.session.move(at(0, 1, { copy: true }));
    const overlay = bench.session.overlay();
    bench.session.release(at(0, 1, { copy: true }));

    // Assert: nothing changed, and no copy of the sentry was made.
    expect([ overlay.hoverLabel, told, cellsOf(bench.map), bench.hub.history(bench.history).rows, bench.map.event(4) ])
      .toEqual([
        'Blueprints can\'t go here',
        [ [ 'The selection holds copies of blueprints, which can\'t go here: this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it.', true ] ],
        before,
        [],
        null,
      ]);
  });

  it('refuses a copy recording again a placement it holds whole on a map that may hold none', () =>
  {
    // Arrange: the tree's blueprint placed on its cell, which is selected, on a map that refuses links; the sentry on it
    // is a plain event.
    const { bench, told } = selecting({}, { refusal: REFUSAL });
    holdBlueprints(bench.hub, { aa22: { name: 'Tree', stamp: stampOf({ width: 1, tiles: { layers: [ 3 ], values: [ 0 ], calledFor: [ -1 ] }, events: [] }) } });
    holdBlueprintUses(bench.hub, [ { blueprintId: 'aa22', mapId: 1, x: 0, y: 0 } ]);
    drag(bench.session, [ at(0, 0), at(0, 0) ]);
    const before = cellsOf(bench.map);

    // Act: dragged a row down with Ctrl held.
    drag(bench.session, [ at(0, 0, { copy: true }), at(0, 1, { copy: true }) ]);

    // Assert: the placement is recorded once, where it was, and nothing else changed.
    expect([ told, cellsOf(bench.map), bench.hub.history(bench.history).rows, usesOf(bench.hub.document(BLUEPRINT_USES_DOCUMENT)) ])
      .toEqual([
        [ [ 'The selection holds copies of blueprints, which can\'t go here: this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it.', true ] ],
        before,
        [],
        [ { blueprintId: 'aa22', mapId: 1, x: 0, y: 0 } ],
      ]);
  });

  it('copies plain events and tiles on a map that may hold no copy of a blueprint', () =>
  {
    // Arrange: the sentry plain, its cell selected, on a map that refuses links.
    const { bench, told } = selecting({}, { refusal: REFUSAL });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged a row down with Ctrl held.
    bench.session.press(at(0, 0, { copy: true }));
    bench.session.move(at(0, 1, { copy: true }));
    const overlay = bench.session.overlay();
    bench.session.release(at(0, 1, { copy: true }));

    // Assert: the copy takes the next free id, 4.
    expect([ overlay.hoverLabel, told, bench.hub.history(bench.history).rows.map(row => row.label), standing(bench, 4), stackAt(bench.map, 0, 1)[3] ])
      .toEqual([ 'Copy', [], [ 'Copy tiles and 1 event' ], [ 0, 1 ], TREE ]);
  });

  it('moves a linked event on a map that may hold no copy of a blueprint, since a move makes no new copy', () =>
  {
    // Arrange: the sentry linked, its cell selected, on a map that refuses links.
    const link = withBlueprintLink('', { blueprintId: 'aa22', eventId: 1, differences: [] });
    const { bench, told } = selecting({}, { refusal: REFUSAL, sentryNote: link });
    drag(bench.session, [ at(0, 0), at(0, 0) ]);

    // Act: dragged a row down.
    bench.session.press(at(0, 0));
    bench.session.move(at(0, 1));
    const overlay = bench.session.overlay();
    bench.session.release(at(0, 1));

    // Assert: the sentry went with the tree, keeping its link.
    expect([ overlay.hoverLabel, told, bench.hub.history(bench.history).rows.map(row => row.label), standing(bench, 1), bench.map.event(1)?.note ])
      .toEqual([ 'Move', [], [ 'Move tiles and 1 event' ], [ 0, 1 ], link ]);
  });
});

describe('ToolSession: strokes that do not end with a release', () =>
{
  it('takes a stroke back entirely on Escape, leaving nothing in the history', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK) });
    const before = cellsOf(bench.map);

    // Act.
    bench.session.press(at(0, 1));
    bench.session.move(at(3, 1));
    bench.session.escape();

    // Assert.
    expect([ cellsOf(bench.map), bench.hub.history(bench.history).rows, bench.session.isActive ])
      .toEqual([ before, [], false ]);
  });

  it('keeps what a stroke painted when the pointer is lost', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act.
    bench.session.press(at(0, 1));
    bench.session.move(at(1, 1));
    bench.session.interrupt();

    // Assert.
    expect([ bench.map.cellAt(1, 1, 0), bench.hub.history(bench.history).rows.map(row => row.label) ])
      .toEqual([ ROCK, [ 'Paint tiles' ] ]);
  });

  describe('when a stroke fails', () =>
  {
    afterEach(() =>
    {
      vi.restoreAllMocks();
    });

    it('never leaves a stroke open, and raises the failure on its own', () =>
    {
      // Arrange: another edit already open in the window, so the stroke cannot begin one.
      const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(ROCK) });
      const raised: (() => void)[] = [];
      vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
      const other = bench.hub.begin('Other edit', [ bench.history ]);

      // Act.
      bench.session.press(at(0, 1));

      // Assert: nothing in progress, and the failure waiting to be raised on its own.
      expect([ bench.session.isActive, raised.length ])
        .toEqual([ false, 1 ]);
      expect(() => raised[0]())
        .toThrow('finish "Other edit" first');
      other.cancel();
    });
  });
});

describe('ToolSession: brushes from another tileset', () =>
{
  it('lays nothing with tiles picked from another tileset, and says so, where its own tileset\'s tiles paint', () =>
  {
    // Arrange: the bench map draws with tileset 4; the same dirt picked from tileset 7 and from tileset 4.
    const foreign = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: { ...singleTileBrush(kindTile(DIRT)), tilesetId: 7 } });
    const own = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: { ...singleTileBrush(kindTile(DIRT)), tilesetId: 4 } });
    const before = cellsOf(foreign.map);

    // Act: hovered, then a stroke and a fill with each.
    foreign.session.move(at(1, 1));
    const shown = foreign.session.overlay();
    drag(foreign.session, [ at(1, 1), at(2, 1) ]);
    foreign.state.setTool('fill');
    drag(foreign.session, [ at(3, 2) ]);
    drag(own.session, [ at(1, 1) ]);

    // Assert.
    expect([ cellsOf(foreign.map), foreign.hub.history(foreign.history).rows, shown.hoverLabel, shown.ghostTiles, stackAt(own.map, 1, 1)[0] ])
      .toEqual([ before, [], 'Picked from another tileset', [], 'k18' ]);
  });

  it('still paints regions and erases with a brush picked on another tileset\'s palette, since neither lays its tiles', () =>
  {
    // Arrange: a region brush and a tiles brush, both from tileset 7's palette.
    const regions = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: { ...regionBrush(6), tilesetId: 7 } });
    const eraser = sessionOn(benchWith(4, 3, meadow), { tool: 'eraser', brush: { ...singleTileBrush(kindTile(DIRT)), tilesetId: 7 } });

    // Act.
    drag(regions.session, [ at(2, 2) ]);
    drag(eraser.session, [ at(0, 0) ]);

    // Assert: the region painted, and the tree erased.
    expect([ regions.map.cellAt(2, 2, 5), stackAt(eraser.map, 0, 0)[3] ])
      .toEqual([ 6, 0 ]);
  });
});

describe('ToolSession: with the events in hand', () =>
{
  it('starts nothing at a press and shows nothing, where the pen paints the same press', () =>
  {
    // Arrange: the same brush, once with the events in hand and once with the pen.
    const events = sessionOn(benchWith(4, 3, meadow), { tool: 'events', brush: singleTileBrush(kindTile(DIRT)) });
    const pen = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(kindTile(DIRT)) });
    const before = cellsOf(events.map);

    // Act: hovered, then clicked, with each.
    events.session.move(at(1, 1));
    const shown = events.session.overlay();
    drag(events.session, [ at(1, 1) ]);
    drag(pen.session, [ at(1, 1) ]);

    // Assert: the events leave the map and its history alone and show nothing; the pen lays the dirt.
    expect([ cellsOf(events.map), events.hub.history(events.history).rows, shown, stackAt(pen.map, 1, 1)[0] ])
      .toEqual([ before, [], { hover: null, hoverLabel: null, ghostTiles: [], selectedCells: null, ghostEvents: [], blockedCells: [] }, 'k18' ]);
  });

  it('never goes back to the events once the eyedropper has picked, since what it picks is for painting', () =>
  {
    // Arrange: the events in hand, then the eyedropper taken up.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'events' });
    bench.state.setTool('eyedropper');

    // Act: the tree's cell picked.
    drag(bench.session, [ at(0, 0) ]);

    // Assert: the tree in hand, on the pen.
    expect([ bench.state.settings.brush?.cells, bench.state.settings.tool ])
      .toEqual([ [ TREE ], 'pen' ]);
  });
});

describe('ToolSession: what the map shows', () =>
{
  it('previews the pen under the pointer, and nothing once it leaves the map', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(TREE) });

    // Act.
    bench.session.move(at(2, 1));
    const over = bench.session.overlay();
    bench.session.leave();
    const gone = bench.session.overlay();

    // Assert.
    expect([ over.hover, over.hoverLabel, over.ghostTiles.length, gone ])
      .toEqual([
        { x: 2, y: 1, width: 1, height: 1 },
        'Auto: layer 4',
        1,
        { hover: null, hoverLabel: null, ghostTiles: [], selectedCells: null, ghostEvents: [], blockedCells: [] },
      ]);
  });

  it('follows Shift and the override\'s key as they go down, without the pointer moving', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: singleTileBrush(TREE) });
    bench.session.move(at(2, 1));

    // Act.
    bench.session.keys({ shift: true, copy: false, override: true });

    // Assert.
    expect(bench.session.overlay().hoverLabel)
      .toBe('Held: layer 3 (exact)');
  });

  it('keeps the words shown at the press on the cursor through the stroke, without a ghost', () =>
  {
    // Arrange.
    const bench = sessionOn(benchWith(4, 3, meadow), { tool: 'pen', brush: tileBrush([ ROCK, ROCK ], 2, 1) as Brush });
    bench.session.move(at(0, 1));

    // Act.
    bench.session.press(at(0, 1));
    bench.session.move(at(1, 2));
    const overlay = bench.session.overlay();
    bench.session.release(at(1, 2));

    // Assert.
    expect(overlay)
      .toEqual({ hover: { x: 1, y: 2, width: 2, height: 1 }, hoverLabel: 'Auto: layer 1', ghostTiles: [], selectedCells: null, ghostEvents: [], blockedCells: [] });
  });
});

/*
 * The stamp tool: with a stamp in hand, the map shows the stamp under the pointer, its corner on the cell, its tiles and
 * its events as ghosts and in red any tile where another event stands in the way; each click places it as one step of
 * the map's history, Shift laying its tiles exactly as copied, and the host hears what each click came to, refusals
 * included. With no stamp picked, a click does nothing and only the cell shows. A blueprint in hand places linked copies
 * of itself; over a map that may hold no link, a blueprint, or a stamp carrying copies of one, says so under the pointer
 * and is refused at the click. A stamp's copy of a blueprint no longer there is no copy any more: it goes down plain,
 * there too, and the author is told.
 *
 * The bench's 4x3 map holds grass all round, a tree over 0, 0, and no events.
 */
describe('ToolSession: the stamp', () =>
{
  /**
   * Builds a stamp of a 2 by 1 piece of dirt on the ground with one event on its right cell, from the bench's tileset.
   * @returns {Stamp} The stamp.
   */
  const dirtWithEvent = (): Stamp =>
  {
    const dirt = makeAutotileId(DIRT, 0);
    return stampOf({
      width: 2,
      height: 1,
      tilesetId: 4,
      tiles: { layers: [ 0 ], values: [ dirt, dirt ], calledFor: [ 0, 0 ] },
      events: [ { ...createMapEvent(7, 1, 0), note: 'event 7' } ],
    });
  };

  /**
   * Builds a session with a stamp in hand on the bench, hearing every outcome: a plain stamp, or a blueprint's stamp when
   * a blueprint is named, the window then holding that blueprint under its id and an empty record of placements; or a
   * stamp a brush took up with a fit.
   * @param {Stamp | null} stamp The stamp, or null for none picked.
   * @param {{ blueprint?: BlueprintInHand, refusal?: string, fit?: StampFit }} options The blueprint in hand, if any, why
   * the map may hold no links, if it may not, and how the stamp fits itself to the map, if it does.
   * @returns {{ bench: SessionBench, heard: StampOutcome[] }} The session and what it heard.
   */
  const stamping = (stamp: Stamp | null, options: { readonly blueprint?: BlueprintInHand; readonly refusal?: string; readonly fit?: StampFit } = {}) =>
  {
    const bench = benchWith(4, 3, meadow);
    const { blueprint = null, refusal = null, fit = null } = options;
    if (blueprint !== null)
    {
      holdBlueprints(bench.hub, { [blueprint.id]: { name: blueprint.name, stamp: stamp as Stamp } });
      holdBlueprintUses(bench.hub);
    }

    const state = new PaintState({ ...INITIAL_PAINT_SETTINGS, tool: 'stamp', stamp, blueprint, fit });
    const heard: StampOutcome[] = [];
    const session = new ToolSession({
      hub: bench.hub,
      map: () => bench.map,
      layering: () => layeringWith(),
      settings: () => state.settings,
      pickBrush: brush => state.setBrush(brush),
      pickTool: tool => state.setTool(tool),
      stamped: outcome => heard.push(outcome),
      linkRefusal: () => refusal,
    });
    return { bench: { ...bench, session, state }, heard };
  };

  it('previews the stamp with its corner under the pointer: its footprint, its tiles and its events', () =>
  {
    // Arrange.
    const { bench } = stamping(dirtWithEvent());

    // Act.
    bench.session.move(at(1, 2));
    const overlay = bench.session.overlay();

    // Assert: the event lands one right of the corner.
    expect([ overlay.hover, overlay.hoverLabel, overlay.ghostTiles.map(ghost => [ ghost.x, ghost.y, ghost.layer ]), overlay.ghostEvents.map(ghost => [ ghost.x, ghost.y ]), overlay.blockedCells ])
      .toEqual([ { x: 1, y: 2, width: 2, height: 1 }, 'Stamp', [ [ 1, 2, 0 ], [ 2, 2, 0 ] ], [ [ 2, 2 ] ], [] ]);
  });

  it('places the stamp with each click as one step, naming what went down, and hands over what came of it', () =>
  {
    // Arrange.
    const { bench, heard } = stamping(dirtWithEvent());

    // Act: two clicks in different places.
    drag(bench.session, [ at(0, 1) ]);
    drag(bench.session, [ at(2, 0) ]);
    const labels = bench.hub.history(bench.history).rows.map(row => row.label);
    const placed = [ bench.map.event(1)?.x, bench.map.event(2)?.x ];

    // Assert: the event took ids 1 and 2 on a map holding none, each stamp its own step.
    expect([ labels, placed, stackAt(bench.map, 0, 1)[0], heard.map(outcome => outcome.ok && outcome.eventIds) ])
      .toEqual([ [ 'Stamp 2 by 1 tiles and 1 event', 'Stamp 2 by 1 tiles and 1 event' ], [ 1, 3 ], 'k18', [ [ 1 ], [ 2 ] ] ]);
  });

  it('hands over a refusal, changing nothing, when an event would land on another', () =>
  {
    // Arrange: one click places the stamp; a second at the same spot would land its event on the first's.
    const { bench, heard } = stamping(dirtWithEvent());
    drag(bench.session, [ at(0, 1) ]);
    const after = cellsOf(bench.map);

    // Act.
    bench.session.move(at(0, 1));
    const blocked = bench.session.overlay();
    drag(bench.session, [ at(0, 1) ]);

    // Assert.
    expect([ blocked.blockedCells, blocked.hoverLabel, heard[1], cellsOf(bench.map), bench.hub.history(bench.history).rows.length ])
      .toEqual([ [ { x: 1, y: 1 } ], 'Another event is in the way', { ok: false, message: 'The stamp\'s event would land on another event.' }, after, 1 ]);
  });

  it('lays the tiles exactly as copied with Shift held, its edges included', () =>
  {
    // Arrange: grass that met nothing at its left edge, shaped by hand, stamped into the middle of the meadow.
    const odd = makeAutotileId(GRASS, 5);
    const { bench } = stamping(stampOf({ events: [], tiles: { layers: [ 0 ], values: [ odd ], calledFor: [ 9 ] } }));

    // Act.
    drag(bench.session, [ at(1, 1, { shift: true }) ]);

    // Assert.
    expect(bench.map.cellAt(1, 1, 0))
      .toBe(odd);
  });

  it('does nothing at a click with no stamp picked, showing only the cell', () =>
  {
    // Arrange.
    const { bench, heard } = stamping(null);
    const before = cellsOf(bench.map);

    // Act.
    bench.session.move(at(1, 1));
    const overlay = bench.session.overlay();
    drag(bench.session, [ at(1, 1) ]);

    // Assert.
    expect([ overlay.hover, overlay.ghostTiles, cellsOf(bench.map), heard ])
      .toEqual([ { x: 1, y: 1, width: 1, height: 1 }, [], before, [] ]);
  });

  it('places a blueprint in hand as linked copies, one step named for it, with each click', () =>
  {
    // Arrange: the dirt and its event saved as the blueprint "Dirt patch".
    const { bench, heard } = stamping(dirtWithEvent(), { blueprint: { id: 'k3x9q2mf', name: 'Dirt patch' } });

    // Act.
    drag(bench.session, [ at(0, 1) ]);

    // Assert: the copy is event 1, linked to the blueprint's event 7, and the dirt went down too.
    expect([ heard, bench.map.event(1)?.note, stackAt(bench.map, 0, 1)[0], bench.hub.history(bench.history).rows.map(row => row.label) ])
      .toEqual([
        [ { ok: true, step: expect.objectContaining({ label: 'Place blueprint "Dirt patch"' }), eventIds: [ 1 ], notes: [] } ],
        'event 7\n<blueprint:[k3x9q2mf, 7]>',
        'k18',
        [ 'Place blueprint "Dirt patch"' ],
      ]);
  });

  it('places a stamp a brush fitted to the map as it fits the map at each click, and says what fitting it came to', () =>
  {
    // Arrange: a brush whose stamp's event notes how many events the map held as it was fitted, beside the stamp it holds.
    const held = stampOf({ events: [ { ...createMapEvent(1, 0, 0), note: 'held' } ] });
    const fit: StampFit = map => ({
      stamp: stampOf({ events: [ { ...createMapEvent(1, 0, 0), note: `fitted to ${map.eventIds().length}` } ] }),
      words: `Level ${map.eventIds().length + 10} · this map's level`,
    });
    const { bench, heard } = stamping(held, { fit });

    // Act: the preview over an empty map, then two clicks, each fitted to the map as it stood.
    bench.session.move(at(1, 1));
    const overlay = bench.session.overlay();
    drag(bench.session, [ at(0, 1) ]);
    drag(bench.session, [ at(2, 1) ]);

    // Assert.
    expect([ overlay.hoverLabel, overlay.ghostEvents.map(ghost => [ ghost.x, ghost.y ]), bench.map.event(1)?.note, bench.map.event(2)?.note, heard.map(outcome => outcome.ok) ])
      .toStrictEqual([ 'Level 10 · this map\'s level', [ [ 1, 1 ] ], 'fitted to 0', 'fitted to 1', [ true, true ] ]);
  });

  it('says what stands in the way of a fitted stamp rather than what fitting it came to', () =>
  {
    // Arrange: a fitted stamp, one placed already where the pointer then rests.
    const fit: StampFit = () => ({ stamp: stampOf({ events: [ createMapEvent(1, 0, 0) ] }), words: 'Level 12 · this map\'s setting' });
    const { bench } = stamping(stampOf({ events: [ createMapEvent(1, 0, 0) ] }), { fit });
    drag(bench.session, [ at(1, 1) ]);

    // Act.
    bench.session.move(at(1, 1));
    const blocked = bench.session.overlay();
    bench.session.move(at(2, 1));
    const clear = bench.session.overlay();

    // Assert.
    expect([ blocked.hoverLabel, clear.hoverLabel ])
      .toStrictEqual([ 'Another event is in the way', 'Level 12 · this map\'s setting' ]);
  });

  it('names a blueprint in hand as a blueprint beside its footprint, where a plain stamp is named a stamp', () =>
  {
    // Arrange: the same dirt in hand, as a blueprint and as a plain stamp.
    const blueprint = stamping(dirtWithEvent(), { blueprint: { id: 'k3x9q2mf', name: 'Dirt patch' } }).bench;
    const plain = stamping(dirtWithEvent()).bench;

    // Act.
    const labels = [ blueprint, plain ].map(bench =>
    {
      bench.session.move(at(0, 1));
      return bench.session.overlay().hoverLabel;
    });

    // Assert.
    expect(labels)
      .toStrictEqual([ 'Blueprint', 'Stamp' ]);
  });

  it('says a map may hold no blueprint before the click, and hands over the refusal at it, changing nothing', () =>
  {
    // Arrange: the blueprint in hand over a map that may hold no link.
    const { bench, heard } = stamping(dirtWithEvent(), { blueprint: { id: 'k3x9q2mf', name: 'Dirt patch' }, refusal: 'its events are patterns' });
    const before = cellsOf(bench.map);

    // Act.
    bench.session.move(at(0, 1));
    const overlay = bench.session.overlay();
    drag(bench.session, [ at(0, 1) ]);

    // Assert.
    expect([ overlay.hoverLabel, heard, cellsOf(bench.map), bench.map.eventIds() ])
      .toEqual([ 'Blueprints can\'t go here', [ { ok: false, message: 'Blueprints can\'t be placed here: its events are patterns.' } ], before, [] ]);
  });

  it('says so of a plain stamp carrying copies of a blueprint too, and of no other stamp, over a map that may hold no link', () =>
  {
    // Arrange: the dirt's event a copy of a blueprint's, and the plain dirt beside it, each over a map that may hold no link.
    const linked = { ...dirtWithEvent(), events: [ { ...createMapEvent(7, 1, 0), note: '<blueprint:[k3x9q2mf, 7]>' } ] };
    const sessions = [ stamping(linked, { refusal: 'its events are patterns' }), stamping(dirtWithEvent(), { refusal: 'its events are patterns' }) ];

    // Act.
    const labels = sessions.map(({ bench }) =>
    {
      bench.session.move(at(0, 1));
      return bench.session.overlay().hoverLabel;
    });

    // Assert.
    expect(labels)
      .toEqual([ 'Blueprints can\'t go here', 'Stamp' ]);
  });

  it('says so of a stamp whose tiles hold a placement of a blueprint, over a map that may hold no link, as the click refuses it', () =>
  {
    // Arrange: the dirt holding a placement of a blueprint, alone and beside one holding a placement of a blueprint the
    // window no longer holds, each over a map that may hold no link.
    const placed = { ...dirtWithEvent(), events: [], spots: [ { blueprintId: 'k3x9q2mf', x: 0, y: 0, width: 2, height: 1 } ] };
    const live = stamping(placed, { refusal: 'its events are patterns' });
    const gone = stamping(placed, { refusal: 'its events are patterns' });
    holdBlueprints(gone.bench.hub);

    // Act.
    const labels = [ live, gone ].map(({ bench }) =>
    {
      bench.session.move(at(0, 1));
      return bench.session.overlay().hoverLabel;
    });
    drag(live.bench.session, [ at(0, 1) ]);

    // Assert.
    expect([ labels, live.heard ])
      .toEqual([
        [ 'Blueprints can\'t go here', 'Stamp' ],
        [ { ok: false, message: 'This stamp holds copies of blueprints, which can\'t go here: its events are patterns.' } ],
      ]);
  });

  it('places a plain stamp\'s copy of a blueprint no longer there as a plain event, over a map that may hold no link, saying so', () =>
  {
    // Arrange: the dirt's event a copy of a blueprint the window's blueprints no longer hold, over a map that may hold no
    // link.
    const linked = { ...dirtWithEvent(), events: [ { ...createMapEvent(7, 1, 0), note: 'event 7\n<blueprint:[k3x9q2mf, 7]>' } ] };
    const { bench, heard } = stamping(linked, { refusal: 'its events are patterns' });
    holdBlueprints(bench.hub);

    // Act.
    bench.session.move(at(0, 1));
    const label = bench.session.overlay().hoverLabel;
    drag(bench.session, [ at(0, 1) ]);

    // Assert.
    expect([ label, bench.map.event(1)?.note, heard.map(outcome => outcome.ok && outcome.notes) ])
      .toEqual([
        'Stamp',
        'event 7',
        [ [ 'One of the stamp\'s events was a copy of a blueprint that no longer exists, so it went down as a plain event.' ] ],
      ]);
  });
});

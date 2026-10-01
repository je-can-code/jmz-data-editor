import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TilesetLayering } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { regionBrush, SHADOW_BRUSH, singleTileBrush, tileBrush, type Brush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { INITIAL_PAINT_SETTINGS, PaintState, type PaintSettings } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { ToolSession, type ToolPointer } from '../../../../src/mapEditor/core/tools/ToolSession.ts';
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

    // Assert.
    expect([ bench.state.settings.brush, bench.state.settings.tool ])
      .toEqual([ { kind: 'tiles', width: 2, height: 1, cells: [ TREE, makeAutotileId(GRASS, 5) ] }, 'swap' ]);
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
      .toEqual([ before, [], { hover: null, hoverLabel: null, ghostTiles: [], selectedCells: null }, 'k18' ]);
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
      .toEqual([ { x: 2, y: 1, width: 1, height: 1 }, 'Auto: layer 4', 1, { hover: null, hoverLabel: null, ghostTiles: [], selectedCells: null } ]);
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
      .toEqual({ hover: { x: 1, y: 2, width: 2, height: 1 }, hoverLabel: 'Auto: layer 1', ghostTiles: [], selectedCells: null });
  });
});

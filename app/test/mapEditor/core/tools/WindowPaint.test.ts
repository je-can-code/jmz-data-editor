import { describe, expect, it } from 'vitest';
import type { PaletteBrush } from '../../../../src/mapEditor/core/palette/paintSelection.ts';
import { WindowPaint, WindowPaints } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';

/*
 * Each window paints on its own. The main window's palette, layer strip and maps share one paint; a map torn out into a
 * window of its own carries its own palette and layer strip, which pick for that window alone, so painting there needs
 * nothing from the main window, and picking a tile there never changes what the main window's maps paint with, or the
 * other way round.
 *
 * A torn-out window's paint starts where the main window's stands (the tool in hand, the brush, the layer, and the tab
 * and pick each tileset's palette remembers), so tearing a map out mid-work carries straight on; the palette's mode
 * starts afresh, picking tiles, since passability editing belongs to the window it was opened in. From then on the two
 * go their own ways. A window's paint links its palette to its tools both ways, as the main window's does.
 */
describe('WindowPaint', () =>
{
  /**
   * A brush the palette hands out: one tile of tileset 4.
   * @param {number} tileId The tile.
   * @returns {PaletteBrush} The brush.
   */
  const tileBrush = (tileId: number): PaletteBrush => ({ kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ tileId ] });

  /**
   * The main window's paint, linked, mid-work: the pen in hand, tile 1536 picked on its A tab, layer 3 on the strip,
   * and the passability editor open.
   * @returns {{ main: WindowPaint, unlink: () => void }} The paint, and how to unlink it.
   */
  const midWork = () =>
  {
    const main = new WindowPaint();
    const unlink = main.link();
    main.painting.setTool('pen');
    main.selection.setBrush(tileBrush(1536));
    main.selection.setLayer(2);
    main.memories.set(4, { tab: 'A', pick: { kind: 'shadow' } });
    main.mode.setEditing('passability');
    return { main, unlink };
  };

  it('starts where the window it is built from stands, its palette picking tiles afresh', () =>
  {
    // Arrange.
    const { main, unlink } = midWork();

    // Act.
    const tornOut = new WindowPaint(main);

    // Assert.
    expect([ tornOut.painting.settings, tornOut.selection.getState(), [ ...tornOut.memories ], tornOut.mode.getState().editing ])
      .toStrictEqual([
        { tool: 'pen', brush: { kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ 1536 ] }, strip: 2, overrideLayer: 2 },
        { brush: tileBrush(1536), layer: 2 },
        [ [ 4, { tab: 'A', pick: { kind: 'shadow' } } ] ],
        'tiles',
      ]);
    unlink();
  });

  it('starts from scratch when built from nothing: the events in hand, nothing picked, automatic layering', () =>
  {
    // Arrange: nothing to start from.

    // Act.
    const fresh = new WindowPaint();

    // Assert.
    expect([ fresh.painting.settings, fresh.selection.brush.cells.length, fresh.selection.layer, fresh.memories.size ])
      .toStrictEqual([ { tool: 'events', brush: null, strip: 'auto', overrideLayer: 2 }, 0, 'auto', 0 ]);
  });

  it('goes its own way once built: picks in either window never reach the other', () =>
  {
    // Arrange: both windows linked, the torn-out one built mid-work.
    const { main, unlink } = midWork();
    const tornOut = new WindowPaint(main);
    const unlinkTornOut = tornOut.link();

    // Act: a new tile picked in the torn-out window, and layer 1 picked on the main window's strip.
    tornOut.selection.setBrush(tileBrush(2048));
    main.selection.setLayer(0);
    tornOut.memories.set(4, { tab: 'B', pick: null });

    // Assert: each window's tools paint with its own palette's and strip's picks.
    expect([
      main.painting.settings.brush?.cells,
      tornOut.painting.settings.brush?.cells,
      main.painting.settings.strip,
      tornOut.painting.settings.strip,
      main.memories.get(4)?.tab,
    ])
      .toStrictEqual([ [ 1536 ], [ 2048 ], 0, 2, 'A' ]);
    unlink();
    unlinkTornOut();
  });

  it('leaves its palette and its tools apart until linked', () =>
  {
    // Arrange.
    const paint = new WindowPaint();

    // Act.
    paint.selection.setBrush(tileBrush(2048));

    // Assert.
    expect(paint.painting.settings.brush)
      .toBeNull();
  });
});

describe('WindowPaints', () =>
{
  it('gives the page\'s own window its paint, and every other window one of its own, the same each time it is asked', () =>
  {
    // Arrange: the page's window and two torn-out windows.
    const page = {};
    const first = {};
    const second = {};
    const paints = new WindowPaints(page);

    // Act.
    const found = [ paints.forWindow(page), paints.forWindow(first), paints.forWindow(second), paints.forWindow(first) ];

    // Assert.
    expect([ found[0] === paints.main, found[1] === paints.main, found[1] === found[2], found[1] === found[3] ])
      .toStrictEqual([ true, false, false, true ]);
  });

  it('starts another window where the page stands, its palette already linked to its tools', () =>
  {
    // Arrange: the page with the pen and a tile in hand.
    const page = {};
    const paints = new WindowPaints(page);
    const unlink = paints.main.link();
    paints.main.selection.setBrush({ kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ 1536 ] });
    paints.main.painting.setTool('pen');

    // Act: the torn-out window's palette picks another tile.
    const tornOut = paints.forWindow({});
    const startedWith = tornOut.painting.settings.brush?.cells;
    tornOut.selection.setBrush({ kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ 2048 ] });

    // Assert.
    expect([ startedWith, tornOut.painting.settings.tool, tornOut.painting.settings.brush?.cells, paints.main.painting.settings.brush?.cells ])
      .toStrictEqual([ [ 1536 ], 'pen', [ 2048 ], [ 1536 ] ]);
    unlink();
  });
});

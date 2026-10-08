import { describe, expect, it } from 'vitest';
import { EMPTY_BRUSH, PaintSelection, shadowBrush, type PaletteBrush } from '../../../../src/mapEditor/core/palette/paintSelection.ts';
import { singleTileBrush, type Brush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { linkPaintSelection, takeUpPenForPick, toolBrushFrom } from '../../../../src/mapEditor/core/tools/paintSelectionLink.ts';
import { PaintState } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { ToolSession } from '../../../../src/mapEditor/core/tools/ToolSession.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { fill, kindTile, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';
import { benchWith, cellsOf, layeringWith, stackAt } from './support/paintFixtures.ts';

/*
 * The palette and the layer strip, linked to the painting tools.
 *
 * What the palette picks is what the tools paint with, and the strip's layer is the tools' layer choice, so picking a
 * tile or a layer once serves every map on screen. The palette's empty brush, handed out before anything is chosen,
 * must paint nothing: read as a brush, its missing values would read as B's empty tile and clear layers 3 and 4
 * wherever a rectangle or a fill reached. The link runs both ways, so the eyedropper's pick shows in the palette and the
 * palette's brush picked again afterwards is heard; a brush the palette cannot show (one naming no tileset) stays the
 * tools' alone. The palette's choices win when the link starts, and neither side echoes a change back. Picking in the
 * palette with the events or the stamp in hand takes up the pen, since a tile is picked to be painted, and neither of
 * those reads the brush.
 */
const GRASS = 16;
const DIRT = 18;
const TREE = 10;

/**
 * Builds a palette brush of tiles from tileset 4.
 * @param {number[]} cells The tile ids, row by row.
 * @param {number} width How many across.
 * @returns {PaletteBrush} The brush.
 */
const paletteTiles = (cells: number[], width = cells.length): PaletteBrush =>
{
  return { kind: 'tiles', tilesetId: 4, width, height: cells.length / width, cells };
};

/**
 * Builds a 3x2 map of grass with a tree over its top-left cell.
 * @param {TestGrid} grid The map.
 */
const grove = (grid: TestGrid): void =>
{
  fill(grid, 0, 0, 2, 1, 0, kindTile(GRASS));
  put(grid, 0, 0, 3, TREE);
};

describe('toolBrushFrom', () =>
{
  it('takes the palette\'s brush as it is, naming its tileset, a shadows brush with no values included', () =>
  {
    // Arrange.
    const tiles = paletteTiles([ 2816, 10 ], 2);
    const shadows = shadowBrush(4);

    // Act.
    const brushes = [ toolBrushFrom(tiles), toolBrushFrom(shadows) ];

    // Assert.
    expect(brushes)
      .toEqual([ { kind: 'tiles', tilesetId: 4, width: 2, height: 1, cells: [ 2816, 10 ] }, { kind: 'shadows', tilesetId: 4, width: 1, height: 1, cells: [] } ]);
  });

  it('turns a brush holding no values into no brush at all, the palette\'s empty one and an empty rectangle alike', () =>
  {
    // Arrange: the empty brush, and an empty rectangle of regions on tileset 4.
    const empty: PaletteBrush = { kind: 'regions', tilesetId: 4, width: 0, height: 0, cells: [] };

    // Act.
    const brushes = [ toolBrushFrom(EMPTY_BRUSH), toolBrushFrom(empty) ];

    // Assert.
    expect(brushes)
      .toEqual([ null, null ]);
  });

  it('keeps a rectangle from painting once the palette goes empty, where the empty brush taken as it is clears the tree', () =>
  {
    // Arrange: the palette linked to the tools, the rectangle in hand, a tile picked and then the palette emptied.
    const selection = new PaintSelection();
    const painting = new PaintState({ tool: 'rectangle', brush: null, strip: 'auto', overrideLayer: 2, stamp: null });
    linkPaintSelection(selection, painting);
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));
    selection.setBrush(EMPTY_BRUSH);
    const linked = benchWith(3, 2, grove);
    const raw = benchWith(3, 2, grove);
    const before = cellsOf(linked.map);
    const sessionWith = (bench: typeof linked, brush: Brush | null) => new ToolSession({
      hub: bench.hub,
      map: () => bench.map,
      layering: () => layeringWith(),
      settings: () => ({ ...painting.settings, brush }),
      pickBrush: () => undefined,
      pickTool: () => undefined,
    });
    const point = (x: number, y: number) => ({ cell: { x, y }, quarter: { x, y, quarter: 0 }, shift: false, copy: false, override: false });

    // Act: a rectangle over the whole map, with the tools' brush and with the empty brush passed through as it is.
    const linkedSession = sessionWith(linked, painting.settings.brush);
    linkedSession.press(point(0, 0));
    linkedSession.release(point(2, 1));
    const rawSession = sessionWith(raw, { kind: 'tiles', width: 0, height: 0, cells: [] });
    rawSession.press(point(0, 0));
    rawSession.release(point(2, 1));

    // Assert: the linked tools hold no brush and change nothing; the raw empty brush wipes the tree off layer 4.
    expect([ painting.settings.brush, cellsOf(linked.map), stackAt(raw.map, 0, 0)[3] ])
      .toEqual([ null, before, 0 ]);
  });
});

describe('linkPaintSelection', () =>
{
  it('hands the palette\'s brush and the strip\'s layer to the tools, the layer becoming the override\'s too', () =>
  {
    // Arrange.
    const selection = new PaintSelection();
    const painting = new PaintState();
    linkPaintSelection(selection, painting);

    // Act: a tile picked, layer 2 picked, then the strip stepped once towards layer 4, as Shift and the wheel do.
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));
    selection.setLayer(1);
    selection.stepLayer(1);

    // Assert.
    const { brush, strip, overrideLayer } = painting.settings;
    expect([ brush, strip, overrideLayer ])
      .toEqual([ { kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ kindTile(DIRT) ] }, 2, 2 ]);
  });

  it('hands the eyedropper\'s pick back to the palette, so picking the palette\'s brush again is heard', () =>
  {
    // Arrange: dirt picked in the palette, then the tree picked off a map of tileset 4 by the eyedropper.
    const selection = new PaintSelection();
    const painting = new PaintState();
    linkPaintSelection(selection, painting);
    const dirt = paletteTiles([ kindTile(DIRT) ]);
    selection.setBrush(dirt);
    painting.setBrush({ ...singleTileBrush(TREE), tilesetId: 4 });
    const shownAfterPick = selection.brush;

    // Act: the same dirt picked in the palette again.
    selection.setBrush(dirt);

    // Assert: the palette showed the tree, and the dirt is back in the tools' hands.
    expect([ shownAfterPick, painting.settings.brush?.cells ])
      .toEqual([ { kind: 'tiles', tilesetId: 4, width: 1, height: 1, cells: [ TREE ] }, [ kindTile(DIRT) ] ]);
  });

  it('hands the tools\' own layer choice and an emptied hand back to the strip and the palette', () =>
  {
    // Arrange: dirt picked in the palette.
    const selection = new PaintSelection();
    const painting = new PaintState();
    linkPaintSelection(selection, painting);
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));

    // Act: the tools take up layer 3 and put the brush down themselves.
    painting.setStrip(2);
    painting.setBrush(null);

    // Assert.
    expect([ selection.layer, selection.brush ])
      .toEqual([ 2, EMPTY_BRUSH ]);
  });

  it('keeps a brush naming no tileset out of the palette', () =>
  {
    // Arrange: dirt picked in the palette.
    const selection = new PaintSelection();
    const painting = new PaintState();
    linkPaintSelection(selection, painting);
    const dirt = paletteTiles([ kindTile(DIRT) ]);
    selection.setBrush(dirt);

    // Act: a brush built by hand, naming no tileset, handed to the tools.
    painting.setBrush(singleTileBrush(TREE));

    // Assert: the palette still shows the dirt; the tools hold the tree.
    expect([ selection.brush, painting.settings.brush?.cells ])
      .toEqual([ dirt, [ TREE ] ]);
  });

  it('lets the palette\'s choices win when the link starts, and tells the tools nothing more for an echo', () =>
  {
    // Arrange: a palette that already holds dirt and layer 4, and tools counting what they hear.
    const selection = new PaintSelection();
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));
    selection.setLayer(3);
    const painting = new PaintState();
    let heard = 0;
    painting.subscribe(() =>
    {
      heard += 1;
    });

    // Act.
    linkPaintSelection(selection, painting);
    const atStart = heard;
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));

    // Assert: the strip's layer and the brush, two changes, and nothing for the same brush picked again.
    expect([ painting.settings.strip, painting.settings.brush?.cells, atStart, heard ])
      .toEqual([ 3, [ kindTile(DIRT) ], 2, 2 ]);
  });

  it('links nothing more once unlinked', () =>
  {
    // Arrange.
    const selection = new PaintSelection();
    const painting = new PaintState();
    const unlink = linkPaintSelection(selection, painting);

    // Act.
    unlink();
    selection.setBrush(paletteTiles([ kindTile(DIRT) ]));
    painting.setStrip(1);

    // Assert.
    expect([ painting.settings.brush, selection.layer ])
      .toEqual([ null, 'auto' ]);
  });
});

describe('takeUpPenForPick', () =>
{
  it('takes up the pen for a pick with the events or the stamp in hand, and leaves a painting tool in hand alone', () =>
  {
    // Arrange: one window with the events in hand, one with the stamp, one with the fill.
    const events = new PaintState();
    const stampInHand = new PaintState();
    stampInHand.takeUpStamp(stampOf());
    const fillInHand = new PaintState();
    fillInHand.setTool('fill');

    // Act.
    takeUpPenForPick(events);
    takeUpPenForPick(stampInHand);
    takeUpPenForPick(fillInHand);

    // Assert.
    expect([ events.settings.tool, stampInHand.settings.tool, fillInHand.settings.tool ])
      .toEqual([ 'pen', 'pen', 'fill' ]);
  });
});

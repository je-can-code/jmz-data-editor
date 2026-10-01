import { describe, expect, it } from 'vitest';
import type { Shaping } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { regionBrush, SHADOW_BRUSH, singleTileBrush, tileBrush, type Brush } from '../../../../src/mapEditor/core/tools/brush.ts';
import type { PaintTool } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { choiceFor, previewTool, shapeGhosts, type LayerMode, type PreviewInputs } from '../../../../src/mapEditor/core/tools/toolPreview.ts';
import { blankGrid, fill, kindTile, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';
import { layeringWith } from './support/paintFixtures.ts';

/*
 * The preview before a click.
 *
 * Before a click the map shows where the tool would reach (the brush cursor), what a click would lay down (the ghost
 * preview: each tile on the layer it would land on, in the shape it would take), and a few words on the cursor naming
 * the layer: the layer automatic layering picks for the tile under the pointer, the strip's layer, or the override's
 * layer while its key is held, with Shift adding that tiles go down exactly. The eraser, the eyedropper, the region
 * brush and the shadow pen say what they would do instead. Nothing in hand previews nothing but the cell.
 */
const GRASS = 16;
const CLIFF_CORNER = TileId.A5 + 122;
const TREE = 10;

/**
 * Builds a 3x3 map of grass, joined all round.
 * @returns {TestGrid} The map.
 */
const lawn = (): TestGrid => fill(blankGrid(3, 3), 0, 0, 2, 2, 0, makeAutotileId(GRASS, 0));

/**
 * Builds the inputs for a preview.
 * @param {PaintTool} tool The tool.
 * @param {Brush | null} brush The brush.
 * @param {Partial<LayerMode>} mode The layer mode, automatic unless given.
 * @param {Shaping} shaping Whether autotiles are shaped.
 * @returns {PreviewInputs} The inputs.
 */
const inputs = (tool: PaintTool, brush: Brush | null, mode: Partial<LayerMode> = {}, shaping: Shaping = 'auto'): PreviewInputs =>
{
  return {
    tool,
    brush,
    mode: { strip: 'auto', overrideLayer: 2, overrideHeld: false, ...mode },
    shaping,
    layering: layeringWith([ CLIFF_CORNER ]),
  };
};

/**
 * The quarter the shadow pen would mark, at the top-left of the middle cell.
 */
const QUARTER = { x: 1, y: 1, quarter: 0 };

describe('previewTool', () =>
{
  it('shows the pen\'s footprint, the tiles it would lay on the layer each lands on, and that layer', () =>
  {
    // Arrange.
    const grid = lawn();

    // Act: the tree, and the marked cliff corner, over the middle cell.
    const tree = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', singleTileBrush(TREE)));
    const corner = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', singleTileBrush(CLIFF_CORNER)));

    // Assert: the tree on layer 4, the cliff corner laid over the grass on layer 2.
    expect([ tree, corner.ghosts, corner.label ])
      .toEqual([
        { hover: { x: 1, y: 1, width: 1, height: 1 }, ghosts: [ { x: 1, y: 1, layer: 3, tileId: TREE } ], label: 'Auto: layer 4' },
        [ { x: 1, y: 1, layer: 1, tileId: CLIFF_CORNER } ],
        'Auto: layer 2',
      ]);
  });

  it('shows an autotile in the shape it would take, not the shape the brush holds', () =>
  {
    // Arrange: grass in some odd shape, over a map of grass.
    const grid = lawn();

    // Act.
    const preview = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', singleTileBrush(makeAutotileId(GRASS, 30))));

    // Assert: joined all round, as it would land.
    expect(preview.ghosts)
      .toEqual([ { x: 1, y: 1, layer: 0, tileId: makeAutotileId(GRASS, 0) } ]);
  });

  it('names the strip\'s layer, the held override\'s layer, and Shift\'s exact tiles', () =>
  {
    // Arrange.
    const grid = lawn();
    const brush = singleTileBrush(TREE);

    // Act.
    const labels = [
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', brush, { strip: 1 })).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', brush, { strip: 1, overrideHeld: true })).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', brush, {}, 'exact')).label,
    ];

    // Assert.
    expect(labels)
      .toEqual([ 'Layer 2', 'Held: layer 3', 'Auto: layer 4 (exact)' ]);
  });

  it('says B\'s empty tile clears layers 3 and 4, showing no ghost', () =>
  {
    // Arrange.
    const grid = put(lawn(), 1, 1, 3, TREE);

    // Act.
    const preview = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', singleTileBrush(0)));

    // Assert.
    expect([ preview.ghosts, preview.label ])
      .toEqual([ [], 'Auto: clears layers 3 and 4' ]);
  });

  it('reaches only the cell clicked with the fill and the swap, whatever the brush\'s size', () =>
  {
    // Arrange.
    const grid = lawn();
    const brush = tileBrush([ TREE, TREE, TREE, TREE ], 2, 2);

    // Act.
    const hovers = [ 'fill', 'swap', 'pen' ].map(tool => previewTool(grid, { x: 0, y: 0 }, QUARTER, inputs(tool as PaintTool, brush)).hover);

    // Assert.
    expect(hovers)
      .toEqual([ { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 2, height: 2 } ]);
  });

  it('names the region a region brush paints, with no ghost', () =>
  {
    // Arrange.
    const grid = lawn();

    // Act.
    const preview = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', regionBrush(5)));

    // Assert.
    expect([ preview.ghosts, preview.label ])
      .toEqual([ [], 'Region 5' ]);
  });

  it('says what the eraser clears, by brush and layer', () =>
  {
    // Arrange.
    const grid = lawn();

    // Act.
    const labels = [
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eraser', singleTileBrush(TREE))).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eraser', singleTileBrush(TREE), { strip: 1 })).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eraser', regionBrush(2))).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eraser', SHADOW_BRUSH)).label,
    ];

    // Assert.
    expect(labels)
      .toEqual([ 'Erase layers 3 and 4', 'Erase layer 2', 'Erase regions', 'Erase shadows' ]);
  });

  it('says what the eyedropper picks, even with nothing in hand', () =>
  {
    // Arrange.
    const grid = lawn();

    // Act.
    const labels = [
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eyedropper', null)).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eyedropper', null, { overrideHeld: true })).label,
      previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('eyedropper', regionBrush(1))).label,
    ];

    // Assert.
    expect(labels)
      .toEqual([ 'Pick the top tile', 'Pick from layer 3', 'Pick regions' ]);
  });

  it('shows the shadow pen\'s quarter, and whether a stroke there adds or removes', () =>
  {
    // Arrange: the middle cell shadowed at its top-left.
    const grid = put(lawn(), 1, 1, 4, 0b0001);

    // Act.
    const onShadow = previewTool(grid, { x: 1, y: 1 }, QUARTER, inputs('pen', SHADOW_BRUSH));
    const bare = previewTool(grid, { x: 1, y: 1 }, { x: 1, y: 1, quarter: 3 }, inputs('pen', SHADOW_BRUSH));

    // Assert.
    expect([ onShadow, bare.hover, bare.label ])
      .toEqual([
        { hover: { x: 1, y: 1, width: 0.5, height: 0.5 }, ghosts: [], label: 'Remove shadow' },
        { x: 1.5, y: 1.5, width: 0.5, height: 0.5 },
        'Add shadow',
      ]);
  });

  it('shows just the cell for the select tool, and with nothing picked', () =>
  {
    // Arrange.
    const grid = lawn();
    const cell = { x: 2, y: 0 };

    // Act.
    const previews = [ previewTool(grid, cell, QUARTER, inputs('select', singleTileBrush(TREE))), previewTool(grid, cell, QUARTER, inputs('pen', null)) ];

    // Assert.
    expect(previews)
      .toEqual([ { hover: { x: 2, y: 0, width: 1, height: 1 }, ghosts: [], label: null }, { hover: { x: 2, y: 0, width: 1, height: 1 }, ghosts: [], label: null } ]);
  });
});

describe('choiceFor', () =>
{
  it('paints the override\'s layer while its key is held, and the strip\'s choice otherwise', () =>
  {
    // Arrange.
    const held: LayerMode = { strip: 'auto', overrideLayer: 2, overrideHeld: true };
    const released: LayerMode = { ...held, overrideHeld: false };

    // Act.
    const choices = [ choiceFor(held), choiceFor(released) ];

    // Assert.
    expect(choices)
      .toEqual([ 2, 'auto' ]);
  });
});

describe('shapeGhosts', () =>
{
  it('ghosts the tiles a shape would lay, and nothing for a region brush', () =>
  {
    // Arrange.
    const grid = lawn();
    const cells = [ { x: 0, y: 0 }, { x: 1, y: 0 } ];
    const context = { layering: layeringWith(), choice: 'auto' as const, shaping: 'auto' as const };

    // Act.
    const tiles = shapeGhosts(grid, singleTileBrush(kindTile(18)), cells, { x: 0, y: 0 }, context);
    const regions = shapeGhosts(grid, regionBrush(3), cells, { x: 0, y: 0 }, context);

    // Assert: dirt on layer 1 in both cells.
    expect([ tiles.map(({ x, layer }) => [ x, layer ]), regions ])
      .toEqual([ [ [ 0, 0 ], [ 1, 0 ] ], [] ]);
  });
});

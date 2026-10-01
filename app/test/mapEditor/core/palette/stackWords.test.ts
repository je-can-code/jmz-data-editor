import { describe, expect, it } from 'vitest';
import type { CellStack, StackLayer } from '../../../../src/mapEditor/core/palette/cellStack.ts';
import { cellFlagsSummary, layerChips, passageSummary, shadowSummary } from '../../../../src/mapEditor/core/palette/stackWords.ts';
import { TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * The stack view's sentences about a cell: which ways out are blocked, what else the cell counts as, and where its
 * shadow falls. Each names exactly the bits that are set, in the engine's order, so the author reads the cell as the
 * game will treat it.
 */
const stackWith = (changes: Partial<CellStack>): CellStack =>
{
  return {
    x: 0,
    y: 0,
    layers: [],
    eventTiles: [],
    blocked: 0,
    ladder: false,
    bush: false,
    counter: false,
    damage: false,
    terrainTag: 0,
    shadow: 0,
    region: 0,
    ...changes,
  };
};

describe('passageSummary', () =>
{
  it('says a cell is passable every way, blocked every way, or names the ways blocked', () =>
  {
    // Arrange: none blocked, all four, down and right, and up alone.
    const masks = [ 0, 0x0f, 0x05, 0x08 ];

    // Act.
    const sentences = masks.map(passageSummary);

    // Assert.
    expect(sentences)
      .toStrictEqual([ 'Passable every way.', 'Blocked every way.', 'Blocked down, right.', 'Blocked up.' ]);
  });
});

describe('cellFlagsSummary', () =>
{
  it('names every flag the cell counts as, and its terrain tag', () =>
  {
    // Arrange.
    const stack = stackWith({ ladder: true, damage: true, terrainTag: 3 });

    // Act.
    const sentence = cellFlagsSummary(stack);

    // Assert: the bush and the counter, off, stay out.
    expect(sentence)
      .toBe('Counts as a ladder, a damage floor, terrain tag 3.');
  });

  it('says nothing for a cell that counts as none of them', () =>
  {
    // Arrange.
    const stack = stackWith({ blocked: 0x0f, shadow: 15 });

    // Act.
    const sentence = cellFlagsSummary(stack);

    // Assert.
    expect(sentence)
      .toBe('');
  });

  it('names a bush and a counter', () =>
  {
    // Arrange.
    const stack = stackWith({ bush: true, counter: true });

    // Act.
    const sentence = cellFlagsSummary(stack);

    // Assert.
    expect(sentence)
      .toBe('Counts as a bush, a counter.');
  });
});

describe('layerChips', () =>
{
  /**
   * Builds one layer of a cell.
   * @param {Partial<StackLayer>} changes What differs from an open A5 tile on layer 1 that decides nothing.
   * @returns {StackLayer} The layer.
   */
  const layerWith = (changes: Partial<StackLayer>): StackLayer => ({
    z: 0,
    tileId: TileId.A5 + 2,
    flags: 0,
    passage: 'unread',
    terrainTag: 0,
    decidesTerrain: false,
    ...changes,
  });

  it('lists every flag the tile carries, with what the cell comes from marked strong', () =>
  {
    // Arrange: a starred ladder deciding passage, with the cell's terrain tag, marked to go on top.
    const layer = layerWith({ flags: 0x10 | 0x20 | 0x3000, passage: 'decides', terrainTag: 3, decidesTerrain: true });
    const marks = { tiles: new Set([ TileId.A5 + 2 ]), kinds: new Set<number>() };

    // Act.
    const chips = layerChips(layer, marks);

    // Assert.
    expect(chips)
      .toStrictEqual([
        { label: 'Decides passage', strong: true },
        { label: 'Above characters', strong: false },
        { label: 'Ladder', strong: false },
        { label: 'Terrain tag 3', strong: true },
        { label: 'Goes on top', strong: false },
      ]);
  });

  it('says a terrain tag is covered when one higher up is the cell\'s, and names bushes, counters and damage floors', () =>
  {
    // Arrange: a bush, counter and damage floor with a covered tag, and marks that name another tile.
    const layer = layerWith({ flags: 0x40 | 0x80 | 0x100 | 0x5000, terrainTag: 5 });
    const marks = { tiles: new Set([ TileId.A5 + 3 ]), kinds: new Set<number>() };

    // Act.
    const chips = layerChips(layer, marks);

    // Assert.
    expect(chips.map(chip => chip.label))
      .toStrictEqual([ 'Bush', 'Counter', 'Damage floor', 'Terrain tag 5, covered' ]);
  });

  it('shows nothing for an empty layer, whatever its flags', () =>
  {
    // Arrange: the empty tile carries MZ's star.
    const layer = layerWith({ tileId: 0, flags: 0x10, passage: 'lookedPast' });

    // Act.
    const chips = layerChips(layer, null);

    // Assert.
    expect(chips)
      .toStrictEqual([]);
  });
});

describe('shadowSummary', () =>
{
  it('names the shaded quarters, the whole cell, or no shadow', () =>
  {
    // Arrange: top right and bottom left, all four, and none.
    const shadows = [ 6, 15, 0 ];

    // Act.
    const words = shadows.map(shadowSummary);

    // Assert.
    expect(words)
      .toStrictEqual([ 'Shadow at top right, bottom left', 'Shadow over the whole cell', 'No shadow' ]);
  });
});

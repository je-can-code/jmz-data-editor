import { describe, expect, it } from 'vitest';
import type { CellStack } from '../../../../src/mapEditor/core/palette/cellStack.ts';
import { cellFlagsSummary, passageSummary, shadowSummary } from '../../../../src/mapEditor/core/palette/stackWords.ts';

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

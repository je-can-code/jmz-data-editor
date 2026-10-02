import { describe, expect, it } from 'vitest';
import {
  choiceOf,
  describeCell,
  describeHover,
  describePick,
  FLAG_MODE_WORDS,
  layerLabel,
  paletteHint,
} from '../../../../src/mapEditor/core/palette/paletteWords.ts';
import { FLAG_MODES } from '../../../../src/mapEditor/core/palette/passabilityEdits.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * The palette's own words: the line naming the tile under the pointer or what painting will lay down, the hint
 * beneath it, and the layer strip's labels.
 *
 * The line is how an author checks a pick before painting, so it names exactly the cell picked or hovered (an A tile
 * saying whether it goes on top, and on its badge what a click would do), and the strip's buttons read back to the
 * very layer choice they show. Words are for authors, so no flag or id jargon appears.
 */
const ALL_SHEETS = [ 'A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E' ];
const MARKS = { tiles: new Set([ TileId.A5 + 2 ]), kinds: new Set([ 20 ]) };

describe('describeCell', () =>
{
  it('names a tile on a sheet tab, and a region or the region eraser on the regions tab', () =>
  {
    // Arrange.
    const cells = [ [ 'A', makeAutotileId(20, 0) ], [ 'B', 5 ], [ 'R', 7 ], [ 'R', 0 ] ] as const;

    // Act.
    const names = cells.map(([ tab, id ]) => describeCell(tab, id));

    // Assert.
    expect(names)
      .toStrictEqual([ 'A2 decoration 5', 'B tile 6', 'Region 7', 'Clears the region' ]);
  });
});

describe('describePick', () =>
{
  it('names a single picked cell, from the tab it was picked on', () =>
  {
    // Arrange: the second cell of B's first row.

    // Act.
    const words = describePick({ kind: 'cells', tab: 'B', rect: { column: 1, row: 0, columns: 1, rows: 1 } }, ALL_SHEETS);

    // Assert.
    expect(words)
      .toBe('Painting with B tile 2.');
  });

  it('gives the size of a picked rectangle, in tiles or in regions', () =>
  {
    // Arrange.
    const rect = { column: 0, row: 0, columns: 3, rows: 2 };

    // Act.
    const words = [ describePick({ kind: 'cells', tab: 'C', rect }, ALL_SHEETS), describePick({ kind: 'cells', tab: 'R', rect }, ALL_SHEETS) ];

    // Assert.
    expect(words)
      .toStrictEqual([ 'Painting with 3 by 2 tiles.', 'Painting with 3 by 2 regions.' ]);
  });

  it('says what the shadow pen does, and asks for a pick when there is none or it is gone', () =>
  {
    // Arrange: a lone cell picked on D, which this tileset no longer names.
    const gone = { kind: 'cells' as const, tab: 'D' as const, rect: { column: 0, row: 0, columns: 1, rows: 1 } };

    // Act.
    const words = [ describePick({ kind: 'shadow' }, ALL_SHEETS), describePick(null, ALL_SHEETS), describePick(gone, [ 'A1', '', '', '', '', 'B', '', '', '' ]) ];

    // Assert.
    expect(words)
      .toStrictEqual([ 'Shadow pen: shades the quarter of a tile under the pointer.', 'Pick a tile to paint with.', 'Pick a tile to paint with.' ]);
  });
});

describe('describeHover', () =>
{
  it('says whether an A tile goes on top, or what a click on its badge would do', () =>
  {
    // Arrange: A5's third tile is marked, its fourth is not.
    const marked = { id: TileId.A5 + 2, onBadge: false };
    const unmarked = { id: TileId.A5 + 3, onBadge: false };

    // Act.
    const words = [
      describeHover('A', marked, MARKS),
      describeHover('A', unmarked, MARKS),
      describeHover('A', { ...marked, onBadge: true }, MARKS),
      describeHover('A', { ...unmarked, onBadge: true }, MARKS),
    ];

    // Assert.
    expect(words)
      .toStrictEqual([
        'A5 tile 3 · goes on top',
        'A5 tile 4',
        'A5 tile 3: click to paint it as ground again',
        'A5 tile 4: click to have it go on top',
      ]);
  });

  it('names an upper tile, or any tile while marks do not apply, and nothing more', () =>
  {
    // Arrange.

    // Act.
    const words = [ describeHover('B', { id: 5, onBadge: false }, MARKS), describeHover('A', { id: TileId.A5 + 2, onBadge: false }, null) ];

    // Assert.
    expect(words)
      .toStrictEqual([ 'B tile 6', 'A5 tile 3' ]);
  });
});

describe('paletteHint', () =>
{
  it('explains the passability editor\'s mode, the marks where they show, and nothing otherwise', () =>
  {
    // Arrange.

    // Act.
    const hints = [ paletteHint(true, 'terrain', true), paletteHint(false, 'terrain', true), paletteHint(false, 'passage', false) ];

    // Assert.
    expect(hints)
      .toStrictEqual([
        'Click a tile to count its terrain tag up; right-click or Shift-click to count down.',
        'Right-click a tile, or click its corner, to have it go on top of the ground.',
        '',
      ]);
  });

  it('has a label and a hint for every mode the editor offers', () =>
  {
    // Arrange: nothing to set up.

    // Act.
    const missing = FLAG_MODES.filter(mode => FLAG_MODE_WORDS[mode].label === '' || FLAG_MODE_WORDS[mode].hint === '');

    // Assert.
    expect(missing)
      .toStrictEqual([]);
  });
});

describe('layerLabel and choiceOf', () =>
{
  it('labels the strip as people count layers, and reads each button back to its choice', () =>
  {
    // Arrange.
    const choices = [ 'auto', 0, 1, 2, 3 ] as const;

    // Act.
    const labels = choices.map(layerLabel);
    const readBack = choices.map(choice => choiceOf(String(choice)));

    // Assert.
    expect([ labels, readBack ])
      .toStrictEqual([ [ 'Auto', '1', '2', '3', '4' ], [ 'auto', 0, 1, 2, 3 ] ]);
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_BRUSH, shadowBrush, type PaletteBrush } from '../../../../src/mapEditor/core/palette/paintSelection.ts';
import { brushOnShow, recallPalette, type PaletteMemory } from '../../../../src/mapEditor/core/palette/paletteMemory.ts';

/*
 * A palette remembers, per tileset, the tab it showed and what was picked there, so moving between maps on different
 * tilesets comes back to each one's pick. Each window's palette keeps its own memories, so a torn-out map's palette
 * never moves the main palette's picks. A tileset never shown opens on its first tab with a sheet (the regions when it
 * names none) with nothing picked, and a remembered tab whose sheet the tileset no longer names gives way to that
 * first tab without losing the pick.
 */
describe('recallPalette', () =>
{
  /**
   * The sheets of a tileset naming every sheet but C, D and E.
   */
  const SOME_SHEETS = [ 'A1', 'A2', 'A3', 'A4', 'A5', 'B', '', '', '' ];

  it('recalls what a tileset showed and picked, and nothing another tileset remembered', () =>
  {
    // Arrange: tileset 4 on its B tab with a pick, and tileset 5 on its regions tab.
    const remembered: PaletteMemory = { tab: 'B', pick: { kind: 'shadow' } };
    const memories = new Map<number, PaletteMemory>([ [ 4, remembered ], [ 5, { tab: 'R', pick: null } ] ]);

    // Act.
    const recalled = recallPalette(memories, { id: 4, tilesetNames: SOME_SHEETS });

    // Assert.
    expect(recalled)
      .toBe(remembered);
  });

  it('opens a tileset never shown on its first tab with a sheet, with nothing picked', () =>
  {
    // Arrange: a tileset naming only B, so the A tab has nothing to show.
    const memories = new Map<number, PaletteMemory>();

    // Act.
    const recalled = recallPalette(memories, { id: 9, tilesetNames: [ '', '', '', '', '', 'B', '', '', '' ] });

    // Assert.
    expect(recalled)
      .toStrictEqual({ tab: 'B', pick: null });
  });

  it('keeps the pick but moves off a remembered tab whose sheet the tileset no longer names', () =>
  {
    // Arrange: tileset 4 remembered on its C tab, which it names no more.
    const memories = new Map<number, PaletteMemory>([ [ 4, { tab: 'C', pick: { kind: 'shadow' } } ] ]);

    // Act.
    const recalled = recallPalette(memories, { id: 4, tilesetNames: SOME_SHEETS });

    // Assert.
    expect(recalled)
      .toStrictEqual({ tab: 'A', pick: { kind: 'shadow' } });
  });

  it('opens a tileset naming no sheets on the regions', () =>
  {
    // Arrange.
    const memories = new Map<number, PaletteMemory>();

    // Act.
    const recalled = recallPalette(memories, { id: 2, tilesetNames: [ '', '', '', '', '', '', '', '', '' ] });

    // Assert.
    expect(recalled)
      .toStrictEqual({ tab: 'R', pick: null });
  });
});

/*
 * A palette coming into view, as it does whenever the map it shows opens, a blueprint's tab among them, must never take
 * away a brush the author chose for its tileset since it last showed: the eyedropper's picks off a map are the window's
 * brush but never the palette's remembered pick, so handing the window that pick again would drop them. A brush of another
 * tileset, or none, paints nothing here, and gives way to the pick the palette remembers for this tileset.
 */
describe('brushOnShow', () =>
{
  /**
   * A brush of one tile of a tileset, as the eyedropper picks one off a map.
   * @param {number} tilesetId The tileset.
   * @returns {PaletteBrush} The brush.
   */
  const picked = (tilesetId: number): PaletteBrush => ({ kind: 'tiles', tilesetId, width: 1, height: 1, cells: [ 2 ] });

  it('keeps a brush the window holds of the tileset on show', () =>
  {
    // Arrange: the eyedropper's brush off a map of tileset 4, which the palette shows, remembering its shadow pen.
    const held = picked(4);

    // Act.
    const brush = brushOnShow(held, shadowBrush(4), 4);

    // Assert.
    expect(brush)
      .toBe(held);
  });

  it('hands over the remembered pick when the brush held is of another tileset, or none', () =>
  {
    // Arrange: tileset 4's remembered shadow pen, with a brush of tileset 7 held, then none.
    const remembered = shadowBrush(4);

    // Act.
    const brushes = [ brushOnShow(picked(7), remembered, 4), brushOnShow(EMPTY_BRUSH, remembered, 4) ];

    // Assert.
    expect(brushes)
      .toStrictEqual([ remembered, remembered ]);
  });
});

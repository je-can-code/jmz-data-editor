import { describe, expect, it } from 'vitest';
import { recallPalette, type PaletteMemory } from '../../../../src/mapEditor/core/palette/paletteMemory.ts';

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

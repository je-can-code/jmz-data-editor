import { describe, expect, it } from 'vitest';
import {
  DIRECTION_OPTIONS,
  eventImageMode,
  parseEventImage,
  PATTERN_OPTIONS,
  sheetGrid,
  tileGridCell,
  TILE_SHEET_TABS,
  withCharacter,
  withDirection,
  withNoImage,
  withPattern,
  withTile,
  writeEventImage,
} from '../../../../src/mapEditor/core/eventPage/eventImage.ts';
import type { RmmzEventImage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { normalTileCell } from '../../../../src/mapEditor/render/engine/tileIds.ts';

/*
 * An event page's image is one of three things at once, decided by which of two fields is set: a tile wins
 * whenever tileId is positive, a character sheet shows whenever tileId is 0 and characterName is not empty, and
 * otherwise the page shows nothing. The picker's own operations (choosing a sheet and a cell, a direction, a
 * pattern, a tile, or clearing the image) each change only the fields an author would expect, leaving everything
 * else exactly as it was, so switching between the three never quietly discards a value a later switch back would
 * want. The grid math separately proves it shows a B to E sheet exactly as RMMZ itself lays one out.
 */
describe('event page image', () =>
{
  const image = (overrides: Partial<RmmzEventImage> = {}): RmmzEventImage => ({
    tileId: 0,
    characterName: 'Actor1',
    direction: 2,
    pattern: 1,
    characterIndex: 3,
    ...overrides,
  });

  describe('eventImageMode', () =>
  {
    it('reads none when neither a tile nor a character is set', () =>
    {
      // Arrange.
      const none = image({ characterName: '' });

      // Act.
      const mode = eventImageMode(none);

      // Assert.
      expect(mode)
        .toBe('none');
    });

    it('reads character when a sheet name is set and no tile is', () =>
    {
      // Arrange.
      const character = image({ tileId: 0, characterName: 'Actor1' });

      // Act.
      const mode = eventImageMode(character);

      // Assert.
      expect(mode)
        .toBe('character');
    });

    it('reads tile once tileId turns positive, with a tile winning even over a leftover character name', () =>
    {
      // Arrange: the sentinel at 0, still a character, and one id above it.
      const stillCharacter = image({ tileId: 0, characterName: 'Actor1' });
      const tile = image({ tileId: 1, characterName: 'Actor1' });

      // Act.
      const modes = [ eventImageMode(stillCharacter), eventImageMode(tile) ];

      // Assert.
      expect(modes)
        .toStrictEqual([ 'character', 'tile' ]);
    });
  });

  describe('sheetGrid', () =>
  {
    it('lays out a normal sheet as four characters across by two down', () =>
    {
      // Arrange.
      const name = 'Actor1';

      // Act.
      const grid = sheetGrid(name);

      // Assert.
      expect(grid)
        .toStrictEqual({ columns: 4, rows: 2, big: false });
    });

    it('lays out a big sheet as one cell, whether or not it also carries the object mark', () =>
    {
      // Arrange: $ alone, and ! then $ together.

      // Act.
      const grids = [ sheetGrid('$Vehicle'), sheetGrid('!$Chest') ];

      // Assert.
      expect(grids)
        .toStrictEqual([
          { columns: 1, rows: 1, big: true },
          { columns: 1, rows: 1, big: true },
        ]);
    });

    it('keeps the normal grid for an object sheet that is not also big, the near miss of the combined mark above', () =>
    {
      // Arrange.
      const name = '!Door1';

      // Act.
      const grid = sheetGrid(name);

      // Assert.
      expect(grid)
        .toStrictEqual({ columns: 4, rows: 2, big: false });
    });
  });

  describe('withCharacter', () =>
  {
    it('picks a cell on a normal sheet, clearing any tile and keeping direction and pattern', () =>
    {
      // Arrange: a page currently showing a tile.
      const tiled = image({ tileId: 12, direction: 8, pattern: 2 });

      // Act.
      const picked = withCharacter(tiled, 'Actor2', 5);

      // Assert.
      expect(picked)
        .toStrictEqual({ tileId: 0, characterName: 'Actor2', direction: 8, pattern: 2, characterIndex: 5 });
    });

    it('forces the index to 0 on a big sheet, the near miss of the normal sheet above at the same clicked cell', () =>
    {
      // Arrange.
      const start = image();

      // Act.
      const picked = withCharacter(start, '$Vehicle', 5);

      // Assert.
      expect(picked)
        .toStrictEqual({ tileId: 0, characterName: '$Vehicle', direction: 2, pattern: 1, characterIndex: 0 });
    });
  });

  describe('withDirection and withPattern', () =>
  {
    it('change only the one field each names', () =>
    {
      // Arrange.
      const start = image();

      // Act.
      const faced = withDirection(start, 4);
      const stepped = withPattern(start, 0);

      // Assert.
      expect([ faced, stepped ])
        .toStrictEqual([ { ...start, direction: 4 }, { ...start, pattern: 0 } ]);
    });
  });

  describe('withTile', () =>
  {
    it('picks a tile, clearing the character sheet name', () =>
    {
      // Arrange.
      const start = image();

      // Act.
      const tiled = withTile(start, 40);

      // Assert.
      expect(tiled)
        .toStrictEqual({ ...start, tileId: 40, characterName: '' });
    });

    it('reads back as no image at cell 0, the one cell on sheet B a tile pick can never land on', () =>
    {
      // Arrange: the sentinel, and the real tile one id above it.
      const start = image();

      // Act.
      const modes = [ eventImageMode(withTile(start, 0)), eventImageMode(withTile(start, 1)) ];

      // Assert.
      expect(modes)
        .toStrictEqual([ 'none', 'tile' ]);
    });
  });

  describe('withNoImage', () =>
  {
    it('clears the tile and the sheet name, leaving direction, pattern and the index where they were', () =>
    {
      // Arrange.
      const start = image({ tileId: 9, characterName: 'Actor1' });

      // Act.
      const cleared = withNoImage(start);

      // Assert.
      expect(cleared)
        .toStrictEqual({ ...start, tileId: 0, characterName: '' });
    });
  });

  describe('parseEventImage and writeEventImage', () =>
  {
    it('round-trip every field for each of the three modes, the mode itself added then dropped', () =>
    {
      // Arrange: one fixture per mode.
      const none = image({ tileId: 0, characterName: '' });
      const character = image({ tileId: 0, characterName: 'Actor3', direction: 6, pattern: 2, characterIndex: 7 });
      const tile = image({ tileId: 40, characterName: 'Actor3' });

      // Act.
      const modes = [ none, character, tile ].map(each => parseEventImage(each).mode);
      const written = [ none, character, tile ].map(each => writeEventImage(parseEventImage(each)));

      // Assert.
      expect(modes)
        .toStrictEqual([ 'none', 'character', 'tile' ]);
      expect(written)
        .toStrictEqual([ none, character, tile ]);
    });
  });

  describe('DIRECTION_OPTIONS and PATTERN_OPTIONS', () =>
  {
    it('offer all four directions and all three patterns, matching RMMZ\'s own numbering', () =>
    {
      // Arrange: the engine's own numbering, the numeric keypad's arrows for direction.

      // Act.
      const directions = DIRECTION_OPTIONS.map(option => option.value);
      const patterns = PATTERN_OPTIONS.map(option => option.value);

      // Assert.
      expect(directions)
        .toStrictEqual([ 2, 4, 6, 8 ]);
      expect(patterns)
        .toStrictEqual([ 0, 1, 2 ]);
    });
  });

  describe('tileGridCell', () =>
  {
    it('inverts normalTileCell exactly, for every cell of a sheet', () =>
    {
      // Arrange: sheet B, base 0, and every one of its 256 cells.
      const [ tab ] = TILE_SHEET_TABS;

      // Act.
      const mismatches = Array.from({ length: 16 }, (_unused, row) => row).flatMap(row =>
        Array.from({ length: 16 }, (_unused, column) => column).filter(column =>
        {
          const cell = normalTileCell(tileGridCell(tab, column, row));
          return cell.column !== column || cell.row !== row;
        }));

      // Assert.
      expect(mismatches)
        .toStrictEqual([]);
    });

    it('offsets by the sheet\'s own base, so the same cell on D lands exactly two sheets past the one on B', () =>
    {
      // Arrange: B and D, two sheets apart.
      const [ bTab, , dTab ] = TILE_SHEET_TABS;

      // Act.
      const onB = tileGridCell(bTab, 3, 5);
      const onD = tileGridCell(dTab, 3, 5);

      // Assert.
      expect(onD - onB)
        .toBe(512);
    });
  });
});

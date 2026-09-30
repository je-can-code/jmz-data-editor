import { describe, expect, it } from 'vitest';
import type { RmmzEventImage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  compareDrawOrder,
  eventFrame,
  eventPlacement,
  isBushCell,
  sheetKind,
} from '../../../../src/mapEditor/render/engine/characterFrames.ts';

/*
 * Events draw as the engine's Sprite_Character draws a character standing still: the frame its sheet, index,
 * pattern and facing pick, cut to whole pixels as Sprite#_refresh cuts it; standing on its tile's bottom centre, 6
 * pixels up unless it is an object or a tile; sunk a quarter tile into bushes when it walks among characters; and in
 * the engine's draw order. The parity check proved these against the running game; these tests pin each rule.
 */

/**
 * Builds a page image.
 * @param {Partial<RmmzEventImage>} image What differs from a plain character facing down.
 * @returns {RmmzEventImage} The image.
 */
const image = (overrides: Partial<RmmzEventImage> = {}): RmmzEventImage =>
{
  return { tileId: 0, characterName: 'Actor1', characterIndex: 0, direction: 2, pattern: 1, ...overrides };
};

describe('characterFrames', () =>
{
  describe('sheetKind', () =>
  {
    it('reads ! and $ only from the leading marks of the file name', () =>
    {
      // Arrange.
      const names = [ 'Actor1', '$Boss', '!Door', '!$BigDoor', 'odd!name', 'folder/$Big' ];

      // Act.
      const kinds = names.map(name => sheetKind(name));

      // Assert.
      expect(kinds)
        .toStrictEqual([
          { big: false, object: false },
          { big: true, object: false },
          { big: false, object: true },
          { big: true, object: true },
          { big: false, object: false },
          { big: true, object: false },
        ]);
    });
  });

  describe('eventFrame', () =>
  {
    it('cuts a tile image from the tileset sheet its id names', () =>
    {
      // Arrange: C tile 9, second row, second column.
      const tile = image({ tileId: 256 + 9, characterName: '' });

      // Act.
      const frame = eventFrame(tile, null, 48);

      // Assert.
      expect(frame)
        .toStrictEqual({ source: 'tileset', sheet: 6, sx: 48, sy: 48, width: 48, height: 48 });
    });

    it('draws nothing for a page with no image, or before its sheet has loaded', () =>
    {
      // Arrange.
      const blank = image({ characterName: '' });

      // Act.
      const frames = [ eventFrame(blank, { width: 576, height: 384 }, 48), eventFrame(image(), null, 48) ];

      // Assert.
      expect(frames)
        .toStrictEqual([ null, null ]);
    });

    it('picks a normal sheet\'s block by index, then the pattern across and the facing down', () =>
    {
      // Arrange: a 576x384 sheet (48x48 frames); index 5 is the second block in the second row, facing left.
      const walker = image({ characterIndex: 5, direction: 4, pattern: 2 });

      // Act.
      const frame = eventFrame(walker, { width: 576, height: 384 }, 48);

      // Assert: block 3 across plus pattern 2, block 4 down plus facing row 1.
      expect(frame)
        .toStrictEqual({ source: 'character', sheet: 0, sx: 240, sy: 240, width: 48, height: 48 });
    });

    it('cuts a big sheet as one character, three patterns by four facings', () =>
    {
      // Arrange: a 144x384 $ sheet facing up, pattern 0; the index is ignored.
      const boss = image({ characterName: '$Boss', characterIndex: 3, direction: 8, pattern: 0 });

      // Act.
      const frame = eventFrame(boss, { width: 144, height: 384 }, 48);

      // Assert.
      expect(frame)
        .toStrictEqual({ source: 'character', sheet: 0, sx: 0, sy: 288, width: 48, height: 96 });
    });

    it('floors a sheet that does not divide into whole frames, as the engine does before drawing', () =>
    {
      // Arrange: Chef Adventure's 149x312 glass chest, whose frames are 49.67 pixels across; pattern 2, facing right.
      const chest = image({ characterName: '$chest-glass-2', direction: 6, pattern: 2 });

      // Act.
      const frame = eventFrame(chest, { width: 149, height: 312 }, 48);

      // Assert: the start 99.33 floors to 99 and the width 49.67 to 49.
      expect(frame)
        .toStrictEqual({ source: 'character', sheet: 0, sx: 99, sy: 156, width: 49, height: 78 });
    });

    it('keeps a frame inside its sheet, so an index past the last row draws nothing', () =>
    {
      // Arrange: a 576x384 sheet asked for index 8, whose block starts at the sheet's bottom edge.
      const stray = image({ characterIndex: 8 });

      // Act.
      const frame = eventFrame(stray, { width: 576, height: 384 }, 48);

      // Assert: the start is clamped to the edge and nothing of the sheet is left to cut.
      expect(frame)
        .toStrictEqual({ source: 'character', sheet: 0, sx: 48, sy: 384, width: 48, height: 0 });
    });

    it('shows pattern 3 as pattern 1, as the engine\'s walking cycle does, and pattern 2 as itself', () =>
    {
      // Arrange: the same character facing down at pattern 2 and at pattern 3, on a 576x384 sheet.
      const patterns = [ image({ pattern: 2 }), image({ pattern: 3 }) ];

      // Act.
      const frames = patterns.map(each => eventFrame(each, { width: 576, height: 384 }, 48));

      // Assert: pattern 2 is the third column; pattern 3 is the second, the middle frame, as Game_CharacterBase#pattern.
      expect(frames)
        .toStrictEqual([
          { source: 'character', sheet: 0, sx: 96, sy: 0, width: 48, height: 48 },
          { source: 'character', sheet: 0, sx: 48, sy: 0, width: 48, height: 48 },
        ]);
    });
  });

  describe('eventPlacement', () =>
  {
    it('stands a character 6 pixels up from its tile\'s bottom centre, and an object or a tile on it', () =>
    {
      // Arrange: a character, an object and a tile image at (2, 3), all priority 1.
      const pages = [ image(), image({ characterName: '!Door' }), image({ tileId: 9, characterName: '' }) ];

      // Act.
      const placements = pages.map(page => eventPlacement(2, 3, page, 1, false, 48));

      // Assert.
      expect(placements.map(placement => [ placement.x, placement.y ]))
        .toStrictEqual([ [ 120, 186 ], [ 120, 192 ], [ 120, 192 ] ]);
    });

    it('draws below characters at z 1, with them at z 3, and above them at z 5', () =>
    {
      // Arrange.
      const priorities = [ 0, 1, 2 ];

      // Act.
      const zs = priorities.map(priority => eventPlacement(0, 0, image(), priority, false, 48).z);

      // Assert.
      expect(zs)
        .toStrictEqual([ 1, 3, 5 ]);
    });

    it('sinks only a character of normal priority, not an object, into a bush it stands on', () =>
    {
      // Arrange: on a bush, a character at priority 1, an object at 1, a tile image at 1, a character at 0; and a
      // character at priority 1 off the bush.
      const cases: [ RmmzEventImage, number, boolean ][] = [
        [ image(), 1, true ],
        [ image({ characterName: '!Pot' }), 1, true ],
        [ image({ tileId: 9, characterName: '' }), 1, true ],
        [ image(), 0, true ],
        [ image(), 1, false ],
      ];

      // Act.
      const depths = cases.map(([ page, priority, onBush ]) => eventPlacement(0, 0, page, priority, onBush, 48).bushDepth);

      // Assert.
      expect(depths)
        .toStrictEqual([ 12, 0, 0, 0, 0 ]);
    });
  });

  describe('isBushCell', () =>
  {
    it('finds the bush flag on any of the four tile layers, and never off the map', () =>
    {
      // Arrange: a 2x1 map; tile 5 is a bush, on layer 3 at (0, 0); (1, 0) holds only tile 6.
      const width = 2;
      const height = 1;
      const data = new Array<number>(width * height * 6).fill(0);
      data[(2 * height + 0) * width + 0] = 5;
      data[(0 * height + 0) * width + 1] = 6;
      const flags: number[] = [];
      flags[5] = 0x40;
      flags[6] = 0x20;

      // Act.
      const bushes = [ isBushCell(data, width, height, flags, 0, 0), isBushCell(data, width, height, flags, 1, 0), isBushCell(data, width, height, flags, -1, 0) ];

      // Assert.
      expect(bushes)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('compareDrawOrder', () =>
  {
    it('orders by z, then by the y a sprite stands on, then by id', () =>
    {
      // Arrange.
      const sprites = [
        { id: 4, z: 3, y: 100 },
        { id: 2, z: 3, y: 100 },
        { id: 1, z: 3, y: 200 },
        { id: 9, z: 1, y: 500 },
      ];

      // Act.
      const order = [ ...sprites ].sort(compareDrawOrder).map(sprite => sprite.id);

      // Assert.
      expect(order)
        .toStrictEqual([ 9, 2, 4, 1 ]);
    });
  });
});

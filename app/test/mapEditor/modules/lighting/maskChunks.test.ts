import { describe, expect, it } from 'vitest';
import type { MaskLight } from '../../../../src/mapEditor/modules/lighting/darkScene.ts';
import { chunkSignature, lightsByChunk, MASK_CHUNK_SIZE, maskChunksFor } from '../../../../src/mapEditor/modules/lighting/maskChunks.ts';

/*
 * The mask over a whole map comes in pieces, so no one texture ever has to cover a map the size of the largest, and a
 * light that moves redraws only the pieces around it. The pieces cover the map row by row, the last of each row and
 * column cut short at the map's edge, and a map with no area has none.
 *
 * A light reaches the pieces its picture overlaps: a square twice its reach across, centred on it, held to the map, and
 * touching a piece only along a shared edge reaches nothing there. A picture with no pixels reaches nothing. Each piece
 * keeps its lights in the order they came, the order the game adds them.
 *
 * A piece is redrawn only when what it is drawn from changes: the dark's fill, or any light reaching it moving, changing
 * picture, or burning at another strength.
 */

/**
 * A steady white light.
 * @param {string} id The light's name.
 * @param {number} x Where it is centred, across.
 * @param {number} y Where it is centred, down.
 * @param {number} radius How far it reaches, in pixels.
 * @returns {MaskLight} The light.
 */
const lightAt = (id: string, x: number, y: number, radius: number): MaskLight =>
{
  return { id, x, y, radius, color: '#ffffff', intensity: 0, effect: 'steady', strength: 1 };
};

/**
 * Lists the names of the lights reaching each piece, so a test reads where every light landed at a glance.
 * @param {MaskLight[][]} byChunk The lights by piece.
 * @returns {string[][]} Their names, by piece.
 */
const namesOf = (byChunk: MaskLight[][]): string[][] =>
{
  return byChunk.map(lights => lights.map(light => light.id));
};

describe('maskChunks', () =>
{
  describe('maskChunksFor', () =>
  {
    it('covers a map row by row, cutting the last of each row and column short at its edge', () =>
    {
      // Arrange: a map 1200 by 700 pixels.

      // Act.
      const chunks = maskChunksFor(1200, 700, 512);

      // Assert.
      expect(chunks)
        .toStrictEqual([
          { x: 0, y: 0, width: 512, height: 512 },
          { x: 512, y: 0, width: 512, height: 512 },
          { x: 1024, y: 0, width: 176, height: 512 },
          { x: 0, y: 512, width: 512, height: 188 },
          { x: 512, y: 512, width: 512, height: 188 },
          { x: 1024, y: 512, width: 176, height: 188 },
        ]);
    });

    it('has no pieces for a map with no area', () =>
    {
      // Arrange: a map placeholder, 0 by 0.

      // Act.
      const chunks = maskChunksFor(0, 0, MASK_CHUNK_SIZE);

      // Assert.
      expect(chunks)
        .toStrictEqual([]);
    });
  });

  describe('lightsByChunk', () =>
  {
    it('puts a light whose picture sits inside one piece in that piece alone', () =>
    {
      // Arrange: a 2-tile light in the middle of the second piece of a 2 by 2 map.
      const lights = [ lightAt('middle', 768, 256, 96) ];

      // Act.
      const byChunk = lightsByChunk(lights, 1024, 1024, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [], [ 'middle' ], [], [] ]);
    });

    it('puts a light whose picture spans a corner in all four pieces around it', () =>
    {
      // Arrange: a light on the corner where four pieces meet.
      const lights = [ lightAt('corner', 512, 512, 96) ];

      // Act.
      const byChunk = lightsByChunk(lights, 1024, 1024, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [ 'corner' ], [ 'corner' ], [ 'corner' ], [ 'corner' ] ]);
    });

    it('leaves out a piece the picture only touches along an edge', () =>
    {
      // Arrange: a picture from 128 to 512 across and down, ending on the pieces' edges, and one a pixel wider.
      const lights = [ lightAt('touching', 320, 320, 192), lightAt('over', 320, 320, 192.5) ];

      // Act.
      const byChunk = lightsByChunk(lights, 1024, 1024, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [ 'touching', 'over' ], [ 'over' ], [ 'over' ], [ 'over' ] ]);
    });

    it('holds a picture spilling past the map to the pieces inside it', () =>
    {
      // Arrange: a light in the map's top-left corner, on a map of one piece.
      const lights = [ lightAt('edge', 24, 42, 192) ];

      // Act.
      const byChunk = lightsByChunk(lights, 480, 480, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [ 'edge' ] ]);
    });

    it('puts a picture with no pixels in no piece at all', () =>
    {
      // Arrange: a reach too small for a pixel, beside one that is not.
      const lights = [ lightAt('speck', 100, 100, 0.4), lightAt('lamp', 100, 100, 48) ];

      // Act.
      const byChunk = lightsByChunk(lights, 512, 512, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [ 'lamp' ] ]);
    });

    it('keeps each piece\'s lights in the order they came', () =>
    {
      // Arrange: three lights in one piece, the second elsewhere.
      const lights = [ lightAt('first', 100, 100, 48), lightAt('elsewhere', 900, 100, 48), lightAt('third', 200, 200, 48) ];

      // Act.
      const byChunk = lightsByChunk(lights, 1024, 512, 512);

      // Assert.
      expect(namesOf(byChunk))
        .toStrictEqual([ [ 'first', 'third' ], [ 'elsewhere' ] ]);
    });
  });

  describe('chunkSignature', () =>
  {
    it('reads the same for a piece drawn from the same fill and the same lights', () =>
    {
      // Arrange: the same light, made twice.
      const lights = [ lightAt('torch', 100, 100, 192) ];

      // Act.
      const signatures = [ chunkSignature(0x262626, lights), chunkSignature(0x262626, [ lightAt('torch', 100, 100, 192) ]) ];

      // Assert.
      expect(signatures)
        .toStrictEqual([ '2500134|100,100,192:#ffffff:0,1', '2500134|100,100,192:#ffffff:0,1' ]);
    });

    it('reads differently once the fill, a light\'s place, its picture or its strength changes', () =>
    {
      // Arrange: a lit piece, and the same piece with one thing changed at a time.
      const torch = lightAt('torch', 100, 100, 192);
      const signatures = [
        chunkSignature(0x262626, [ torch ]),
        chunkSignature(0x121212, [ torch ]),
        chunkSignature(0x262626, [ { ...torch, x: 101 } ]),
        chunkSignature(0x262626, [ { ...torch, y: 99 } ]),
        chunkSignature(0x262626, [ { ...torch, color: '#ffbb73' } ]),
        chunkSignature(0x262626, [ { ...torch, intensity: 0.4 } ]),
        chunkSignature(0x262626, [ { ...torch, radius: 96 } ]),
        chunkSignature(0x262626, [ { ...torch, strength: 0.8 } ]),
        chunkSignature(0x262626, []),
      ];

      // Act.
      const distinct = new Set(signatures);

      // Assert.
      expect(distinct.size)
        .toBe(9);
    });
  });
});

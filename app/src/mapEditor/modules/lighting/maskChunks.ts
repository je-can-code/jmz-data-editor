import type { MaskLight } from './darkScene.ts';
import { pictureKey, pictureSize } from './lightFalloff.ts';

/**
 * How wide and tall each piece of the mask is, in world pixels. The game masks one screen at a time, but the editor
 * shows a whole map, and one texture over a 75x75 map would be 3600 pixels square, about 52 MB of graphics memory, and
 * past what many cards can hold at all for the largest maps. So the mask comes in pieces: one that no light reaches is
 * a plain fill of the dark and holds no texture at all, and one a light reaches holds a texture of a megabyte. A light
 * that moves redraws only the pieces it left and entered, a handful of small passes rather than one over the map.
 */
const MASK_CHUNK_SIZE = 512;

/**
 * One piece of the mask, in world pixels: its top-left corner, and its size, cut short at the map's right and bottom
 * edges.
 */
type MaskChunk = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Cuts a map's area into the pieces of its mask, row by row from the top left, the last of each row and column cut
 * short at the map's edge.
 * @param {number} width The map's width, in world pixels.
 * @param {number} height The map's height, in world pixels.
 * @param {number} size How wide and tall a whole piece is.
 * @returns {MaskChunk[]} The pieces.
 */
const maskChunksFor = (width: number, height: number, size: number): MaskChunk[] =>
{
  const chunks: MaskChunk[] = [];
  for (let y = 0; y < height; y += size)
  {
    for (let x = 0; x < width; x += size)
    {
      chunks.push({ x, y, width: Math.min(size, width - x), height: Math.min(size, height - y) });
    }
  }

  return chunks;
};

/**
 * Sorts lights into the pieces their pictures reach. A light's picture is a square centred on the light, as wide as
 * LightTextureCache draws it, and it reaches a piece when the two overlap by more than a shared edge; a picture with no
 * pixels at all reaches none. Each piece keeps its lights in the order they came, which is the order the game adds them.
 * @param {readonly MaskLight[]} lights The lights.
 * @param {number} width The map's width, in world pixels.
 * @param {number} height The map's height, in world pixels.
 * @param {number} size How wide and tall a whole piece is.
 * @returns {MaskLight[][]} The lights reaching each piece, in {@link maskChunksFor}'s order.
 */
const lightsByChunk = (lights: readonly MaskLight[], width: number, height: number, size: number): MaskLight[][] =>
{
  const columns = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const byChunk: MaskLight[][] = Array.from({ length: columns * rows }, () => []);
  lights.forEach(light =>
  {
    const side = pictureSize(light.radius);
    if (side === 0)
    {
      return;
    }

    // the picture's square, held to the map: a pool spilling past the edge reaches only the pieces inside it.
    const half = side / 2;
    const firstColumn = Math.max(0, Math.floor((light.x - half) / size));
    const lastColumn = Math.min(columns - 1, Math.ceil((light.x + half) / size) - 1);
    const firstRow = Math.max(0, Math.floor((light.y - half) / size));
    const lastRow = Math.min(rows - 1, Math.ceil((light.y + half) / size) - 1);
    for (let row = firstRow; row <= lastRow; row++)
    {
      for (let column = firstColumn; column <= lastColumn; column++)
      {
        byChunk[row * columns + column].push(light);
      }
    }
  });

  return byChunk;
};

/**
 * Writes down everything a piece of the mask is drawn from, so a piece is drawn again only when this changes: the dark's
 * fill, and each light reaching it, where it sits, the picture it draws and how brightly it burns. Its colour and
 * intensity are in its picture's name, and its effect only ever shows as its strength.
 * @param {number} tint The dark's fill, as {@code 0xRRGGBB}.
 * @param {readonly MaskLight[]} lights The lights reaching the piece.
 * @returns {string} What the piece is drawn from.
 */
const chunkSignature = (tint: number, lights: readonly MaskLight[]): string =>
{
  const drawn = lights.map(light => `${light.x},${light.y},${pictureKey(light.radius, light.color, light.intensity)},${light.strength}`);
  return `${tint}|${drawn.join(';')}`;
};

export { chunkSignature, lightsByChunk, MASK_CHUNK_SIZE, maskChunksFor };
export type { MaskChunk };

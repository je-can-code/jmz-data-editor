/// <reference types="bun-types" />
/**
 * Pixel comparison for the parity check: decodes PNGs through ImageMagick, as ca/tools/mapgen/snapshot.js does
 * (these sheets use interlacing and palette modes a small decoder gets wrong silently), compares two pictures inside a
 * region, and names the map cells that differ.
 */

/**
 * A decoded picture: RGBA, row by row.
 */
type Picture = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

/**
 * A rectangle in a picture's pixels.
 */
type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * One map cell whose pixels differ beyond the tolerance.
 */
type CellDifference = {
  x: number;
  y: number;
  pixels: number;
  maxDelta: number;
};

/**
 * What a comparison came to.
 */
type Comparison = {
  comparedPixels: number;
  differingPixels: number;
  maxDelta: number;
  cells: CellDifference[];
};

/**
 * Decodes a PNG into RGBA pixels.
 * @param {string} file The PNG.
 * @returns {Promise<Picture>} The picture.
 */
const decodePng = async (file: string): Promise<Picture> =>
{
  const header = new DataView(await Bun.file(file).slice(0, 32).arrayBuffer());
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  const magick = Bun.spawn([ 'magick', file, '-depth', '8', 'rgba:-' ], { stdout: 'pipe', stderr: 'ignore' });
  const pixels = new Uint8Array(await new Response(magick.stdout).arrayBuffer());
  if (pixels.length !== width * height * 4)
  {
    throw new Error(`${file} decoded to ${pixels.length} bytes, not ${width}x${height} RGBA`);
  }

  return { width, height, pixels };
};

/**
 * Writes RGBA pixels as a PNG.
 * @param {Picture} picture The picture.
 * @param {string} file Where to write it.
 */
const writePng = async (picture: Picture, file: string): Promise<void> =>
{
  const magick = Bun.spawn([ 'magick', '-size', `${picture.width}x${picture.height}`, '-depth', '8', 'rgba:-', file ], { stdin: 'pipe' });
  magick.stdin.write(picture.pixels);
  await magick.stdin.end();
  await magick.exited;
};

/**
 * Compares two pictures inside a region, pixel by pixel, and groups the pixels that differ by more than the tolerance
 * in any channel into the map cells they fall in.
 * @param {Picture} left One picture.
 * @param {Picture} right The other, the same size.
 * @param {PixelRect} region Where to compare, in both pictures' pixels.
 * @param {{ x: number, y: number }} cellOrigin The picture pixel where map cell (0, 0) begins.
 * @param {number} tileSize The tile size.
 * @param {number} tolerance The largest channel difference still counted as equal.
 * @returns {Comparison} What differs.
 */
const comparePictures = (
  left: Picture,
  right: Picture,
  region: PixelRect,
  cellOrigin: { x: number; y: number },
  tileSize: number,
  tolerance: number): Comparison =>
{
  if (left.width !== right.width || left.height !== right.height)
  {
    throw new Error(`the pictures differ in size: ${left.width}x${left.height} and ${right.width}x${right.height}`);
  }

  const cells = new Map<string, CellDifference>();
  let differingPixels = 0;
  let maxDelta = 0;
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const x1 = Math.min(left.width, region.x + region.width);
  const y1 = Math.min(left.height, region.y + region.height);
  for (let y = y0; y < y1; y++)
  {
    for (let x = x0; x < x1; x++)
    {
      const index = (y * left.width + x) * 4;
      let delta = 0;
      for (let channel = 0; channel < 4; channel++)
      {
        delta = Math.max(delta, Math.abs(left.pixels[index + channel] - right.pixels[index + channel]));
      }

      maxDelta = Math.max(maxDelta, delta);
      if (delta <= tolerance)
      {
        continue;
      }

      differingPixels += 1;
      const cx = Math.floor((x - cellOrigin.x) / tileSize);
      const cy = Math.floor((y - cellOrigin.y) / tileSize);
      const key = `${cx},${cy}`;
      const cell = cells.get(key) ?? { x: cx, y: cy, pixels: 0, maxDelta: 0 };
      cell.pixels += 1;
      cell.maxDelta = Math.max(cell.maxDelta, delta);
      cells.set(key, cell);
    }
  }

  return {
    comparedPixels: Math.max(0, x1 - x0) * Math.max(0, y1 - y0),
    differingPixels,
    maxDelta,
    cells: [ ...cells.values() ].sort((a, b) => a.y - b.y || a.x - b.x),
  };
};

/**
 * Paints a picture of the differences: the left picture, dimmed, with every differing pixel in red.
 * @param {Picture} left One picture.
 * @param {Picture} right The other.
 * @param {number} tolerance The tolerance.
 * @returns {Picture} The difference picture.
 */
const differencePicture = (left: Picture, right: Picture, tolerance: number): Picture =>
{
  const pixels = new Uint8Array(left.pixels.length);
  for (let index = 0; index < pixels.length; index += 4)
  {
    let delta = 0;
    for (let channel = 0; channel < 4; channel++)
    {
      delta = Math.max(delta, Math.abs(left.pixels[index + channel] - right.pixels[index + channel]));
    }

    const differs = delta > tolerance;
    pixels[index] = differs ? 255 : left.pixels[index] / 3;
    pixels[index + 1] = differs ? 0 : left.pixels[index + 1] / 3;
    pixels[index + 2] = differs ? 0 : left.pixels[index + 2] / 3;
    pixels[index + 3] = 255;
  }

  return { width: left.width, height: left.height, pixels };
};

export { comparePictures, decodePng, differencePicture, writePng };
export type { CellDifference, Comparison, Picture, PixelRect };

import type { RmmzEventImage } from '../core/model/rmmzTypes.ts';
import { TILE_SIZE } from '../core/renderer/camera.ts';
import type { TextureImage } from '../core/renderer/MapRenderer.ts';
import type { Stamp } from '../core/stamps/stamp.ts';
import { TILE_LAYER_COUNT } from '../core/tiles/tileGrid.ts';
import { eventFrame } from './engine/characterFrames.ts';
import { drawTile } from './tileCanvas.ts';

/**
 * The most room a stamp's picture takes in the Stamps panel, in CSS pixels; a stamp keeps its shape inside it. Two fit
 * side by side in the panel at its narrowest.
 */
const THUMBNAIL_BOX = { width: 132, height: 88 } as const;

/**
 * The largest a cell of a stamp's picture grows, in CSS pixels, so a stamp of one event shows it at the game's own
 * scale rather than blown up to fill the box.
 */
const MAX_THUMBNAIL_CELL = 48;

/**
 * How a stamp's picture is laid out: the size of one of its cells, and of the whole picture, in CSS pixels.
 */
type ThumbnailLayout = {
  readonly cell: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The part of a 2D canvas context a stamp's picture draws with, so tests can stand in for a canvas.
 */
type ThumbnailContext = Pick<CanvasRenderingContext2D, 'drawImage' | 'beginPath' | 'arc' | 'fill' | 'stroke'>
  & { fillStyle: CanvasRenderingContext2D['fillStyle']; strokeStyle: CanvasRenderingContext2D['strokeStyle']; lineWidth: number };

/**
 * What a stamp's picture is drawn from: its tileset's nine sheets, null while they load or for a tileset the project
 * lacks, and the character sheets its events show, by name, null for one still loading or missing.
 */
type ThumbnailArt = {
  readonly sheets: readonly (TextureImage | null)[] | null;
  readonly characters: ReadonlyMap<string, TextureImage | null>;
};

/**
 * Lays a stamp's picture out in a box: every cell the same size, as large as fits, but never larger than a tile at the
 * game's own scale.
 * @param {{ width: number, height: number }} stamp The stamp's size in cells.
 * @param {{ width: number, height: number }} box The room there is, in CSS pixels.
 * @returns {ThumbnailLayout} The layout.
 */
const thumbnailLayout = (
  stamp: { readonly width: number; readonly height: number },
  box: { readonly width: number; readonly height: number } = THUMBNAIL_BOX,
): ThumbnailLayout =>
{
  const cell = Math.min(box.width / stamp.width, box.height / stamp.height, MAX_THUMBNAIL_CELL);
  return { cell, width: stamp.width * cell, height: stamp.height * cell };
};

/**
 * Lists the character sheets a stamp's events show on their first pages, each once, for the picture to load.
 * @param {Stamp} stamp The stamp.
 * @returns {string[]} The sheets' names.
 */
const thumbnailCharacters = (stamp: Stamp): string[] =>
{
  const names = stamp.events.flatMap(event =>
  {
    const [ page ] = event.pages;
    return page === undefined || page.image.tileId > 0 || page.image.characterName === '' ? [] : [ page.image.characterName ];
  });

  return [ ...new Set(names) ];
};

/**
 * Draws a dot on an event's cell: an event drawing no picture, or one whose picture has not loaded.
 * @param {ThumbnailContext} context Where to draw.
 * @param {number} x The cell's left edge.
 * @param {number} y The cell's top edge.
 * @param {number} cell The cell's size.
 */
const drawEventDot = (context: ThumbnailContext, x: number, y: number, cell: number): void =>
{
  context.beginPath();
  context.arc(x + cell / 2, y + cell / 2, Math.max(1.5, cell * 0.3), 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 196, 64, 0.9)';
  context.fill();
  context.lineWidth = Math.max(1, cell / 16);
  context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  context.stroke();
};

/**
 * Draws one event as its first page shows it, at the game's own proportions: a tile image on its cell, or a character
 * standing on its cell's bottom edge, as the engine stands one; a dot for anything drawing no picture yet.
 * @param {ThumbnailContext} context Where to draw.
 * @param {RmmzEventImage | null} image The first page's picture, or null for an event with no pages.
 * @param {ThumbnailArt} art The sheets.
 * @param {number} x The cell's left edge.
 * @param {number} y The cell's top edge.
 * @param {number} cell The cell's size.
 */
const drawEvent = (context: ThumbnailContext, image: RmmzEventImage | null, art: ThumbnailArt, x: number, y: number, cell: number): void =>
{
  if (image !== null && image.tileId > 0 && art.sheets !== null)
  {
    drawTile(context, art.sheets, image.tileId, x, y, cell);
    return;
  }

  const sheet = image === null ? null : art.characters.get(image.characterName) ?? null;
  const frame = image === null || sheet === null ? null : eventFrame(image, { width: sheet.width, height: sheet.height }, TILE_SIZE);
  if (frame === null || frame.source !== 'character')
  {
    drawEventDot(context, x, y, cell);
    return;
  }

  // the character's feet on the cell's bottom edge, centred across it.
  const scale = cell / TILE_SIZE;
  const width = frame.width * scale;
  const height = frame.height * scale;
  context.drawImage(sheet as CanvasImageSource, frame.sx, frame.sy, frame.width, frame.height, x + (cell - width) / 2, y + cell - height, width, height);
};

/**
 * Draws a stamp's picture: its tiles on the four tile layers, bottom to top, each cut as the engine cuts it in the shape
 * it was copied in, then its events on top, in id order. The shadows and the regions it carries draw nothing. Tiles
 * draw only once the tileset's sheets have loaded.
 * @param {ThumbnailContext} context Where to draw, cleared already.
 * @param {Stamp} stamp The stamp.
 * @param {ThumbnailArt} art The sheets.
 * @param {number} cell How big one cell is drawn, in canvas pixels.
 */
const drawStampThumbnail = (context: ThumbnailContext, stamp: Stamp, art: ThumbnailArt, cell: number): void =>
{
  const { tiles, width, height } = stamp;
  const { sheets } = art;
  if (tiles !== null && sheets !== null)
  {
    tiles.layers.forEach((z, layerIndex) =>
    {
      if (z >= TILE_LAYER_COUNT)
      {
        return;
      }

      for (let dy = 0; dy < height; dy++)
      {
        for (let dx = 0; dx < width; dx++)
        {
          const tileId = tiles.values[(layerIndex * height + dy) * width + dx];
          if (tileId !== 0)
          {
            drawTile(context, sheets, tileId, dx * cell, dy * cell, cell);
          }
        }
      }
    });
  }

  stamp.events.forEach(event =>
  {
    const [ page ] = event.pages;
    drawEvent(context, page === undefined ? null : page.image, art, event.x * cell, event.y * cell, cell);
  });
};

export { drawStampThumbnail, MAX_THUMBNAIL_CELL, THUMBNAIL_BOX, thumbnailCharacters, thumbnailLayout };
export type { ThumbnailArt, ThumbnailContext, ThumbnailLayout };

import type { TilePatch } from '../core/palette/autotilePatch.ts';
import { TILE_SIZE } from '../core/renderer/camera.ts';
import type { TextureImage } from '../core/renderer/MapRenderer.ts';
import { writeTile, type TileSource } from './engine/spotWriter.ts';
import { regionHue } from './scene/overlayAtlases.ts';

/**
 * The part of a 2D canvas context tile drawing uses, so tests can stand in for a canvas.
 */
type TileContext = Pick<CanvasRenderingContext2D, 'drawImage'>;

/**
 * What a lone tile is cut from: no neighbours and no flags, so it is drawn as it is on its sheet, with no star lifting
 * it and no table splitting its legs, the way the palette shows tiles.
 */
const LONE_TILE: TileSource = { width: 1, height: 1, data: [], flags: [], horizontalWrap: false, verticalWrap: false };

/**
 * Draws one tile into a 2D canvas the way the engine cuts it: an autotile's four quarters from its kind's block in the
 * shape its id names, any other tile whole from its sheet, at the size asked for. A sheet the tileset lacks draws
 * nothing.
 * @param {TileContext} context Where to draw.
 * @param {readonly (TextureImage | null)[]} sheets The tileset's nine sheets, null where it has none.
 * @param {number} tileId The tile id.
 * @param {number} dx The left edge to draw at.
 * @param {number} dy The top edge to draw at.
 * @param {number} size How big to draw it, in canvas pixels.
 */
const drawTile = (
  context: TileContext,
  sheets: readonly (TextureImage | null)[],
  tileId: number,
  dx: number,
  dy: number,
  size: number): void =>
{
  const scale = size / TILE_SIZE;
  writeTile(LONE_TILE, 0, tileId, 0, 0, (_upper, _layer, sheet, sx, sy, qx, qy, width, height) =>
  {
    const image = sheets[sheet] ?? null;
    if (image === null)
    {
      return;
    }

    context.drawImage(image as CanvasImageSource, sx, sy, width, height, dx + qx * scale, dy + qy * scale, width * scale, height * scale);
  }, { tileSize: TILE_SIZE, animationFrame: 0, shadows: false });
};

/**
 * Draws a painted patch of tiles, one cell after another; empty cells draw nothing.
 * @param {TileContext} context Where to draw.
 * @param {readonly (TextureImage | null)[]} sheets The tileset's nine sheets.
 * @param {TilePatch} patch The patch.
 * @param {number} size How big to draw each cell, in canvas pixels.
 */
const drawPatch = (context: TileContext, sheets: readonly (TextureImage | null)[], patch: TilePatch, size: number): void =>
{
  patch.tiles.forEach((tileId, index) =>
  {
    if (tileId !== 0)
    {
      drawTile(context, sheets, tileId, (index % patch.width) * size, Math.floor(index / patch.width) * size, size);
    }
  });
};

/**
 * The part of a 2D canvas context a region cell uses.
 */
type RegionContext = Pick<CanvasRenderingContext2D, 'fillRect' | 'strokeRect' | 'fillText' | 'strokeText' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke'>
  & { fillStyle: CanvasRenderingContext2D['fillStyle']; strokeStyle: CanvasRenderingContext2D['strokeStyle']; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

/**
 * Draws one region as the palette shows it, in the colour the map's region overlay gives it, with its number; region 0,
 * which clears a cell's region, is a dark cell crossed out.
 * @param {RegionContext} context Where to draw.
 * @param {number} region The region id.
 * @param {number} dx The left edge.
 * @param {number} dy The top edge.
 * @param {number} size The cell's size.
 */
const drawRegion = (context: RegionContext, region: number, dx: number, dy: number, size: number): void =>
{
  if (region === 0)
  {
    const inset = Math.round(size * 0.3);
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(dx, dy, size, size);
    context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    context.lineWidth = Math.max(1, size / 16);
    context.beginPath();
    context.moveTo(dx + inset, dy + inset);
    context.lineTo(dx + size - inset, dy + size - inset);
    context.moveTo(dx + size - inset, dy + inset);
    context.lineTo(dx + inset, dy + size - inset);
    context.stroke();
    return;
  }

  // the same hue the map's region overlay uses, a little stronger, so a region reads the same in both places.
  const hue = regionHue(region);
  context.fillStyle = `hsla(${hue}, 85%, 45%, 0.85)`;
  context.fillRect(dx, dy, size, size);
  context.strokeStyle = `hsla(${hue}, 85%, 20%, 1)`;
  context.lineWidth = 1;
  context.strokeRect(dx + 0.5, dy + 0.5, size - 1, size - 1);
  context.font = `bold ${Math.max(8, Math.round(size * 0.36))}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  context.lineWidth = 3;
  context.strokeText(String(region), dx + size / 2, dy + size / 2);
  context.fillStyle = '#ffffff';
  context.fillText(String(region), dx + size / 2, dy + size / 2);
};

export { drawPatch, drawRegion, drawTile };
export type { RegionContext, TileContext };

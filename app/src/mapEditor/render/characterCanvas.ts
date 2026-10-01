import { TILE_SIZE } from '../core/renderer/camera.ts';
import type { TextureImage } from '../core/renderer/MapRenderer.ts';
import type { RmmzEventImage } from '../core/model/rmmzTypes.ts';
import { eventFrame } from './engine/characterFrames.ts';

/**
 * The part of a 2D canvas context a character frame draws with, so tests can stand in for a canvas.
 */
type CharacterContext = Pick<CanvasRenderingContext2D, 'drawImage'>;

/**
 * Draws one still frame of a character sheet into a 2D canvas, the way the engine crops {@code Sprite_Character}:
 * the exact cell {@link eventFrame} names, scaled up from the engine's own tile size to whatever size is asked
 * for. Draws nothing while the sheet has not loaded yet, or when the image shows a tile or nothing at all, since
 * this is the graphic picker's character preview, not its tile one.
 * @param {CharacterContext} context Where to draw.
 * @param {TextureImage | null} sheet The loaded character sheet, or null while it is still loading.
 * @param {RmmzEventImage} image The page's image, or a throwaway one built just to preview a sheet's cell.
 * @param {number} dx The left edge to draw at.
 * @param {number} dy The top edge to draw at.
 * @param {number} size How big to draw the frame, in canvas pixels.
 */
const drawCharacterFrame = (
  context: CharacterContext,
  sheet: TextureImage | null,
  image: RmmzEventImage,
  dx: number,
  dy: number,
  size: number,
): void =>
{
  if (sheet === null)
  {
    return;
  }

  const frame = eventFrame(image, { width: sheet.width, height: sheet.height }, TILE_SIZE);
  if (frame === null || frame.source !== 'character')
  {
    return;
  }

  const scale = size / TILE_SIZE;
  context.drawImage(sheet as CanvasImageSource, frame.sx, frame.sy, frame.width, frame.height, dx, dy, frame.width * scale, frame.height * scale);
};

export { drawCharacterFrame };
export type { CharacterContext };

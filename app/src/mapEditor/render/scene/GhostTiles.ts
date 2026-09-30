import type { TextureSource } from 'pixi.js';
import type { GhostTile } from '../../core/renderer/MapRenderer.ts';
import { writeTile, type TileSource } from '../engine/spotWriter.ts';
import { CompositeTilemap } from '../vendor/pixi-tilemap/index.ts';

/**
 * How opaque a ghost draws: enough to judge the tile, clearly not yet placed.
 */
const GHOST_ALPHA = 0.6;

/**
 * Draws the tiles a click would place, see-through, over the map. Each is cut exactly as the engine would cut it on
 * its layer, so a ghost of an autotile shows the shape it would land with.
 */
class GhostTiles
{
  #tilemap: CompositeTilemap;

  #sheetSlot: number[];

  #tileSize: number;

  /**
   * @param {readonly (TextureSource | null)[]} sheets The tileset's nine sheets, null where it has none.
   * @param {number} tileSize The tile size.
   */
  constructor(sheets: readonly (TextureSource | null)[], tileSize: number)
  {
    const textures: TextureSource[] = [];
    this.#sheetSlot = sheets.map(sheet =>
    {
      if (sheet === null)
      {
        return -1;
      }

      textures.push(sheet);
      return textures.length - 1;
    });
    this.#tilemap = new CompositeTilemap(textures);
    this.#tileSize = tileSize;
  }

  /**
   * The tilemap the ghosts draw in.
   * @returns {CompositeTilemap} The tilemap.
   */
  get view(): CompositeTilemap
  {
    return this.#tilemap;
  }

  /**
   * Replaces the ghosts.
   * @param {readonly GhostTile[]} ghosts The tiles a click would place.
   * @param {TileSource} source The map, for the tileset's flags.
   */
  setGhosts(ghosts: readonly GhostTile[], source: TileSource): void
  {
    const tilemap = this.#tilemap;
    tilemap.clear();
    const size = this.#tileSize;
    const options = { u: 0, v: 0, tileWidth: 0, tileHeight: 0, alpha: GHOST_ALPHA };
    const spot = { tileSize: size, animationFrame: 0, shadows: false };
    ghosts.forEach(ghost =>
    {
      // a ghost shows the tile's first animation frame, still: it previews the picture, not the water's motion.
      writeTile(source, ghost.layer, ghost.tileId, ghost.x * size, ghost.y * size, (_upper, _layer, sheet, sx, sy, dx, dy, width, height) =>
      {
        const slot = this.#sheetSlot[sheet] ?? -1;
        if (slot < 0)
        {
          return;
        }

        options.u = sx;
        options.v = sy;
        options.tileWidth = width;
        options.tileHeight = height;
        tilemap.tile(slot, dx, dy, options);
      }, spot);
    });
  }

  /**
   * Lets go of the tilemap.
   */
  destroy(): void
  {
    this.#tilemap.destroy({ children: true });
  }
}

export { GHOST_ALPHA, GhostTiles };

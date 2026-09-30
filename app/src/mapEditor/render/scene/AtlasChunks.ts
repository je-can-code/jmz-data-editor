import { Container, type TextureSource } from 'pixi.js';
import { chunkCells, isChunkInRange, type ChunkGrid, type ChunkRange } from '../chunkMath.ts';
import { CompositeTilemap } from '../vendor/pixi-tilemap/index.ts';

/**
 * Picks the atlas cell a map cell shows: -1 draws nothing there.
 */
type AtlasPicker = (x: number, y: number) => number;

/**
 * A per-cell overlay, such as the regions or the passability marks, drawn as one quad per marked cell from a small
 * atlas of pictures, in the same chunks as the tiles so an edit rebuilds only the chunks it touched. It builds
 * nothing while hidden, and catches up on the chunks that went dirty meanwhile when shown again.
 */
class AtlasChunks
{
  /**
   * The overlay's tilemaps, one per chunk.
   */
  readonly layer = new Container();

  #grid: ChunkGrid;

  #tileSize: number;

  #columns: number;

  #pick: AtlasPicker;

  #chunks: CompositeTilemap[] = [];

  #dirty = new Set<number>();

  #options = { u: 0, v: 0, tileWidth: 0, tileHeight: 0 };

  /**
   * @param {ChunkGrid} grid How the map is cut.
   * @param {number} tileSize The tile size in world pixels.
   * @param {TextureSource} atlas The pictures, in rows of tile-sized cells.
   * @param {AtlasPicker} pick Picks each map cell's picture.
   */
  constructor(grid: ChunkGrid, tileSize: number, atlas: TextureSource, pick: AtlasPicker)
  {
    this.#grid = grid;
    this.#tileSize = tileSize;
    this.#columns = Math.max(1, Math.floor(atlas.width / tileSize));
    this.#pick = pick;
    const count = grid.columns * grid.rows;
    for (let index = 0; index < count; index++)
    {
      const { x0, y0 } = chunkCells(grid, index);
      const tilemap = new CompositeTilemap([ atlas ]);
      tilemap.position.set(x0 * tileSize, y0 * tileSize);
      this.layer.addChild(tilemap);
      this.#chunks.push(tilemap);
      this.#dirty.add(index);
    }
  }

  /**
   * Marks chunks for a rebuild.
   * @param {Iterable<number>} chunks The chunks.
   */
  markDirty(chunks: Iterable<number>): void
  {
    for (const chunk of chunks)
    {
      this.#dirty.add(chunk);
    }
  }

  /**
   * Marks every chunk for a rebuild.
   */
  markAllDirty(): void
  {
    this.#chunks.forEach((_chunk, index) => this.#dirty.add(index));
  }

  /**
   * Rebuilds the dirty chunks, while the overlay shows.
   * @returns {number} How many chunks were rebuilt.
   */
  flush(): number
  {
    if (this.layer.visible === false || this.#dirty.size === 0)
    {
      return 0;
    }

    const count = this.#dirty.size;
    this.#dirty.forEach(index => this.#fill(index));
    this.#dirty.clear();
    return count;
  }

  /**
   * Shows only the chunks inside a range.
   * @param {ChunkRange} range The chunks on screen.
   */
  cull(range: ChunkRange): void
  {
    this.#chunks.forEach((chunk, index) =>
    {
      chunk.visible = isChunkInRange(this.#grid, range, index);
    });
  }

  /**
   * Lets go of the tilemaps; the atlas belongs to whoever made it.
   */
  destroy(): void
  {
    this.layer.destroy({ children: true });
    this.#chunks = [];
  }

  /**
   * Refills one chunk from the picker.
   * @param {number} index The chunk.
   */
  #fill(index: number): void
  {
    const tilemap = this.#chunks[index];
    tilemap.clear();
    const { x0, y0, x1, y1 } = chunkCells(this.#grid, index);
    const size = this.#tileSize;
    const options = this.#options;
    options.tileWidth = size;
    options.tileHeight = size;
    for (let y = y0; y < y1; y++)
    {
      for (let x = x0; x < x1; x++)
      {
        const cell = this.#pick(x, y);
        if (cell < 0)
        {
          continue;
        }

        options.u = (cell % this.#columns) * size;
        options.v = Math.floor(cell / this.#columns) * size;
        tilemap.tile(0, (x - x0) * size, (y - y0) * size, options);
      }
    }
  }
}

export { AtlasChunks };
export type { AtlasPicker };

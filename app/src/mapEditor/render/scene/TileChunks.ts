import { Container, type TextureSource } from 'pixi.js';
import { TileAnimation } from '../engine/animation.ts';
import { writeSpot, type RectSink, type TileSource } from '../engine/spotWriter.ts';
import { chunkCells, isChunkInRange, type ChunkGrid, type ChunkRange } from '../chunkMath.ts';
import { CompositeTilemap } from '../vendor/pixi-tilemap/index.ts';

/**
 * One chunk of the map and the three tilemaps that draw it: below characters, above them, and the highlighted layer,
 * which draws above everything while a layer is highlighted and is empty otherwise.
 */
type TileChunk = {
  readonly index: number;
  readonly lower: CompositeTilemap;
  readonly upper: CompositeTilemap;
  readonly highlight: CompositeTilemap;
  quads: number;
};

/**
 * The tile options every rect is added with; one object is reused so building a chunk allocates nothing per rect.
 */
type TileOptions = {
  u: number;
  v: number;
  tileWidth: number;
  tileHeight: number;
  animX: number;
  animY: number;
  animCountX: number;
  animCountY: number;
  alpha: number;
};

/**
 * How many frames the A1 animations have: the shader wraps each animated rect's step at this count.
 */
const ANIMATION_FRAMES = 3;

/**
 * An animation count that never wraps, for rects that do not animate.
 */
const STILL = 1024;

/**
 * Draws a map's tiles in square chunks, each rebuilt only when an edit dirties it. Rects come from the engine's spot
 * writer, so a chunk holds exactly what the game's tilemap would draw there: lower rects under characters, star
 * tiles above them. Every chunk reads one shared animation vector, so water moves without any chunk being rebuilt.
 *
 * Rebuilds are deferred: an edit only marks chunks, and {@link flush} rebuilds them inside the frame that draws them,
 * so several patches in one frame cost one rebuild and the frame's timing includes the work.
 */
class TileChunks
{
  /**
   * Every chunk's lower tilemap: drawn below characters.
   */
  readonly lowerLayer = new Container();

  /**
   * Every chunk's upper tilemap: drawn above characters.
   */
  readonly upperLayer = new Container();

  /**
   * Every chunk's highlighted-layer tilemap: drawn above everything, over the dimming.
   */
  readonly highlightLayer = new Container();

  /**
   * The animation vector every chunk reads: the water frame across and the waterfall frame down.
   */
  readonly tileAnim: [ number, number ] = [ 0, 0 ];

  #grid: ChunkGrid;

  #tileSize: number;

  #source: TileSource | null = null;

  #textures: TextureSource[] = [];

  #sheetSlot: number[] = [];

  #chunks: TileChunk[] = [];

  #dirty = new Set<number>();

  #shadows = false;

  #highlight: number | null = null;

  #layerShown = [ true, true, true, true ];

  #options: TileOptions = {
    u: 0,
    v: 0,
    tileWidth: 0,
    tileHeight: 0,
    animX: 0,
    animY: 0,
    animCountX: STILL,
    animCountY: STILL,
    alpha: 1,
  };

  /**
   * @param {ChunkGrid} grid How the map is cut.
   * @param {number} tileSize The tile size in world pixels.
   */
  constructor(grid: ChunkGrid, tileSize: number)
  {
    this.#grid = grid;
    this.#tileSize = tileSize;
  }

  /**
   * How many rects the chunks hold.
   * @returns {number} The count.
   */
  get quadCount(): number
  {
    return this.#chunks.reduce((sum, chunk) => sum + chunk.quads, 0);
  }

  /**
   * How many chunks wait for a rebuild.
   * @returns {number} The count.
   */
  get dirtyCount(): number
  {
    return this.#dirty.size;
  }

  /**
   * Draws a map with a tileset: rebuilds every chunk from scratch.
   * @param {TileSource} source The map and its tileset flags; its data is read live.
   * @param {readonly (TextureSource | null)[]} sheets The nine sheets in RMMZ order, null where the tileset has none.
   */
  setMap(source: TileSource, sheets: readonly (TextureSource | null)[]): void
  {
    this.#source = source;

    // pack only the sheets that exist, so a tileset without A3 or D never binds them.
    this.#textures = [];
    this.#sheetSlot = sheets.map(sheet =>
    {
      if (sheet === null)
      {
        return -1;
      }

      this.#textures.push(sheet);
      return this.#textures.length - 1;
    });

    this.#destroyChunks();
    const count = this.#grid.columns * this.#grid.rows;
    for (let index = 0; index < count; index++)
    {
      this.#chunks.push(this.#createChunk(index));
    }

    this.markAllDirty();
  }

  /**
   * Replaces the map source without rebuilding the chunk objects, as after an edit swapped the tile array.
   * @param {TileSource} source The map and its tileset flags.
   */
  setSource(source: TileSource): void
  {
    this.#source = source;
    this.markAllDirty();
  }

  /**
   * Shows or hides shadows, which the game itself never draws.
   * @param {boolean} on Whether to draw them.
   */
  setShadows(on: boolean): void
  {
    if (this.#shadows !== on)
    {
      this.#shadows = on;
      this.markAllDirty();
    }
  }

  /**
   * Shows or hides the four tile layers; a table's edge goes with layer 2, where the table is.
   * @param {readonly boolean[]} shown Whether each of the four layers draws.
   */
  setLayersShown(shown: readonly boolean[]): void
  {
    const changed = shown.some((value, index) => this.#layerShown[index] !== value);
    if (changed)
    {
      this.#layerShown = [ ...shown ];
      this.markAllDirty();
    }
  }

  /**
   * Picks the layer to highlight, whose rects move to the highlight tilemaps.
   * @param {number | null} layer The tile layer, 0 to 3, or null for none.
   */
  setHighlight(layer: number | null): void
  {
    if (this.#highlight !== layer)
    {
      this.#highlight = layer;
      this.markAllDirty();
    }
  }

  /**
   * Moves the A1 animation to a frame. Only the shared vector changes.
   * @param {readonly [ number, number ]} vector The water frame and the waterfall frame.
   */
  setAnimation(vector: readonly [ number, number ]): void
  {
    const [ water, waterfall ] = vector;
    this.tileAnim[0] = water;
    this.tileAnim[1] = waterfall;
  }

  /**
   * Marks chunks for a rebuild in the next frame.
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
    this.#chunks.forEach(chunk => this.#dirty.add(chunk.index));
  }

  /**
   * Rebuilds every dirty chunk.
   * @returns {number} How many chunks were rebuilt.
   */
  flush(): number
  {
    const count = this.#dirty.size;
    if (count === 0 || this.#source === null)
    {
      return 0;
    }

    this.#dirty.forEach(index =>
    {
      const chunk = this.#chunks[index];
      if (chunk !== undefined)
      {
        this.#fill(chunk);
      }
    });
    this.#dirty.clear();
    return count;
  }

  /**
   * Shows only the chunks inside a range, so the camera never draws what it cannot see.
   * @param {ChunkRange} range The chunks on screen.
   */
  cull(range: ChunkRange): void
  {
    this.#chunks.forEach(chunk =>
    {
      const visible = isChunkInRange(this.#grid, range, chunk.index);
      if (chunk.lower.visible !== visible)
      {
        chunk.lower.visible = visible;
        chunk.upper.visible = visible;
        chunk.highlight.visible = visible;
      }
    });
  }

  /**
   * Lets go of every chunk.
   */
  destroy(): void
  {
    this.#destroyChunks();
    this.lowerLayer.destroy();
    this.upperLayer.destroy();
    this.highlightLayer.destroy();
  }

  /**
   * Builds a chunk's three tilemaps and places them.
   * @param {number} index The chunk.
   * @returns {TileChunk} The chunk.
   */
  #createChunk(index: number): TileChunk
  {
    const { x0, y0 } = chunkCells(this.#grid, index);
    const make = (parent: Container) =>
    {
      const composite = new CompositeTilemap(this.#textures);
      composite.position.set(x0 * this.#tileSize, y0 * this.#tileSize);
      composite.tileAnim = this.tileAnim;
      parent.addChild(composite);
      return composite;
    };

    return { index, lower: make(this.lowerLayer), upper: make(this.upperLayer), highlight: make(this.highlightLayer), quads: 0 };
  }

  /**
   * Clears a chunk and emits every cell in it through the engine's spot writer. The tilemaps are always cleared first:
   * a tilemap only re-uploads when its rect count changed since the last upload, and clearing resets that count.
   * @param {TileChunk} chunk The chunk.
   */
  #fill(chunk: TileChunk): void
  {
    const source = this.#source as TileSource;
    chunk.lower.clear();
    chunk.upper.clear();
    chunk.highlight.clear();
    chunk.quads = 0;

    const { x0, y0, x1, y1 } = chunkCells(this.#grid, chunk.index);
    const size = this.#tileSize;
    const sink = this.#sinkFor(chunk);
    const options = { tileSize: size, animationFrame: 0, shadows: this.#shadows };
    for (let y = y0; y < y1; y++)
    {
      for (let x = x0; x < x1; x++)
      {
        writeSpot(source, x, y, (x - x0) * size, (y - y0) * size, sink, options);
      }
    }
  }

  /**
   * Builds the sink that turns the engine's rects into tiles on a chunk's tilemaps.
   * @param {TileChunk} chunk The chunk.
   * @returns {RectSink} The sink.
   */
  #sinkFor(chunk: TileChunk): RectSink
  {
    const size = this.#tileSize;
    const options = this.#options;
    const highlight = this.#highlight;
    const shown = this.#layerShown;
    return (upper, layer, sheet, sx, sy, dx, dy, width, height, animation) =>
    {
      // a shadow is texture -1, which the tilemap shader fills with its half-transparent black.
      const slot = sheet < 0
        ? -1
        : this.#sheetSlot[sheet];
      if ((sheet >= 0 && slot < 0) || shown[layer] === false)
      {
        return;
      }

      options.u = sx;
      options.v = sy;
      options.tileWidth = width;
      options.tileHeight = height;
      options.animX = animation === TileAnimation.water ? size * 2 : 0;
      options.animCountX = animation === TileAnimation.water ? ANIMATION_FRAMES : STILL;
      options.animY = animation === TileAnimation.waterfall ? size : 0;
      options.animCountY = animation === TileAnimation.waterfall ? ANIMATION_FRAMES : STILL;
      const target = this.#targetFor(chunk, upper, layer, highlight);
      target.tile(slot, dx, dy, options);
      chunk.quads++;
    };
  }

  /**
   * Picks the tilemap a rect lands on.
   * @param {TileChunk} chunk The chunk.
   * @param {boolean} upper Whether the rect draws above characters.
   * @param {number} layer The map layer it comes from.
   * @param {number | null} highlight The highlighted layer.
   * @returns {CompositeTilemap} The tilemap.
   */
  #targetFor(chunk: TileChunk, upper: boolean, layer: number, highlight: number | null): CompositeTilemap
  {
    if (highlight !== null && layer === highlight)
    {
      return chunk.highlight;
    }

    return upper
      ? chunk.upper
      : chunk.lower;
  }

  /**
   * Destroys every chunk's tilemaps.
   */
  #destroyChunks(): void
  {
    this.#chunks.forEach(chunk =>
    {
      chunk.lower.destroy({ children: true });
      chunk.upper.destroy({ children: true });
      chunk.highlight.destroy({ children: true });
    });
    this.#chunks = [];
    this.#dirty.clear();
  }
}

export { TileChunks };

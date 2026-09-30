import { TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { chunkGrid } from '../../../../src/mapEditor/render/chunkMath.ts';
import type { TileSource } from '../../../../src/mapEditor/render/engine/spotWriter.ts';
import { TileChunks } from '../../../../src/mapEditor/render/scene/TileChunks.ts';
import type { CompositeTilemap } from '../../../../src/mapEditor/render/vendor/pixi-tilemap/index.ts';

/*
 * The tile chunks are how an edit redraws only what it touched: a chunk is rebuilt only once marked dirty, from the
 * map as it stands then, and every other chunk keeps what it drew. Each rect lands on the tilemap its drawing order
 * needs (below characters, above them for a star tile, or the highlight tilemap for the highlighted layer), a hidden
 * layer or a sheet the tileset lacks draws nothing, the A1 animation is handed to the shader as a fixed offset per
 * frame, and only the chunks the camera sees are shown. None of it needs a GPU: the tilemaps are read back directly.
 */

/**
 * One rect a chunk's tilemap holds, read back from its buffer.
 */
type Quad = {
  u: number;
  v: number;
  x: number;
  y: number;
  texture: number;
  animX: number;
  animY: number;
  animCountX: number;
  animCountY: number;
};

/**
 * How many numbers the vendored tilemap stores per rect.
 */
const QUAD_STRIDE = 14;

/**
 * Reads back every rect a chunk's tilemap holds.
 * @param {CompositeTilemap} composite The chunk's tilemap.
 * @returns {Quad[]} The rects, in the order they were added.
 */
const quadsOf = (composite: CompositeTilemap): Quad[] =>
{
  return composite.children.flatMap(child =>
  {
    const buffer = (child as unknown as { pointsBuf: number[] }).pointsBuf;
    const quads: Quad[] = [];
    for (let index = 0; index < buffer.length; index += QUAD_STRIDE)
    {
      const [ u, v, x, y, , , , animX, animY, texture, animCountX, animCountY ] = buffer.slice(index, index + QUAD_STRIDE);
      quads.push({ u, v, x, y, texture, animX, animY, animCountX, animCountY });
    }

    return quads;
  });
};

/**
 * Builds an empty map with six layers, and a way to set a cell.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {number[]} flags The tileset flags.
 * @returns {{ source: TileSource, set: (x: number, y: number, z: number, id: number) => void }} The map and its setter.
 */
const buildMap = (width: number, height: number, flags: number[] = []) =>
{
  const data = new Array<number>(width * height * 6).fill(0);
  const source: TileSource = { width, height, data, flags, horizontalWrap: false, verticalWrap: false };
  const set = (x: number, y: number, z: number, id: number) =>
  {
    data[(z * height + y) * width + x] = id;
  };
  return { source, set };
};

/**
 * A tileset with A1, A2, A5 and B sheets and no others, so its sheets pack into slots 0, 1, 2 and 3.
 * @returns {(TextureSource | null)[]} The nine sheets in RMMZ order.
 */
const sheets = (): (TextureSource | null)[] =>
{
  const sheet = () => new TextureSource({ width: 768, height: 768 });
  return [ sheet(), sheet(), null, null, sheet(), sheet(), null, null, null ];
};

/**
 * The chunk tilemaps of one layer, by chunk index.
 * @param {TileChunks} tiles The chunks.
 * @param {'lowerLayer' | 'upperLayer' | 'highlightLayer'} layer Which layer.
 * @param {number} index The chunk.
 * @returns {CompositeTilemap} The chunk's tilemap on that layer.
 */
const chunkOf = (tiles: TileChunks, layer: 'lowerLayer' | 'upperLayer' | 'highlightLayer', index: number): CompositeTilemap =>
{
  return tiles[layer].children[index] as CompositeTilemap;
};

describe('TileChunks', () =>
{
  it('rebuilds only the chunks marked dirty, from the map as it stands, and keeps every other chunk as it was', () =>
  {
    // Arrange: a 4x4 map in 2x2 chunks, the first A5 tile at (0, 0) and at (3, 3), all built once.
    const { source, set } = buildMap(4, 4);
    set(0, 0, 0, 1536);
    set(3, 3, 0, 1536);
    const tiles = new TileChunks(chunkGrid(4, 4, 2), 48);
    tiles.setMap(source, sheets());
    const built = tiles.flush();

    // Act: both corners change to the next A5 tile, but only the chunk holding (3, 3) is marked; then nothing is.
    set(0, 0, 0, 1537);
    set(3, 3, 0, 1537);
    tiles.markDirty([ 3 ]);
    const rebuilt = tiles.flush();
    const idle = tiles.flush();

    // Assert: four chunks, then one, then none; the marked chunk cut the new tile (one column over), at its cell's
    // place inside the chunk, while the unmarked chunk still shows the old one.
    const cut = (index: number) => quadsOf(chunkOf(tiles, 'lowerLayer', index)).map(quad => [ quad.u, quad.x, quad.y ]);
    expect([ built, rebuilt, idle, cut(0), cut(3), tiles.dirtyCount ])
      .toStrictEqual([ 4, 1, 0, [ [ 0, 0, 0 ] ], [ [ 48, 48, 48 ] ], 0 ]);
  });

  it('puts a star tile above characters, the highlighted layer on its own tilemap, and a hidden layer nowhere', () =>
  {
    // Arrange: at (0, 0), A5 ground on layer 1, B tile 5 (a star) on layer 3, and an A3 tile, whose sheet the tileset
    // lacks, on layer 4.
    const flags: number[] = [];
    flags[5] = 0x10;
    const { source, set } = buildMap(2, 2, flags);
    set(0, 0, 0, 1536);
    set(0, 0, 2, 5);
    set(0, 0, 3, 4352);
    const tiles = new TileChunks(chunkGrid(2, 2, 2), 48);
    tiles.setMap(source, sheets());
    const slots = () => [ 'lowerLayer', 'upperLayer', 'highlightLayer' ].map(layer =>
      quadsOf(chunkOf(tiles, layer as 'lowerLayer', 0)).map(quad => quad.texture));

    // Act: as built; with layer 1 highlighted; then with no highlight and layer 3 hidden.
    tiles.flush();
    const plain = slots();
    tiles.setHighlight(0);
    tiles.flush();
    const highlighted = slots();
    tiles.setHighlight(null);
    tiles.setLayersShown([ true, true, false, true ]);
    tiles.flush();
    const hidden = slots();

    // Assert: A5 is slot 2 and B slot 3; the A3 tile never draws.
    expect([ plain, highlighted, hidden ])
      .toStrictEqual([
        [ [ 2 ], [ 3 ], [] ],
        [ [], [ 3 ], [ 2 ] ],
        [ [ 2 ], [], [] ],
      ]);
  });

  it('hands the shader water two tiles across a frame and waterfalls one tile down, over three frames, and still A1 no motion', () =>
  {
    // Arrange: sea (A1 kind 0) at (0, 0), a waterfall (kind 5) at (1, 0), and a still sea decoration (kind 2) at (2, 0).
    const { source, set } = buildMap(3, 1);
    set(0, 0, 0, 2048);
    set(1, 0, 0, 2048 + 5 * 48);
    set(2, 0, 0, 2048 + 2 * 48);
    const tiles = new TileChunks(chunkGrid(3, 1, 4), 48);
    tiles.setMap(source, sheets());

    // Act.
    tiles.flush();
    const quads = quadsOf(chunkOf(tiles, 'lowerLayer', 0));

    // Assert: each cell's four quarters share one motion, read as [ animX, animCountX, animY, animCountY ].
    const motion = (cell: number) => [ ...new Set(quads
      .filter(quad => Math.floor(quad.x / 48) === cell)
      .map(quad => [ quad.animX, quad.animCountX, quad.animY, quad.animCountY ].join())) ];
    expect([ motion(0), motion(1), motion(2), quads.length ])
      .toStrictEqual([ [ '96,3,0,1024' ], [ '0,1024,48,3' ], [ '0,1024,0,1024' ], 12 ]);
  });

  it('shows only the chunks inside the camera\'s range, on every layer', () =>
  {
    // Arrange: a 4x4 map in 2x2 chunks.
    const { source } = buildMap(4, 4);
    const tiles = new TileChunks(chunkGrid(4, 4, 2), 48);
    tiles.setMap(source, sheets());

    // Act: the camera sees the right-hand column of chunks.
    tiles.cull({ cx0: 1, cy0: 0, cx1: 2, cy1: 2 });

    // Assert.
    const shown = (layer: 'lowerLayer' | 'upperLayer' | 'highlightLayer') => tiles[layer].children.map(child => child.visible);
    expect([ shown('lowerLayer'), shown('upperLayer'), shown('highlightLayer') ])
      .toStrictEqual([ [ false, true, false, true ], [ false, true, false, true ], [ false, true, false, true ] ]);
  });
});

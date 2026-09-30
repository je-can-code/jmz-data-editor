import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TileAnimation, waterSurfaceIndex } from '../../../../src/mapEditor/render/engine/animation.ts';
import { readMapData, writeSpot, writeTile, type RectSink, type TileSource } from '../../../../src/mapEditor/render/engine/spotWriter.ts';
import { locateGameProject } from '../../../support/gameProject.ts';

/*
 * The spot writer is Tilemap#_addSpot ported: for every cell it emits the rects the engine's tilemap would draw
 * there, in the engine's order (layers 1 and 2, the shadow, the edge of a table above, layers 3 and 4), each cut from
 * the sheet and quarter the engine's own tables pick, and each routed above or below characters by its star flag.
 * Getting it right is what "draws exactly as the engine does" means, so every sheet, every table choice, the A1
 * animation, tables and wrapping are pinned here, each beside a near miss that must come out differently.
 *
 * The renderer builds every rect at animation frame 0 and lets the tilemap shader move animated rects by a fixed
 * offset per frame; the real-map test proves those offsets land exactly where the engine's own per-frame cut would.
 */

/**
 * One rect as a flat tuple: upper (1 or 0), layer, sheet, source x, source y, destination x, destination y, width,
 * height, animation.
 */
type RectTuple = [ number, number, number, number, number, number, number, number, number, number ];

/**
 * Builds a map to draw: width by height cells, six layers, every cell empty, with no loops.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {number[]} flags The tileset flags.
 * @returns {TileSource & { data: number[], set: (x: number, y: number, z: number, id: number) => void }} The map.
 */
const buildMap = (width: number, height: number, flags: number[] = []) =>
{
  const data = new Array<number>(width * height * 6).fill(0);
  const source = {
    width,
    height,
    data,
    flags,
    horizontalWrap: false,
    verticalWrap: false,
    set: (x: number, y: number, z: number, id: number) =>
    {
      data[(z * height + y) * width + x] = id;
    },
  };
  return source;
};

/**
 * Collects rects as tuples.
 * @returns {{ rects: RectTuple[], sink: RectSink }} The list and the sink filling it.
 */
const recorder = () =>
{
  const rects: RectTuple[] = [];
  const sink: RectSink = (upper, layer, sheet, sx, sy, dx, dy, width, height, animation) =>
  {
    rects.push([ upper ? 1 : 0, layer, sheet, sx, sy, dx, dy, width, height, animation ]);
  };
  return { rects, sink };
};

/**
 * Draws one cell of a map.
 * @param {TileSource} source The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {{ frame?: number, shadows?: boolean }} options The animation frame and whether shadows draw.
 * @returns {RectTuple[]} The cell's rects.
 */
const draw = (source: TileSource, x: number, y: number, options: { frame?: number; shadows?: boolean } = {}): RectTuple[] =>
{
  const { rects, sink } = recorder();
  writeSpot(source, x, y, x * 48, y * 48, sink, { tileSize: 48, animationFrame: options.frame ?? 0, shadows: options.shadows ?? false });
  return rects;
};

const NONE = TileAnimation.none;
const WATER = TileAnimation.water;
const WATERFALL = TileAnimation.waterfall;

describe('spotWriter', () =>
{
  describe('writeSpot: normal tiles', () =>
  {
    it('cuts a B tile from its sheet as one whole-tile rect, and nothing from an empty cell', () =>
    {
      // Arrange: B tile 9 (second row, second column) on layer 4 at (1, 0); (0, 0) is empty.
      const map = buildMap(2, 1);
      map.set(1, 0, 3, 9);

      // Act.
      const rects = [ draw(map, 1, 0), draw(map, 0, 0) ];

      // Assert.
      expect(rects)
        .toStrictEqual([ [ [ 0, 3, 5, 48, 48, 48, 0, 48, 48, NONE ] ], [] ]);
    });

    it('cuts A5 from its own sheet, and draws nothing for an id past the last sheet', () =>
    {
      // Arrange: A5's first tile on layer 1 at (0, 0), and an id of 8192 at (1, 0).
      const map = buildMap(2, 1);
      map.set(0, 0, 0, 1536);
      map.set(1, 0, 0, 8192);

      // Act.
      const rects = [ draw(map, 0, 0), draw(map, 1, 0) ];

      // Assert.
      expect(rects)
        .toStrictEqual([ [ [ 0, 0, 4, 0, 0, 0, 0, 48, 48, NONE ] ], [] ]);
    });
  });

  describe('writeSpot: autotiles', () =>
  {
    it('cuts an A2 shape\'s four quarters from the floor table at its kind\'s block', () =>
    {
      // Arrange: A2 kind 25 (block 2 across, 3 down) shape 46, and the same kind at shape 47 beside it.
      const map = buildMap(2, 1);
      map.set(0, 0, 0, 2048 + 25 * 48 + 46);
      map.set(1, 0, 0, 2048 + 25 * 48 + 47);

      // Act.
      const rects = [ draw(map, 0, 0), draw(map, 1, 0) ];

      // Assert: shape 46 is [[0,2],[3,2],[0,5],[3,5]]; shape 47 is [[0,0],[1,0],[0,1],[1,1]].
      expect(rects)
        .toStrictEqual([
          [
            [ 0, 0, 1, 96, 192, 0, 0, 24, 24, NONE ],
            [ 0, 0, 1, 168, 192, 24, 0, 24, 24, NONE ],
            [ 0, 0, 1, 96, 264, 0, 24, 24, 24, NONE ],
            [ 0, 0, 1, 168, 264, 24, 24, 24, 24, NONE ],
          ],
          [
            [ 0, 0, 1, 96, 144, 48, 0, 24, 24, NONE ],
            [ 0, 0, 1, 120, 144, 72, 0, 24, 24, NONE ],
            [ 0, 0, 1, 96, 168, 48, 24, 24, 24, NONE ],
            [ 0, 0, 1, 120, 168, 72, 24, 24, 24, NONE ],
          ],
        ]);
    });

    it('cuts A3 from the wall table, and A4 wall faces from the wall table but wall tops from the floor table', () =>
    {
      // Arrange: A3 kind 48, A4 kind 80 (a wall top row) and A4 kind 88 (a wall face row), all shape 0.
      const map = buildMap(3, 1);
      map.set(0, 0, 0, 2048 + 48 * 48);
      map.set(1, 0, 0, 2048 + 80 * 48);
      map.set(2, 0, 0, 2048 + 88 * 48);

      // Act: the first quarter of each.
      const firsts = [ draw(map, 0, 0)[0], draw(map, 1, 0)[0], draw(map, 2, 0)[0] ];

      // Assert: the wall table's shape 0 starts at [2,2], the floor table's at [2,4]; the face row sits 3 blocks down.
      expect(firsts)
        .toStrictEqual([
          [ 0, 0, 2, 48, 48, 0, 0, 24, 24, NONE ],
          [ 0, 0, 3, 48, 96, 48, 0, 24, 24, NONE ],
          [ 0, 0, 3, 48, 192, 96, 0, 24, 24, NONE ],
        ]);
    });

    it('steps the A1 seas two tiles across per water frame, and leaves their decorations still', () =>
    {
      // Arrange: kind 0 (sea), kind 1 (deep sea) and kind 2 (a still decoration), shape 47.
      const map = buildMap(3, 1);
      map.set(0, 0, 0, 2048 + 47);
      map.set(1, 0, 0, 2048 + 48 + 47);
      map.set(2, 0, 0, 2048 + 2 * 48 + 47);

      // Act: frame 0 and frame 2, the first quarter of each.
      const frames = [ 0, 2 ].map(frame => [ draw(map, 0, 0, { frame })[0], draw(map, 1, 0, { frame })[0], draw(map, 2, 0, { frame })[0] ]);

      // Assert: frame 2 is water frame 2, four half tiles further across; the decoration never moves.
      expect(frames)
        .toStrictEqual([
          [ [ 0, 0, 0, 0, 0, 0, 0, 24, 24, WATER ], [ 0, 0, 0, 0, 144, 48, 0, 24, 24, WATER ], [ 0, 0, 0, 288, 0, 96, 0, 24, 24, NONE ] ],
          [ [ 0, 0, 0, 192, 0, 0, 0, 24, 24, WATER ], [ 0, 0, 0, 192, 144, 48, 0, 24, 24, WATER ], [ 0, 0, 0, 288, 0, 96, 0, 24, 24, NONE ] ],
        ]);
    });

    it('draws even A1 kinds from 4 on as water and odd ones as waterfalls, stepping down a tile per frame', () =>
    {
      // Arrange: kind 4 (water) and kind 5 (its waterfall), shape 0, and kind 7 (a waterfall one block lower).
      const map = buildMap(3, 1);
      map.set(0, 0, 0, 2048 + 4 * 48);
      map.set(1, 0, 0, 2048 + 5 * 48);
      map.set(2, 0, 0, 2048 + 7 * 48);

      // Act: frame 1, the first quarter of each.
      const firsts = [ draw(map, 0, 0, { frame: 1 })[0], draw(map, 1, 0, { frame: 1 })[0], draw(map, 2, 0, { frame: 1 })[0] ];

      // Assert: the waterfalls use the waterfall table ([2,0] first) and sit one tile down at frame 1.
      expect(firsts)
        .toStrictEqual([
          [ 0, 0, 0, 528, 96, 0, 0, 24, 24, WATER ],
          [ 0, 0, 0, 720, 48, 48, 0, 24, 24, WATERFALL ],
          [ 0, 0, 0, 720, 192, 96, 0, 24, 24, WATERFALL ],
        ]);
    });
  });

  describe('writeSpot: tables', () =>
  {
    it('splits a table\'s leg quarters into the middle row and the leg\'s lower half, and leaves a plain A2 whole', () =>
    {
      // Arrange: kind 16 shape 8 ([[2,4],[1,4],[2,1],[1,3]]) as a table at (0, 0), and unflagged at (1, 0).
      const table = 2816 + 8;
      const plain = 2816 + 48 + 8;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(2, 1, flags);
      map.set(0, 0, 0, table);
      map.set(1, 0, 0, plain);

      // Act.
      const counts = [ draw(map, 0, 0).length, draw(map, 1, 0).length ];
      const legQuarter = draw(map, 0, 0).slice(2, 4);

      // Assert: quarter 3 ([2,1]) draws the middle row's [2,3] then the leg's lower half, 12 pixels down.
      expect([ counts, legQuarter ])
        .toStrictEqual([
          [ 5, 4 ],
          [ [ 0, 0, 1, 48, 72, 0, 24, 24, 24, NONE ], [ 0, 0, 1, 48, 24, 0, 36, 24, 12, NONE ] ],
        ]);
    });

    it('hangs a layer 2 table\'s lower edge onto the cell beneath, between that cell\'s layers 2 and 3', () =>
    {
      // Arrange: a table on layer 2 at (0, 0); beneath it ground on layer 1 and a B tile on layer 3.
      const table = 2816 + 8;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(1, 2, flags);
      map.set(0, 0, 1, table);
      map.set(0, 1, 0, 1536);
      map.set(0, 1, 2, 9);

      // Act.
      const rects = draw(map, 0, 1);

      // Assert: ground, the two edge halves (bottom quarters of shape 8, half height), then the B tile.
      expect(rects)
        .toStrictEqual([
          [ 0, 0, 4, 0, 0, 0, 48, 48, 48, NONE ],
          [ 0, 1, 1, 48, 36, 0, 48, 24, 12, NONE ],
          [ 0, 1, 1, 24, 84, 24, 48, 24, 12, NONE ],
          [ 0, 2, 5, 48, 48, 0, 48, 48, 48, NONE ],
        ]);
    });

    it('hangs no edge under a table that sits on layer 1, or onto a table, or onto a wall', () =>
    {
      // Arrange: three columns; a table on layer 1 over plain ground, a table over a table, a table over an A4 wall.
      // Shape 0 has no leg quarters, so every half-height rect counted below would be an edge.
      const table = 2816;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(3, 2, flags);
      map.set(0, 0, 0, table);
      map.set(1, 0, 1, table);
      map.set(1, 1, 1, table);
      map.set(2, 0, 1, table);
      map.set(2, 1, 0, 5888);

      // Act: the edge rects in the cells beneath.
      const edges = [ 0, 1, 2 ].map(x => draw(map, x, 1).filter(rect => rect[8] === 12).length);

      // Assert.
      expect(edges)
        .toStrictEqual([ 0, 0, 0 ]);
    });
  });

  describe('writeSpot: star tiles, shadows and order', () =>
  {
    it('routes a star tile above characters and every other tile below them', () =>
    {
      // Arrange: B tile 1 is a star, B tile 2 is not.
      const map = buildMap(1, 1, [ 0, 0x10, 0 ]);
      map.set(0, 0, 0, 2);
      map.set(0, 0, 3, 1);

      // Act.
      const upper = draw(map, 0, 0).map(rect => rect[0]);

      // Assert.
      expect(upper)
        .toStrictEqual([ 0, 1 ]);
    });

    it('shades the quarters the shadow bits name, only while shadows draw', () =>
    {
      // Arrange: bits 1 and 4 (top-left and bottom-left) at (0, 0); a high bit with no quarter at (1, 0).
      const map = buildMap(2, 1);
      map.set(0, 0, 4, 0b0101);
      map.set(1, 0, 4, 0b10000);

      // Act.
      const rects = [ draw(map, 0, 0, { shadows: true }), draw(map, 0, 0), draw(map, 1, 0, { shadows: true }) ];

      // Assert: a shadow is sheet -1 on layer 5's slot (4), below characters.
      expect(rects)
        .toStrictEqual([
          [ [ 0, 4, -1, 0, 0, 0, 0, 24, 24, NONE ], [ 0, 4, -1, 0, 0, 0, 24, 24, 24, NONE ] ],
          [],
          [],
        ]);
    });

    it('emits a cell in the engine\'s order: layers 1 and 2, the shadow, the table edge, layers 3 and 4', () =>
    {
      // Arrange: every part at once in (0, 1), under a table at (0, 0).
      const table = 2816 + 8;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(1, 2, flags);
      map.set(0, 0, 1, table);
      map.set(0, 1, 0, 1536);
      map.set(0, 1, 1, 2816 + 48 + 47);
      map.set(0, 1, 2, 9);
      map.set(0, 1, 3, 10);
      map.set(0, 1, 4, 0b1000);

      // Act.
      const order = draw(map, 0, 1, { shadows: true }).map(rect => (rect[8] === 12 ? 'edge' : rect[1]));

      // Assert.
      expect(order)
        .toStrictEqual([ 0, 1, 1, 1, 1, 4, 'edge', 'edge', 2, 3 ]);
    });
  });

  describe('readMapData', () =>
  {
    it('wraps reads on a looping map, and answers 0 off a map that does not loop', () =>
    {
      // Arrange: a 2x2 map with layer 1 cells 1 to 4, looping across only.
      const map = buildMap(2, 2);
      [ 1, 2, 3, 4 ].forEach((id, index) => map.set(index % 2, Math.floor(index / 2), 0, id));
      const looping = { ...map, horizontalWrap: true };

      // Act.
      const reads = [
        readMapData(looping, -1, 0, 0),
        readMapData(looping, 2, 1, 0),
        readMapData(looping, 0, -1, 0),
        readMapData(map, -1, 0, 0),
        readMapData(map, 1, 1, 0),
      ];

      // Assert.
      expect(reads)
        .toStrictEqual([ 2, 3, 0, 0, 4 ]);
    });

    it('hangs the bottom row\'s table edges onto the top row of a map that loops down', () =>
    {
      // Arrange: a table on layer 2 on the bottom row of a 1x2 map.
      const table = 2816 + 8;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(1, 2, flags);
      map.set(0, 1, 1, table);
      const looping = { ...map, verticalWrap: true };

      // Act.
      const edges = [ looping, map ].map(source => draw(source, 0, 0).filter(rect => rect[8] === 12).length);

      // Assert.
      expect(edges)
        .toStrictEqual([ 2, 0 ]);
    });
  });

  describe('writeTile', () =>
  {
    it('emits one tile on its own, with no neighbour\'s table edge', () =>
    {
      // Arrange: a table above the cell the ghost lands on.
      const table = 2816 + 8;
      const flags: number[] = [];
      flags[table] = 0x80;
      const map = buildMap(1, 2, flags);
      map.set(0, 0, 1, table);
      const { rects, sink } = recorder();

      // Act.
      writeTile(map, 2, 9, 0, 48, sink, { tileSize: 48, animationFrame: 0, shadows: true });

      // Assert.
      expect(rects)
        .toStrictEqual([ [ 0, 2, 5, 48, 48, 0, 48, 48, 48, NONE ] ]);
    });
  });

  const project = locateGameProject();
  describe('writeSpot on a shipped map', () =>
  {
    it.skipIf(project === null)('lands every animated rect where the engine cuts it at each frame, by the shader\'s offsets', () =>
    {
      // Arrange: Map102, which holds water and waterfalls, with its tileset's flags.
      const map = JSON.parse(readFileSync(`${project}/data/Map102.json`, 'utf8')) as { width: number; height: number; data: number[]; tilesetId: number };
      const tilesets = JSON.parse(readFileSync(`${project}/data/Tilesets.json`, 'utf8')) as ({ flags: number[] } | null)[];
      const source: TileSource = { width: map.width, height: map.height, data: map.data, flags: tilesets[map.tilesetId]?.flags ?? [], horizontalWrap: false, verticalWrap: false };
      const drawFrame = (frame: number): RectTuple[] =>
      {
        const { rects, sink } = recorder();
        for (let y = 0; y < map.height; y++)
        {
          for (let x = 0; x < map.width; x++)
          {
            writeSpot(source, x, y, x * 48, y * 48, sink, { tileSize: 48, animationFrame: frame, shadows: true });
          }
        }

        return rects;
      };
      const base = drawFrame(0);

      // Act: frames 1 to 5, against frame 0 moved as the shader moves it.
      const mismatches = [ 1, 2, 3, 4, 5 ].map(frame =>
      {
        const moved = base.map(rect =>
        {
          const shifted = [ ...rect ] as RectTuple;
          shifted[3] += rect[9] === WATER ? 96 * waterSurfaceIndex(frame) : 0;
          shifted[4] += rect[9] === WATERFALL ? 48 * (frame % 3) : 0;
          return shifted;
        });
        const engine = drawFrame(frame);
        return engine.filter((rect, index) => rect.join() !== moved[index].join()).length;
      });
      const animated = base.filter(rect => rect[9] !== NONE).length;

      // Assert: every frame matches, and the map really animates.
      expect([ mismatches, animated > 1000 ])
        .toStrictEqual([ [ 0, 0, 0, 0, 0 ], true ]);
    });
  });
});

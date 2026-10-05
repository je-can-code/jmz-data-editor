import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PassabilityQuery, PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { walkMapOf } from '../../../../src/mapEditor/render/engine/walkPassage.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A route preview marks the steps a wall stops, and the author trusts those marks as they trust the passability
 * overlay, so the walk reads each step out of a tile exactly as the overlay does: the engine's passage through the
 * tile stack, then the plugin modules' deny rules, with a tile off the map letting nothing through. It loops the way
 * the map's scroll type says, and works each tile out only once, since a walk asks about the same tiles again and again.
 */
describe('walkMapOf', () =>
{
  /**
   * The fixture's 3x2 map holds tile id (layer * 6 + y * 3 + x + 1) in each cell, so the top layer's tile at 1, 0 is
   * tile 20. A tileset blocking that tile every way, and letting every other tile through.
   * @returns {RmmzTileset} The tileset.
   */
  const buildTileset = (): RmmzTileset =>
  {
    const flags = new Array(40).fill(0);
    flags[20] = 0x0f;
    return { id: 4, flags, mode: 1, name: 'Walls', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
  };

  /**
   * Builds the fixture's map, scrolling as it is told.
   * @param {number} scrollType How it loops.
   * @returns {MapDocument} The map.
   */
  const buildMap = (scrollType = 0): MapDocument =>
  {
    return MapDocument.fromJson('map:1', { ...buildMapJson(), scrollType });
  };

  it('stops every step out of a blocked tile, and lets the others through', () =>
  {
    // Arrange.
    const walkMap = walkMapOf(buildMap(), buildTileset(), []);

    // Act.
    const passes = [ walkMap.isPassable(1, 0, 2), walkMap.isPassable(1, 0, 4), walkMap.isPassable(0, 0, 6), walkMap.isPassable(2, 1, 8) ];

    // Assert.
    expect(passes)
      .toStrictEqual([ false, false, true, true ]);
  });

  it('lets nothing through off the map', () =>
  {
    // Arrange.
    const walkMap = walkMapOf(buildMap(), buildTileset(), []);

    // Act.
    const passes = [ walkMap.isPassable(-1, 0, 6), walkMap.isPassable(3, 0, 4), walkMap.isPassable(0, -1, 2), walkMap.isPassable(0, 2, 8) ];

    // Assert.
    expect(passes)
      .toStrictEqual([ false, false, false, false ]);
  });

  it('stops the steps a plugin module\'s rule denies, where the tiles would let them through', () =>
  {
    // Arrange: a rule denying steps down out of 0, 1.
    const rule: PassabilityRule = {
      id: 'test.down',
      title: 'No going down',
      deny: (query: PassabilityQuery) => (query.x === 0 && query.y === 1 && query.direction === 2 ? 'a ledge' : null),
    };
    const walkMap = walkMapOf(buildMap(), buildTileset(), [ rule ]);

    // Act.
    const passes = [ walkMap.isPassable(0, 1, 2), walkMap.isPassable(0, 1, 8), walkMap.isPassable(1, 1, 2) ];

    // Assert.
    expect(passes)
      .toStrictEqual([ false, true, true ]);
  });

  it('works each tile out once, however often it is asked', () =>
  {
    // Arrange: a rule counting how often it is asked.
    let asked = 0;
    const rule: PassabilityRule = {
      id: 'test.count',
      title: 'Counting',
      deny: () =>
      {
        asked += 1;
        return null;
      },
    };
    const walkMap = walkMapOf(buildMap(), buildTileset(), [ rule ]);

    // Act: the same tile, every way, twice over.
    [ 2, 4, 6, 8, 2, 4, 6, 8 ].forEach(direction => walkMap.isPassable(0, 1, direction as 2 | 4 | 6 | 8));

    // Assert: four directions asked about once.
    expect(asked)
      .toBe(4);
  });

  it('loops the way the map\'s scroll type says', () =>
  {
    // Arrange: no loop, up and down, across, and both.
    const scrollTypes = [ 0, 1, 2, 3 ];

    // Act.
    const loops = scrollTypes.map(scrollType =>
    {
      const walkMap = walkMapOf(buildMap(scrollType), buildTileset(), []);
      return [ walkMap.loopsX, walkMap.loopsY ];
    });

    // Assert.
    expect(loops)
      .toStrictEqual([ [ false, false ], [ false, true ], [ true, false ], [ true, true ] ]);
  });

  it('takes the map\'s size', () =>
  {
    // Arrange: nothing beyond the fixture's 3x2 map.

    // Act.
    const walkMap = walkMapOf(buildMap(), buildTileset(), []);

    // Assert.
    expect([ walkMap.width, walkMap.height ])
      .toStrictEqual([ 3, 2 ]);
  });
});

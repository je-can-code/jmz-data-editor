import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PassabilityQuery, PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { passageReaderOf, walkMapOf } from '../../../../src/mapEditor/render/engine/walkPassage.ts';
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

  it('walks by the passage handed over, rather than working out its own', () =>
  {
    // Arrange: a reader saying the tile at 2, 1 stops every way out, where the fixture's tiles stop nothing there.
    const passage = (x: number, y: number) => ({ blocked: x === 2 && y === 1 ? 15 : 0, denied: 0, reasons: {} });

    // Act.
    const walkMap = walkMapOf(buildMap(), buildTileset(), [], passage);

    // Assert.
    expect([ walkMap.isPassable(2, 1, 8), walkMap.isPassable(1, 1, 8) ])
      .toStrictEqual([ false, true ]);
  });
});

/*
 * The passage a landing reads is the overlay's, tile for tile, with the rules' reasons kept by direction so a landing can
 * say why no step leaves it, and with each event read by the page the caller picks, since a landing judges events as a
 * fresh save shows them rather than by their first page.
 */
describe('passageReaderOf', () =>
{
  /**
   * A tileset letting every tile through but tile 30, which blocks every way.
   * @returns {RmmzTileset} The tileset.
   */
  const buildTileset = (): RmmzTileset =>
  {
    const flags = new Array(40).fill(0);
    flags[30] = 0x0f;
    return { id: 4, flags, mode: 1, name: 'Walls', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
  };

  /**
   * Builds the fixture's map with event 1 at 1, 1 drawing nothing on its first page and tile 30 below characters on its
   * second.
   * @returns {MapDocument} The map.
   */
  const buildMap = (): MapDocument =>
  {
    const json = buildMapJson();
    const event = createMapEvent(1, 1, 1);
    const second = { ...event.pages[0], image: { ...event.pages[0].image, tileId: 30 }, priorityType: 0 };
    json.events = [ null, { ...event, pages: [ event.pages[0], second ] } ];
    return MapDocument.fromJson('map:1', json);
  };

  it('reads each event by its first page unless told otherwise', () =>
  {
    // Arrange.
    const passage = passageReaderOf(buildMap(), buildTileset(), []);

    // Act.
    const { blocked } = passage(1, 1);

    // Assert: the first page draws no tile, so nothing stops a step.
    expect(blocked)
      .toBe(0);
  });

  it('reads each event by the page the reader picks', () =>
  {
    // Arrange: every event showing its second page.
    const passage = passageReaderOf(buildMap(), buildTileset(), [], { activePage: () => 1 });

    // Act.
    const read = [ passage(1, 1).blocked, passage(0, 1).blocked ];

    // Assert: tile 30's picture stops every way out of its tile, and nothing out of the tile beside it.
    expect(read)
      .toStrictEqual([ 15, 0 ]);
  });

  it('keeps each rule\'s reason under the direction it denies', () =>
  {
    // Arrange: a rule denying the way left out of every tile.
    const rule: PassabilityRule = {
      id: 'test.left',
      title: 'No going left',
      deny: (query: PassabilityQuery) => (query.direction === 4 ? 'A ledge.' : null),
    };
    const passage = passageReaderOf(buildMap(), buildTileset(), [ rule ]);

    // Act.
    const read = passage(2, 0);

    // Assert.
    expect(read)
      .toStrictEqual({ blocked: 0, denied: 2, reasons: { 4: 'A ledge.' } });
  });
});

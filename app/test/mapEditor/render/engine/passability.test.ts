import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { PassabilityQuery, PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import {
  cellPassage,
  cellTiles,
  checkPassage,
  passabilityQuery,
  passageBit,
  tileEventsByCell,
  type PassageSource,
} from '../../../../src/mapEditor/render/engine/passability.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The passability overlay shows what stops a step out of each cell: the engine's own Game_Map#checkPassage, where
 * the first tile without the star flag decides and a stack of star tiles blocks, reading tile-image events below
 * characters first and then the layers from the top down; and on top of it the plugin modules' deny rules, asked only
 * where the engine lets the step through. The overlay is what an author trusts when they place a transfer's landing,
 * so each rule is pinned beside a near miss.
 */

/**
 * Builds a one-cell map whose four layers hold the given tiles, bottom first.
 * @param {number[]} layers The tile on each of the four layers.
 * @param {number[]} flags The tileset flags.
 * @returns {PassageSource} The map.
 */
const oneCell = (layers: number[], flags: number[]): PassageSource =>
{
  return { width: 1, height: 1, data: [ ...layers, 0, 0 ], flags };
};

describe('passability', () =>
{
  describe('passageBit', () =>
  {
    it('reads down, left, right and up as bits 1, 2, 4 and 8', () =>
    {
      // Arrange.
      const directions = [ 2, 4, 6, 8 ] as const;

      // Act.
      const bits = directions.map(passageBit);

      // Assert.
      expect(bits)
        .toStrictEqual([ 1, 2, 4, 8 ]);
    });
  });

  describe('checkPassage', () =>
  {
    it('lets the first tile without the star flag decide, skipping star tiles above it', () =>
    {
      // Arrange: tile 1 a star, tile 2 passable, tile 3 blocked every way.
      const flags = [ 0x10, 0x10, 0, 0x0f ];

      // Act.
      const passes = [
        checkPassage(flags, [ 1, 2, 3 ], 1),
        checkPassage(flags, [ 1, 3, 2 ], 1),
        checkPassage(flags, [ 3, 2 ], 1),
      ];

      // Assert.
      expect(passes)
        .toStrictEqual([ true, false, false ]);
    });

    it('blocks a stack of nothing but star tiles', () =>
    {
      // Arrange: every tile a star, as tile 0 is in MZ's tilesets.
      const flags = [ 0x10, 0x10 ];

      // Act.
      const passes = checkPassage(flags, [ 0, 1, 0 ], 8);

      // Assert.
      expect(passes)
        .toBe(false);
    });

    it('decides each direction by its own bit', () =>
    {
      // Arrange: tile 1 blocks only the way up.
      const flags = [ 0x10, 0x08 ];

      // Act.
      const passes = [ 1, 2, 4, 8 ].map(bit => checkPassage(flags, [ 1 ], bit));

      // Assert.
      expect(passes)
        .toStrictEqual([ true, true, true, false ]);
    });
  });

  describe('cellTiles', () =>
  {
    it('lists tile-image events first, then the four layers from the top down', () =>
    {
      // Arrange: layers 1 to 4 hold tiles 11 to 14.
      const source = oneCell([ 11, 12, 13, 14 ], []);

      // Act.
      const tiles = cellTiles(source, 0, 0, [ 90, 91 ]);

      // Assert.
      expect(tiles)
        .toStrictEqual([ 90, 91, 14, 13, 12, 11 ]);
    });
  });

  describe('tileEventsByCell', () =>
  {
    it('counts only tile images below characters, by the first page, in event id order', () =>
    {
      // Arrange: on the fixture map, a tile image below characters at (1, 1), another there too, a tile image with
      // characters at (1, 1), and a character below characters at (2, 1).
      const json = buildMapJson();
      const tile = (id: number, x: number, y: number, tileId: number, priorityType: number, characterName = '') =>
      {
        const event = createMapEvent(id, x, y);
        event.pages[0].image = { ...event.pages[0].image, tileId, characterName };
        event.pages[0].priorityType = priorityType;
        return event;
      };
      json.events = [ null, tile(1, 1, 1, 40, 0), tile(2, 1, 1, 41, 1), tile(3, 2, 1, 0, 0, 'Actor1'), tile(4, 1, 1, 42, 0) ];
      const document = MapDocument.fromJson('map:1', json);

      // Act.
      const cells = tileEventsByCell(document);

      // Assert: cell (1, 1) is index 4 on the 3-wide map.
      expect([ ...cells.entries() ])
        .toStrictEqual([ [ 4, [ 40, 42 ] ] ]);
    });

    it('leaves out a tile image with Through on, which the engine\'s posNt skips', () =>
    {
      // Arrange: two tile images below characters on (1, 1), the same but for Through, and a third, with Through, alone
      // on (2, 1).
      const json = buildMapJson();
      const tile = (id: number, x: number, tileId: number, through: boolean) =>
      {
        const event = createMapEvent(id, x, 1);
        event.pages[0].image = { ...event.pages[0].image, tileId };
        event.pages[0].priorityType = 0;
        event.pages[0].through = through;
        return event;
      };
      json.events = [ null, tile(1, 1, 40, true), tile(2, 1, 41, false), tile(3, 2, 42, true) ];
      const document = MapDocument.fromJson('map:1', json);

      // Act.
      const cells = tileEventsByCell(document);

      // Assert: only the event without Through counts, and the cell holding only a Through event holds nothing.
      expect([ ...cells.entries() ])
        .toStrictEqual([ [ 4, [ 41 ] ] ]);
    });

    it('reads each event by the page a page reader picks, and an event showing no page as nothing', () =>
    {
      // Arrange: three events on (1, 1), each with a first page drawing tile 40 below characters and a second drawing
      // tile 41; the reader shows the first event's second page, the second event's first, and the third none at all.
      const json = buildMapJson();
      const twoPages = (id: number) =>
      {
        const event = createMapEvent(id, 1, 1);
        const first = { ...event.pages[0], image: { ...event.pages[0].image, tileId: 40 }, priorityType: 0 };
        const second = { ...first, image: { ...first.image, tileId: 41 } };
        return { ...event, pages: [ first, second ] };
      };
      json.events = [ null, twoPages(1), twoPages(2), twoPages(3) ];
      const document = MapDocument.fromJson('map:1', json);
      const shown = new Map([ [ 1, 1 ], [ 2, 0 ], [ 3, -1 ] ]);

      // Act.
      const cells = tileEventsByCell(document, { activePage: event => shown.get(event.id) as number });

      // Assert: the first event's second page, the second event's first, and nothing for the third.
      expect([ ...cells.entries() ])
        .toStrictEqual([ [ 4, [ 41, 40 ] ] ]);
    });
  });

  describe('cellPassage', () =>
  {
    /**
     * Builds a deny rule that refuses one direction with a reason, and remembers every question it was asked.
     * @param {number} direction The direction it refuses.
     * @returns {{ rule: PassabilityRule, asked: number[] }} The rule and its questions.
     */
    const denying = (direction: number) =>
    {
      const asked: number[] = [];
      const rule: PassabilityRule = {
        id: 'regions.deny',
        title: 'Deny',
        deny: (query: PassabilityQuery) =>
        {
          asked.push(query.direction);
          return query.direction === direction ? 'The region stops it.' : null;
        },
      };
      return { rule, asked };
    };

    it('marks what the engine blocks, then what a rule denies among the steps the engine allows', () =>
    {
      // Arrange: the ground blocks the way down; a rule denies the way right, and the way down, which it is never asked.
      const source = oneCell([ 1, 0, 0, 0 ], [ 0x10, 0x01 ]);
      const right = denying(6);
      const down = denying(2);

      // Act.
      const passage = cellPassage(source, 0, 0, [], [ right.rule, down.rule ], (x, y, direction) => ({ direction, x, y } as PassabilityQuery));

      // Assert: down is the engine's (bit 1); right is denied (bit 4), its reason kept under its direction; the second
      // rule was only asked where the first allowed.
      expect([ passage, right.asked, down.asked ])
        .toStrictEqual([
          { blocked: 1, denied: 4, reasons: { 6: 'The region stops it.' } },
          [ 4, 6, 8 ],
          [ 4, 8 ],
        ]);
    });

    it('asks the rules about the tiles the step reads, tile pictures first, as the engine reads them', () =>
    {
      // Arrange: a ground of tile 1 under a star on layer 2, and a tile picture of tile 3 standing there.
      const source = oneCell([ 1, 2, 0, 0 ], [ 0x10, 0, 0x10, 0 ]);
      const stacks: (readonly number[])[] = [];
      const rule: PassabilityRule = {
        id: 'test.stack',
        title: 'Stack',
        deny: (query: PassabilityQuery) =>
        {
          stacks.push(query.tiles);
          return null;
        },
      };

      // Act.
      cellPassage(source, 0, 0, [ 3 ], [ rule ], (x, y, direction, tiles) => ({ direction, x, y, tiles } as PassabilityQuery));

      // Assert: every direction is asked with the picture, then layers 4 down to 1.
      expect(stacks)
        .toStrictEqual([ [ 3, 0, 0, 2, 1 ], [ 3, 0, 0, 2, 1 ], [ 3, 0, 0, 2, 1 ], [ 3, 0, 0, 2, 1 ] ]);
    });

    it('lets a tile-image event block a step its ground allows', () =>
    {
      // Arrange: open ground, and a tile-image event whose tile blocks every way.
      const source = oneCell([ 1, 0, 0, 0 ], [ 0x10, 0, 0x0f ]);

      // Act.
      const passages = [ cellPassage(source, 0, 0, [ 2 ], [], () => ({}) as PassabilityQuery), cellPassage(source, 0, 0, [], [], () => ({}) as PassabilityQuery) ];

      // Assert.
      expect(passages.map(passage => passage.blocked))
        .toStrictEqual([ 15, 0 ]);
    });
  });

  describe('passabilityQuery', () =>
  {
    it('asks the rules about the map, its tileset, the cell, the direction and the tiles there', () =>
    {
      // Arrange.
      const document = MapDocument.fromJson('map:1', buildMapJson());
      const tileset = { id: 4, flags: [], mode: 1, name: 'Dungeon', note: '', tilesetNames: [] };

      // Act.
      const query = passabilityQuery(document, tileset)(2, 1, 8, [ 24, 18 ]);

      // Assert.
      expect(query)
        .toStrictEqual({ document, tileset, x: 2, y: 1, direction: 8, tiles: [ 24, 18 ] });
    });
  });
});

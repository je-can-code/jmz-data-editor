import { describe, expect, it } from 'vitest';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import type { BlueprintStepChange } from '../../../../src/mapEditor/core/blueprints/blueprintSteps.ts';
import type { BlueprintSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { changesNothing, copiesOf, planCopiesOnMap, type CopyGround } from '../../../../src/mapEditor/core/blueprints/copyPlans.ts';
import { blueprintCellChanges } from '../../../../src/mapEditor/core/blueprints/copyTiles.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp, StampTiles } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * A blueprint's change reaches every copy of it on a map, and nothing else there. Each placement of its tiles the record
 * holds is checked first, against the blueprint as it stood before the change, and only one still where the record says
 * has its cells follow, and only the cells it put down: a placement painted over, slid, or grown back over cells the edge
 * once cut off is never repainted beyond what it owns. Each copy of the changed events is planned field by field, and a
 * copy placed with its group knows its group's ids, since placing a blueprint rewired every command naming another of its
 * events to that one's copy: so a command list naming the copy's own group still reads as the blueprint's, and follows,
 * while a copy moved off where its placement put it is no longer known to the group and keeps its list. A copy drifted too
 * far, and a placement no longer where it was, are named with why. Another blueprint's copies, though they look the same,
 * are never touched.
 *
 * The blueprint is 2 by 2, carrying layer 1 alone (A5 tiles 1 to 4, which compare exactly), with event 1 (a guard whose
 * page moves event 2) at its corner and event 2 (a post) opposite. The change paints its top row anew (1 to 9, 2 to 8),
 * renames the guard a captain, raises its speed from 3 to 4, and adds a wait to its commands.
 */
describe('copyPlans', () =>
{
  const BLUEPRINT = 'k3x9q2mf';
  const OTHER = 'zz11zz11';
  const WIDTH = 12;
  const HEIGHT = 10;

  /**
   * One of the A5 sheet's tiles, which have no shapes.
   * @param {number} index Its place on the sheet.
   * @returns {number} The tile id.
   */
  const a5 = (index: number): number => TileId.A5 + index;

  /**
   * A command moving one event by a route, which names it by id.
   * @param {number} target The event.
   * @returns {RmmzEventCommand} The command.
   */
  const moveCommand = (target: number): RmmzEventCommand => ({
    code: 205,
    indent: 0,
    parameters: [ target, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: true } ],
  });

  /**
   * The guard's page: its speed, and its commands, which move an event and, after the change, wait too.
   * @param {number} speed Its speed.
   * @param {number} target The event its route moves.
   * @param {boolean} waits Whether it waits after.
   * @returns {RmmzEventPage} The page.
   */
  const guardPage = (speed: number, target: number, waits = false): RmmzEventPage => ({
    ...createEventPage(),
    moveSpeed: speed,
    list: [
      moveCommand(target),
      ...(waits ? [ { code: 230, indent: 0, parameters: [ 60 ] } ] : []),
      { code: 0, indent: 0, parameters: [] },
    ],
  });

  const GUARD: RmmzMapEvent = { ...createMapEvent(1, 0, 0), name: 'Guard', pages: [ guardPage(3, 2) ] };
  const POST: RmmzMapEvent = { ...createMapEvent(2, 1, 1), name: 'Post' };
  const CAPTAIN: RmmzMapEvent = { ...GUARD, name: 'Captain', pages: [ guardPage(4, 2, true) ] };
  const BEFORE_TILES: Pick<StampTiles, 'layers' | 'values'> = { layers: [ 0 ], values: [ a5(1), a5(2), a5(3), a5(4) ] };
  const AFTER_TILES: Pick<StampTiles, 'layers' | 'values'> = { layers: [ 0 ], values: [ a5(9), a5(8), a5(3), a5(4) ] };

  /**
   * The blueprint's stamp before the change.
   * @param {boolean} withTiles Whether it carries tiles, or events alone.
   * @returns {Stamp} The stamp.
   */
  const blueprintStamp = (withTiles = true): Stamp => stampOf({
    width: 2,
    height: 2,
    tiles: withTiles ? { ...BEFORE_TILES, calledFor: [ -1, -1, -1, -1 ] } : null,
    events: [ GUARD, POST ],
  });

  /**
   * The change: the top row repainted, and the guard made a captain.
   * @param {boolean} withTiles Whether the blueprint carries tiles.
   * @returns {BlueprintStepChange} The change.
   */
  const theChange = (withTiles = true): BlueprintStepChange => ({
    blueprintId: BLUEPRINT,
    before: { tiles: withTiles ? BEFORE_TILES : null, events: [ GUARD, POST ] },
    after: { tiles: withTiles ? AFTER_TILES : null, events: [ CAPTAIN, POST ] },
    cells: withTiles ? blueprintCellChanges(BEFORE_TILES, AFTER_TILES, { width: 2, height: 2 }) : [],
    events: [ { before: GUARD, after: CAPTAIN } ],
  });

  /**
   * A copy of one of a blueprint's events, as placing it leaves it: at its cell, its id fresh, linked by its note.
   * @param {RmmzMapEvent} source The blueprint's event.
   * @param {{ id: number, x: number, y: number, blueprintId?: string, target?: number }} where Its id and cell, the
   * blueprint it names (this one unless said), and the event its route moves, for a guard.
   * @returns {RmmzMapEvent} The copy.
   */
  const copyOf = (source: RmmzMapEvent, where: { id: number; x: number; y: number; blueprintId?: string; target?: number }): RmmzMapEvent =>
  {
    const link = { blueprintId: where.blueprintId ?? BLUEPRINT, eventId: source.id, differences: [] };
    const pages = where.target === undefined ? source.pages : [ guardPage(3, where.target) ];
    return { ...source, id: where.id, x: where.x, y: where.y, note: withBlueprintLink('', link), pages };
  };

  /**
   * Lays the blueprint's tiles down on a map's ground layer with their corner on a cell.
   * @param {Uint16Array} cells The map's cells.
   * @param {number} x The corner's column.
   * @param {number} y The corner's row.
   */
  const layDown = (cells: Uint16Array, x: number, y: number): void =>
  {
    BEFORE_TILES.values.forEach((value, index) =>
    {
      cells[cellIndex(WIDTH, HEIGHT, x + (index % 2), y + Math.floor(index / 2), 0)] = value;
    });
  };

  /**
   * Reads a map's ground cell.
   * @param {Uint16Array} cells The map's cells.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {number} The tile.
   */
  const groundAt = (cells: Uint16Array, x: number, y: number): number => cells[cellIndex(WIDTH, HEIGHT, x, y, 0)];

  /**
   * The map: placement A at (1, 1) with its guard (5) and post (6); placement B at (5, 1), its corner painted over by hand,
   * with its guard (7) and post (8); another blueprint's placement at (8, 1), the very same tiles, with its own guard (9);
   * a guard moved off placement A (10), still moving A's post; a guard of two pages (11); placement C at (8, 6), its corner
   * still the blueprint's but the rest painted over; and placement D at (10, 8), of which only the corner went down, though
   * the map holds the blueprint's tiles around it.
   * @returns {{ ground: CopyGround, spots: BlueprintSpot[] }} The map and the record's placements of the blueprint on it.
   */
  const theMap = (): { ground: CopyGround; spots: BlueprintSpot[] } =>
  {
    const cells = new Uint16Array(WIDTH * HEIGHT * 6);
    [ [ 1, 1 ], [ 5, 1 ], [ 8, 1 ], [ 10, 8 ] ].forEach(([ x, y ]) => layDown(cells, x, y));
    cells[cellIndex(WIDTH, HEIGHT, 5, 1, 0)] = a5(7);
    cells[cellIndex(WIDTH, HEIGHT, 8, 6, 0)] = a5(1);
    [ [ 9, 6 ], [ 8, 7 ], [ 9, 7 ] ].forEach(([ x, y ]) =>
    {
      cells[cellIndex(WIDTH, HEIGHT, x, y, 0)] = a5(20);
    });

    const events: (RmmzMapEvent | null)[] = new Array(12).fill(null);
    events[5] = copyOf(GUARD, { id: 5, x: 1, y: 1, target: 6 });
    events[6] = copyOf(POST, { id: 6, x: 2, y: 2 });
    events[7] = copyOf(GUARD, { id: 7, x: 5, y: 1, target: 8 });
    events[8] = copyOf(POST, { id: 8, x: 6, y: 2 });
    events[9] = copyOf(GUARD, { id: 9, x: 8, y: 1, blueprintId: OTHER, target: 2 });
    events[10] = copyOf(GUARD, { id: 10, x: 1, y: 5, target: 6 });
    events[11] = { ...copyOf(GUARD, { id: 11, x: 3, y: 7, target: 2 }), pages: [ guardPage(3, 2), guardPage(3, 2) ] };

    const spots: BlueprintSpot[] = [
      { blueprintId: BLUEPRINT, x: 1, y: 1 },
      { blueprintId: BLUEPRINT, x: 5, y: 1 },
      { blueprintId: BLUEPRINT, x: 8, y: 6 },
      { blueprintId: BLUEPRINT, x: 10, y: 8, placed: { x: 0, y: 0, width: 1, height: 1 } },
    ];
    return { ground: { width: WIDTH, height: HEIGHT, cells, tilesetId: 4, events }, spots };
  };

  /**
   * Plans the change on the map.
   * @param {Partial<Parameters<typeof planCopiesOnMap>[0]>} fields Anything to plan with otherwise.
   * @returns {ReturnType<typeof planCopiesOnMap>} The plan.
   */
  const planOn = (fields: Partial<Parameters<typeof planCopiesOnMap>[0]> = {}) =>
  {
    const { ground, spots } = theMap();
    return planCopiesOnMap({ change: theChange(), stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [], ...fields });
  };

  /**
   * Applies a plan's cells to a copy of the map's, to read what the map would hold.
   * @param {CopyGround} ground The map.
   * @param {ReturnType<typeof planCopiesOnMap>} plan The plan.
   * @returns {Uint16Array} The cells as the plan leaves them.
   */
  const cellsAfter = (ground: CopyGround, plan: ReturnType<typeof planCopiesOnMap>): Uint16Array =>
  {
    const cells = Uint16Array.from(ground.cells);
    plan.tiles.forEach(([ index, value ]) =>
    {
      cells[index] = value;
    });
    return cells;
  };

  describe('planCopiesOnMap', () =>
  {
    it('repaints the cells each placement still in place put down, and leaves a cell painted over by hand', () =>
    {
      // Arrange.
      const { ground, spots } = theMap();

      // Act.
      const plan = planCopiesOnMap({ change: theChange(), stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [] });
      const cells = cellsAfter(ground, plan);

      // Assert: A follows in both cells, B keeps its painted corner and follows beside it.
      expect([ groundAt(cells, 1, 1), groundAt(cells, 2, 1), groundAt(cells, 5, 1), groundAt(cells, 6, 1), groundAt(cells, 1, 2) ])
        .toStrictEqual([ a5(9), a5(8), a5(7), a5(8), a5(3) ]);
    });

    it('never repaints another blueprint\'s placement of the very same tiles, nor cells a placement\'s edge cut off', () =>
    {
      // Arrange.
      const { ground, spots } = theMap();

      // Act.
      const cells = cellsAfter(ground, planCopiesOnMap({ change: theChange(), stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [] }));

      // Assert: D's corner went down and follows; the cell beside it never went down, and stays.
      expect([ groundAt(cells, 8, 1), groundAt(cells, 9, 1), groundAt(cells, 10, 8), groundAt(cells, 11, 8) ])
        .toStrictEqual([ a5(1), a5(2), a5(9), a5(2) ]);
    });

    it('leaves a placement no longer where it was as it is, even a cell still holding the blueprint\'s tile, and says why', () =>
    {
      // Arrange.
      const { ground, spots } = theMap();

      // Act.
      const plan = planCopiesOnMap({ change: theChange(), stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [] });

      // Assert.
      expect([ groundAt(cellsAfter(ground, plan), 8, 6), plan.lost ])
        .toStrictEqual([
          a5(1),
          [ { spot: { blueprintId: BLUEPRINT, x: 8, y: 6 }, reason: 'only 1 of the 4 tiles there still matches the blueprint' } ],
        ]);
    });

    it('writes each changed cell once, and nothing for a cell that already holds what it follows to', () =>
    {
      // Arrange: placement A's corner already repainted to the new tile.
      const { ground, spots } = theMap();
      ground.cells[cellIndex(WIDTH, HEIGHT, 1, 1, 0)] = a5(9);

      // Act.
      const plan = planCopiesOnMap({ change: theChange(), stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [] });

      // Assert.
      expect(plan.tiles.map(([ index ]) => index))
        .toStrictEqual([
          cellIndex(WIDTH, HEIGHT, 2, 1, 0),
          cellIndex(WIDTH, HEIGHT, 6, 1, 0),
          cellIndex(WIDTH, HEIGHT, 10, 8, 0),
        ]);
    });

    it('changes every copy of the changed event, field by field, and no copy of an event the change left alone', () =>
    {
      // Arrange.
      const plan = planOn();

      // Act.
      const changed = plan.events.map(event => [ event.id, event.name, event.pages[0].moveSpeed ]);

      // Assert: the posts, 6 and 8, are untouched, and so is the other blueprint's guard, 9.
      expect(changed)
        .toStrictEqual([ [ 5, 'Captain', 4 ], [ 7, 'Captain', 4 ], [ 10, 'Captain', 4 ] ]);
    });

    it('lets a copy placed with its group follow a command list naming its group, and a copy moved off it keep its own', () =>
    {
      // Arrange.
      const plan = planOn();

      // Act.
      const lists = plan.events.map(event => [ event.id, event.pages[0].list.map(command => command.code), event.pages[0].list[0].parameters[0] ]);

      // Assert: 5 and 7 now wait, still moving their own posts; 10, moved, keeps the list it had.
      expect(lists)
        .toStrictEqual([ [ 5, [ 205, 230, 0 ], 6 ], [ 7, [ 205, 230, 0 ], 8 ], [ 10, [ 205, 0 ], 6 ] ]);
    });

    it('names a copy drifted too far to follow, with why, and changes nothing of it', () =>
    {
      // Arrange.
      const plan = planOn();

      // Act.
      const { drifted, events } = plan;

      // Assert.
      expect([ drifted, events.some(event => event.id === 11) ])
        .toStrictEqual([ [ { eventId: 11, reason: 'it has 2 pages and its blueprint had 1 page' } ], false ]);
    });

    it('plans no tiles and knows no group for a blueprint of events alone, whatever placements are given', () =>
    {
      // Arrange: stray placements given all the same.
      const { ground, spots } = theMap();

      // Act.
      const plan = planCopiesOnMap({ change: theChange(false), stamp: blueprintStamp(false), ground, spots, mode: TilesetMode.area, tags: [] });

      // Assert: with no group known, every guard keeps the list it had.
      expect([ plan.tiles, plan.lost, plan.events.map(event => [ event.id, event.pages[0].list.length ]) ])
        .toStrictEqual([ [], [], [ [ 5, 2 ], [ 7, 2 ], [ 10, 2 ] ] ]);
    });

    it('plans nothing at all for a change that moved no cell and no event', () =>
    {
      // Arrange.
      const { ground, spots } = theMap();
      const still: BlueprintStepChange = { ...theChange(), cells: [], events: [] };

      // Act.
      const plan = planCopiesOnMap({ change: still, stamp: blueprintStamp(), ground, spots, mode: TilesetMode.area, tags: [] });

      // Assert.
      expect([ changesNothing(plan), plan.lost, plan.drifted ])
        .toStrictEqual([ true, [], [] ]);
    });

    it('reads a plan that writes only an event as changing something', () =>
    {
      // Arrange.
      const plan = { ...planOn(), tiles: [] };

      // Act.
      const nothing = changesNothing(plan);

      // Assert.
      expect(nothing)
        .toBe(false);
    });
  });

  describe('copiesOf', () =>
  {
    it('finds the copies of one blueprint\'s events by their links, skipping empty notes and other blueprints', () =>
    {
      // Arrange: an event with an empty note, and one with a note but no link, beside the map's copies.
      const { ground } = theMap();
      const events = [ ...ground.events, { ...createMapEvent(12, 0, 9), note: 'just a note' }, createMapEvent(13, 1, 9) ];

      // Act.
      const found = copiesOf(events, BLUEPRINT).map(copy => [ copy.event.id, copy.link.eventId ]);

      // Assert.
      expect(found)
        .toStrictEqual([ [ 5, 1 ], [ 6, 2 ], [ 7, 1 ], [ 8, 2 ], [ 10, 1 ], [ 11, 1 ] ]);
    });
  });
});

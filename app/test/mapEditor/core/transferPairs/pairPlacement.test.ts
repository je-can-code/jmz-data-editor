import { describe, expect, it } from 'vitest';
import { createEvent } from '../../../../src/mapEditor/core/events/eventEdits.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapId, mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { placeTransfers, type PlacementOutcome } from '../../../../src/mapEditor/core/transferPairs/pairPlacement.ts';
import { NO_PICKS, pairPlanOf, type PairMap, type PairPicks, type PairPlan } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import {
  INSIDE,
  OUTSIDE,
  PAIR_LOOKS,
  pairDisk,
  pairMapFile,
  pairMapOf,
  pairWindow,
  type PairWindow,
} from '../../support/pairFixtures.ts';

/*
 * Placing a transfer is one step that puts every end on its map or none. So it owes the author this:
 *
 * - each end stands on its map at the first id free both on the map and in its file, and the step belongs to the history
 *   of every map it changes, the map it leaves from first, so it undoes and redoes as one from either;
 * - the other map is changed in place when this window holds it, brought in first when another window holds it, and
 *   otherwise read from its file and written through, never opened;
 * - a held map with unsaved edits records what its file takes apart from them, so the step reaches the file without them;
 * - nothing is placed, and the author hears why, when an end would run off its map or stand on another event's tile, when
 *   the player could not land where an end sends them (judged with every new end standing, a door on its own way in's
 *   landing included), when the map it leaves from is not open, when the other map has no file or cannot be read, on a
 *   blueprint opened as a map, or when one of the window's checks refuses the step;
 * - a one-way transfer stands on its own map alone, its landing judged on a map only looked at.
 *
 * The fixtures' outside map is 12 by 10 and the inside map 10 by 8, each walled along its top row.
 */
describe('placeTransfers', () =>
{
  /**
   * Builds picks from the empty ones.
   * @param {Partial<PairPicks>} picks The picks made.
   * @returns {PairPicks} The picks.
   */
  const picked = (picks: Partial<PairPicks>): PairPicks => ({ ...NO_PICKS, ...picks });

  /**
   * Plans picks from the outside map to another, as the disk holds them.
   * @param {PairWindow} window The window.
   * @param {Partial<PairPicks>} picks The picks made.
   * @param {number} far The map it leads to.
   * @returns {PairPlan} The plan.
   */
  const planOn = (window: PairWindow, picks: Partial<PairPicks>, far = INSIDE): PairPlan =>
  {
    return pairPlanOf(picked(picks), pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, far), PAIR_LOOKS) as PairPlan;
  };

  /**
   * The door pair the tests place: a door on 5, 3 outside, and its way out on 4, 7 inside.
   */
  const DOOR_PAIR: Partial<PairPicks> = { kind: 'door', ways: 'both', door: { x: 5, y: 3 }, exit: { x: 4, y: 7 } };

  /**
   * Reads why nothing was placed.
   * @param {PlacementOutcome} outcome The outcome.
   * @returns {string | null} Why, or null when something was.
   */
  const refusalOf = (outcome: PlacementOutcome): string | null => (outcome.ok ? null : outcome.message);

  it('places a door pair on two held maps as one step in both histories, each end at its map\'s first free id', async () =>
  {
    // Arrange: both maps held, the inside one holding an event already.
    const disk = pairDisk();
    disk.set(INSIDE, pairMapFile(10, 8, [], [ { ...createMapEvent(1, 1, 1), name: 'Bed' } ]));
    const window = pairWindow({ disk, held: [ OUTSIDE, INSIDE ] });

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert.
    const { hub } = window;
    const step = outcome.ok ? outcome.step : null;
    expect([ outcome.ok && outcome.placed, step?.label, step?.histories, step?.through, hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name, hub.map(mapDocumentKey(INSIDE)).event(2)?.name ])
      .toStrictEqual([
        [ { mapId: OUTSIDE, eventId: 1 }, { mapId: INSIDE, eventId: 2 } ],
        'Place door pair',
        [ mapHistoryKey(OUTSIDE), mapHistoryKey(INSIDE) ],
        undefined,
        'Transfer (Entrance)',
        'Transfer (Northeast Section)',
      ]);
  });

  it('writes the other end through to its file when nobody has its map open, never opening it', async () =>
  {
    // Arrange: only the outside map held.
    const window = pairWindow();

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert: the step carries the inside map's end as a splice past the end of its file's events.
    const step = outcome.ok ? outcome.step : null;
    const inside = step?.entries.filter(entry => entry.document === mapDocumentKey(INSIDE)).map(entry => entry.patch);
    expect([ step?.through, step?.histories, window.hub.has(mapDocumentKey(INSIDE)), inside?.map(patch => [ patch.kind, patch.kind === 'splice' && patch.index ]) ])
      .toStrictEqual([ [ mapDocumentKey(INSIDE) ], [ mapHistoryKey(OUTSIDE), mapHistoryKey(INSIDE) ], false, [ [ 'splice', 1 ] ] ]);
  });

  it('brings the other map in from the window holding it, so its end is placed in place there', async () =>
  {
    // Arrange: the inside map held by another window.
    const window = pairWindow({ heldElsewhere: [ INSIDE ] });

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert.
    const step = outcome.ok ? outcome.step : null;
    expect([ window.brought, window.hub.has(mapDocumentKey(INSIDE)), step?.through, window.hub.map(mapDocumentKey(INSIDE)).event(1)?.x ])
      .toStrictEqual([ [ mapDocumentKey(INSIDE) ], true, undefined, 4 ]);
  });

  it('records what a held map\'s file takes apart from its unsaved edits, at an id free on the map and in its file', async () =>
  {
    // Arrange: the outside map holding an unsaved event 1, which its file lacks.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    createEvent(window.hub, OUTSIDE, { x: 2, y: 2 });

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert: the door is event 2 on the map and in its file, the file's slot 1 left empty; the clean inside map has none.
    const step = outcome.ok ? outcome.step : null;
    const own = step?.entries.find(entry => entry.document === mapDocumentKey(OUTSIDE))?.patch;
    const version = step?.fileVersions?.map(each => [ each.document, each.patches.map(patch => (patch.kind === 'splice' ? [ patch.index, patch.inserted.map(item => (item === null ? null : (item as { id: number }).id)) ] : null)) ]);
    expect([ own?.kind === 'splice' && [ own.index, own.inserted.length ], version ])
      .toStrictEqual([ [ 2, 1 ], [ [ mapDocumentKey(OUTSIDE), [ [ 1, [ null, 2 ] ] ] ] ] ]);
  });

  it('refuses a landing the player cannot stand on, saying why, and places nothing', async () =>
  {
    // Arrange: the way out right under the inside map's top wall, so the way in lands on the wall.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const before = window.hub.committedContent(mapDocumentKey(INSIDE));

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, { ...DOOR_PAIR, exit: { x: 4, y: 1 } }));

    // Assert.
    expect([ refusalOf(outcome), window.hub.history(mapHistoryKey(OUTSIDE)).rows.length, window.hub.committedContent(mapDocumentKey(INSIDE)) ])
      .toStrictEqual([ 'The player can\'t land on 4, 0 in Entrance. The tiles there let no one through.', 0, before ]);
  });

  it('judges each landing with the new ends standing, so a door on the landing of its own way in refuses', async () =>
  {
    // Arrange: a door pair within the outside map, its way out just below the door.
    const window = pairWindow();
    const picks = { kind: 'door' as const, ways: 'both' as const, door: { x: 5, y: 3 }, exit: { x: 5, y: 4 } };

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, picks, OUTSIDE));

    // Assert: the door is the event that would stand in the way.
    expect(refusalOf(outcome))
      .toBe('The player can\'t land on 5, 3 in Northeast Section. Transfer (Northeast Section) (event 1) stands there, and the player cannot share its tile.');
  });

  it('places a pair within one map, each end at the next free id, in that map\'s history alone', async () =>
  {
    // Arrange: a door and a way out a few tiles apart on the outside map.
    const window = pairWindow();
    const picks = { kind: 'door' as const, ways: 'both' as const, door: { x: 2, y: 3 }, exit: { x: 8, y: 9 } };

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, picks, OUTSIDE));

    // Assert.
    const step = outcome.ok ? outcome.step : null;
    expect([ outcome.ok && outcome.placed, step?.histories ])
      .toStrictEqual([ [ { mapId: OUTSIDE, eventId: 1 }, { mapId: OUTSIDE, eventId: 2 } ], [ mapHistoryKey(OUTSIDE) ] ]);
  });

  it('refuses an end on another event\'s tile, and a strip over one, naming the event', async () =>
  {
    // Arrange: a barrel on the door's tile, and a lamp on the bottom edge.
    const disk = pairDisk();
    const outside = disk.get(OUTSIDE) as RmmzMap;
    disk.set(OUTSIDE, { ...outside, events: [ null, { ...createMapEvent(1, 5, 3), name: 'Barrel' }, { ...createMapEvent(2, 4, 9), name: '' } ] });
    const window = pairWindow({ disk });

    // Act.
    const onBarrel = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));
    const overLamp = await placeTransfers(window.sources, planOn(window, { kind: 'edge', ways: 'both', strip: { edge: 'bottom', start: 3, length: 3 } }));

    // Assert.
    expect([ refusalOf(onBarrel), refusalOf(overLamp) ])
      .toStrictEqual([ 'Barrel (event 1) already stands on 5, 3 in Northeast Section.', 'An event (event 2) already stands on 4, 9 in Northeast Section.' ]);
  });

  it('refuses a strip running off the map it is planned for', async () =>
  {
    // Arrange: a strip planned for a map wider than the outside map really is.
    const window = pairWindow();
    const wide: PairMap = { ...pairMapOf(window.disk, OUTSIDE), size: { width: 20, height: 10 } };
    const plan = pairPlanOf(picked({ kind: 'edge', ways: 'one', strip: { edge: 'bottom', start: 10, length: 4 }, landing: { x: 3, y: 3 } }), wide, pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;

    // Act.
    const outcome = await placeTransfers(window.sources, plan);

    // Assert.
    expect(refusalOf(outcome))
      .toBe('That runs off Northeast Section, which is 12 by 10 tiles.');
  });

  it('refuses ends on a blueprint opened as a map, whose events are fixed', async () =>
  {
    // Arrange: a plan leaving from a blueprint.
    const window = pairWindow();
    const blueprint: PairMap = { mapId: blueprintMapId('k3x9q2mf'), name: 'Camp', size: { width: 4, height: 4 } };
    const plan = pairPlanOf(picked(DOOR_PAIR), blueprint, pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;

    // Act.
    const outcome = await placeTransfers(window.sources, plan);

    // Assert.
    expect(refusalOf(outcome))
      .toBe('Events can\'t be added to a blueprint: a new one would have to appear on every map it is used on.');
  });

  it('refuses when the map it leaves from is not open here', async () =>
  {
    // Arrange: a window holding nothing.
    const window = pairWindow({ held: [] });

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert.
    expect(refusalOf(outcome))
      .toBe('Northeast Section isn\'t open here.');
  });

  it('refuses when the other map has no file, cannot be read, or there is no server to read it from', async () =>
  {
    // Arrange: the inside map's file gone, a server failing to read it, and no server at all.
    const gone = pairWindow();
    const plan = planOn(gone, DOOR_PAIR);
    gone.disk.delete(INSIDE);
    const failing = pairWindow();
    const offline = pairWindow();

    // Act.
    const outcomes = [
      await placeTransfers(gone.sources, plan),
      await placeTransfers({ ...failing.sources, readMap: async () => Promise.reject(new Error('boom')) }, plan),
      await placeTransfers({ ...offline.sources, readMap: null }, plan),
    ];

    // Assert.
    expect(outcomes.map(refusalOf))
      .toStrictEqual([
        'Entrance has no file, so nothing can be placed on it.',
        'Entrance could not be read: Error: boom',
        'Entrance isn\'t open, and there is no project server to read it from.',
      ]);
  });

  it('places a one-way door alone in its map\'s history, judging its landing on a map only looked at', async () =>
  {
    // Arrange: a one-way door landing inside, and one landing on the inside map's wall.
    const window = pairWindow();
    const picks = { kind: 'door' as const, ways: 'one' as const, door: { x: 5, y: 3 } };

    // Act.
    const walled = await placeTransfers(window.sources, planOn(window, { ...picks, landing: { x: 4, y: 0 } }));
    const placed = await placeTransfers(window.sources, planOn(window, { ...picks, landing: { x: 4, y: 6 } }));

    // Assert.
    const step = placed.ok ? placed.step : null;
    expect([ refusalOf(walled), step?.histories, step?.entries.map(entry => entry.document), window.hub.has(mapDocumentKey(INSIDE)) ])
      .toStrictEqual([ 'The player can\'t land on 4, 0 in Entrance. The tiles there let no one through.', [ mapHistoryKey(OUTSIDE) ], [ mapDocumentKey(OUTSIDE) ], false ]);
  });

  it('undoes and redoes both ends as one step from either map', async () =>
  {
    // Arrange: a pair placed on two held maps.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    await placeTransfers(window.sources, planOn(window, DOOR_PAIR));
    const { hub } = window;
    const events = () => [ hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name ?? null, hub.map(mapDocumentKey(INSIDE)).event(1)?.name ?? null ];

    // Act.
    hub.undo(mapHistoryKey(INSIDE));
    const undone = events();
    hub.redo(mapHistoryKey(OUTSIDE));

    // Assert.
    expect([ undone, events() ])
      .toStrictEqual([ [ null, null ], [ 'Transfer (Entrance)', 'Transfer (Northeast Section)' ] ]);
  });

  it('says why one of the window\'s checks refused the step, placing nothing', async () =>
  {
    // Arrange: a check refusing every edit.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    window.hub.addCommitCheck(() => 'Not today.');

    // Act.
    const outcome = await placeTransfers(window.sources, planOn(window, DOOR_PAIR));

    // Assert.
    expect([ refusalOf(outcome), window.hub.map(mapDocumentKey(OUTSIDE)).event(1) ])
      .toStrictEqual([ 'Not today.', null ]);
  });
});

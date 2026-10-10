import { describe, expect, it } from 'vitest';
import { FIELD_GONE } from '../../../../src/mapEditor/core/blueprints/copyActions.ts';
import {
  followCopy,
  followCopyField,
  pinCopyField,
  unlinkCopy,
  unpinCopyField,
  type CopyTarget,
} from '../../../../src/mapEditor/core/blueprints/copyEdits.ts';
import { copyGroupOf } from '../../../../src/mapEditor/core/blueprints/copyPlans.ts';
import { readCopy, type CopyContext } from '../../../../src/mapEditor/core/blueprints/copyReading.ts';
import { BLUEPRINT_USES_DOCUMENT, spotsOnMap } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { EVENT_GONE_MESSAGE } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { cloneJson } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { contextOf, copyOf, fieldOf, later, needler, needlerNest } from '../../support/copyFixtures.ts';
import { hubWithMaps, mapWithEvents } from '../../support/eventFixtures.ts';
import { a5, BLUEPRINT, eventOf, groundOf, propagationWindow } from '../../support/propagationFixtures.ts';

/*
 * Every action of a copy's panel is one step on the copy's map, in the history it is asked to go in (the event's own from
 * its window, the map's from the map's quick panel), named for what it did, saved with the map like any other edit, and
 * undone byte for byte: the map after the undo is the very map before the action, and a redo makes the action again. Each
 * reads the copy live from the window's map and plans against the blueprint as it stands; a copy gone from the map, a
 * field no longer standing as the panel showed it, or a copy with nothing left to follow, is refused, changing nothing; and
 * an action that would leave the copy as it is records nothing.
 *
 * And the way back the panel exists for: a blueprint change, the same field changed by hand on a copy, the blueprint
 * change undone (which leaves that copy as it is) and the hand change undone, leaves the copy behind, at the value of a
 * blueprint change that no longer is; reading it shows that, and following the blueprint again brings it back.
 *
 * Unlinking a copy placed with tiles touches its map alone: the record of placements keeps the placement, whose tiles go
 * on following the blueprint, and the copies placed with it go on following too, while the event, plain now, follows
 * nothing.
 */
describe('copy edits', () =>
{
  /**
   * Builds a window holding map 1, with a copy of the needler as its event 12 and a plain event 11 beside it.
   * @param {RmmzMapEvent} copy The copy, as event 12.
   * @returns {DocumentHub} The window's documents.
   */
  const windowWith = (copy: RmmzMapEvent): DocumentHub =>
  {
    const file = mapWithEvents(16, 12, [ null, ...Array.from({ length: 10 }, () => null), [ 3, 3 ], [ 7, 9 ] ]);
    file.events[12] = copy;
    return hubWithMaps({ 1: file });
  };

  /**
   * Writes the window's map as its file's text.
   * @param {DocumentHub} hub The window's documents.
   * @returns {string} The text.
   */
  const mapText = (hub: DocumentHub): string => JSON.stringify(hub.document(mapDocumentKey(1)).toJson());

  /**
   * Reads the copy as the window's map holds it now, as a copy of its own, which a later undo does not move.
   * @param {DocumentHub} hub The window's documents.
   * @returns {RmmzMapEvent} The copy.
   */
  const copyIn = (hub: DocumentHub): RmmzMapEvent => cloneJson(hub.map(mapDocumentKey(1)).event(12) as RmmzMapEvent);

  /**
   * The copy's own window: its steps go in the event's own history.
   */
  const IN_WINDOW: CopyTarget = { mapId: 1, eventId: 12, history: eventHistoryKey(1, 12) };

  /**
   * Builds a copy of the needler with its sight line reading the sight given.
   * @param {number} sight The sight.
   * @param {readonly string[]} differences The values its link keeps.
   * @returns {RmmzMapEvent} The copy.
   */
  const sighted = (sight: number, differences: readonly string[] = []): RmmzMapEvent =>
  {
    const source = needler();
    source.pages[0].list[1] = later(`<sight:${sight}>`);
    return copyOf(source, differences);
  };

  it('pins a number as one step in the history asked for, named for the field and its page, undone byte for byte', () =>
  {
    // Arrange: a sight two longer than the blueprint's.
    const hub = windowWith(sighted(6, [ 'p1.sight+2' ]));
    const before = mapText(hub);

    // Act.
    const outcome = pinCopyField(hub, IN_WINDOW, contextOf(needlerNest()), 'p1.sight');
    const pinned = copyIn(hub).note;
    hub.undo(IN_WINDOW.history);

    // Assert: the event's own history holds the step, and the map's none.
    expect([ outcome.ok && outcome.step?.label, pinned, mapText(hub) === before, hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([ 'Pin sight (page 1)', '<blueprint:[k3x9q2mf, 2, p1.sight=6]>', true, 0 ]);
  });

  it('unpins a number as one step, which a redo makes again after an undo', () =>
  {
    // Arrange: a speed pinned at 5, in the map's history, as the map's quick panel would.
    const copy = copyOf(needler({ moveSpeed: 5 }), [ 'p1.speed=5' ]);
    const hub = windowWith(copy);
    const before = mapText(hub);
    const onMap: CopyTarget = { ...IN_WINDOW, history: mapHistoryKey(1) };

    // Act.
    const outcome = unpinCopyField(hub, onMap, contextOf(needlerNest()), 'p1.speed');
    const unpinned = mapText(hub);
    hub.undo(onMap.history);
    const undone = mapText(hub);
    hub.redo(onMap.history);

    // Assert.
    expect([ outcome.ok && outcome.step?.label, copyIn(hub).note, undone === before, mapText(hub) === unpinned ])
      .toStrictEqual([ 'Unpin speed (page 1)', '<blueprint:[k3x9q2mf, 2, p1.speed+2]>', true, true ]);
  });

  it('has one field follow the blueprint as one step, undone byte for byte', () =>
  {
    // Arrange: a sight two longer, and a name set by hand.
    const hub = windowWith({ ...sighted(6, [ 'p1.sight+2' ]), name: 'Needler (west)' });
    const before = mapText(hub);

    // Act.
    const outcomes = [ followCopyField(hub, IN_WINDOW, contextOf(needlerNest()), 'p1.sight'), followCopyField(hub, IN_WINDOW, contextOf(needlerNest()), 'name') ];
    const followed = copyIn(hub);
    hub.undo(IN_WINDOW.history);
    hub.undo(IN_WINDOW.history);

    // Assert.
    expect([
      outcomes.map(outcome => outcome.ok && outcome.step?.label),
      [ followed.name, followed.note, followed.pages[0].list[1].parameters ],
      mapText(hub) === before,
    ])
      .toStrictEqual([
        [ 'Follow the blueprint\'s sight (page 1)', 'Follow the blueprint\'s name' ],
        [ 'Needler', '<blueprint:[k3x9q2mf, 2]>', [ '<sight:4>' ] ],
        true,
      ]);
  });

  it('has the whole copy follow the blueprint again as one step named for the blueprint, undone byte for byte', () =>
  {
    // Arrange: a speed pinned, a trigger set by hand, and the plain event beside it.
    const hub = windowWith(copyOf(needler({ moveSpeed: 5, trigger: 2 }), [ 'p1.speed=5' ]));
    const before = mapText(hub);
    const neighbour = JSON.stringify(hub.map(mapDocumentKey(1)).event(11));

    // Act.
    const outcome = followCopy(hub, IN_WINDOW, contextOf(needlerNest()));
    const followed = readCopy(copyIn(hub), contextOf(needlerNest()));
    const untouched = JSON.stringify(hub.map(mapDocumentKey(1)).event(11)) === neighbour;
    hub.undo(IN_WINDOW.history);

    // Assert.
    expect([ outcome.ok && outcome.step?.label, followed.kind === 'read' && followed.fields.every(field => field.state.kind === 'follows'), untouched, mapText(hub) === before ])
      .toStrictEqual([ 'Follow "Needler nest" again', true, true, true ]);
  });

  it('unlinks a copy as one step named for its blueprint, its note\'s own text left, undone byte for byte', () =>
  {
    // Arrange: a copy noting "Guards the gate".
    const hub = windowWith(copyOf({ ...needler(), note: 'Guards the gate' }, [ 'p1.speed+1' ]));
    const before = mapText(hub);

    // Act.
    const outcome = unlinkCopy(hub, IN_WINDOW, contextOf(needlerNest()));
    const unlinked = copyIn(hub);
    hub.undo(IN_WINDOW.history);

    // Assert: the event is plain now, and reads as plain.
    expect([ outcome.ok && outcome.step?.label, unlinked.note, readCopy(unlinked, contextOf(needlerNest())).kind, mapText(hub) === before ])
      .toStrictEqual([ 'Unlink from "Needler nest"', 'Guards the gate', 'plain', true ]);
  });

  it('names an unlink from a blueprint that is gone for the blueprint it was', () =>
  {
    // Arrange.
    const hub = windowWith(copyOf(needler()));

    // Act.
    const outcome = unlinkCopy(hub, IN_WINDOW, contextOf(null));

    // Assert.
    expect([ outcome.ok && outcome.step?.label, copyIn(hub).note ])
      .toStrictEqual([ 'Unlink from its blueprint', '' ]);
  });

  it('refuses a copy gone from the map, a field no longer standing as shown, and a copy with nothing left to follow', () =>
  {
    // Arrange: the copy's speed at an offset rather than pinned, and the blueprint gone for the last.
    const hub = windowWith(copyOf(needler({ moveSpeed: 4 }), [ 'p1.speed+1' ]));
    const before = mapText(hub);

    // Act.
    const outcomes = [
      pinCopyField(hub, { ...IN_WINDOW, eventId: 13 }, contextOf(needlerNest()), 'p1.speed'),
      unpinCopyField(hub, IN_WINDOW, contextOf(needlerNest()), 'p1.speed'),
      followCopyField(hub, IN_WINDOW, contextOf(null), 'p1.speed'),
      followCopy(hub, IN_WINDOW, contextOf(null)),
    ];

    // Assert.
    expect([ outcomes, mapText(hub) === before ])
      .toStrictEqual([
        [
          { ok: false, message: EVENT_GONE_MESSAGE },
          { ok: false, message: FIELD_GONE },
          { ok: false, message: FIELD_GONE },
          { ok: false, message: 'It can\'t follow: its blueprint is gone.' },
        ],
        true,
      ]);
  });

  it('refuses to have a plain event follow, and records nothing for a field that already follows, or a plain event unlinked', () =>
  {
    // Arrange: event 11 is plain; the copy follows in everything.
    const hub = windowWith(copyOf(needler()));
    const plain: CopyTarget = { ...IN_WINDOW, eventId: 11, history: eventHistoryKey(1, 11) };

    // Act.
    const outcomes = [
      followCopy(hub, plain, contextOf(needlerNest())),
      followCopyField(hub, IN_WINDOW, contextOf(needlerNest()), 'p1.trigger'),
      unlinkCopy(hub, plain, contextOf(needlerNest())),
    ];

    // Assert.
    expect([ outcomes, hub.history(IN_WINDOW.history).rows.length, hub.history(plain.history).rows.length ])
      .toStrictEqual([ [ { ok: false, message: FIELD_GONE }, { ok: true, step: null }, { ok: true, step: null } ], 0, 0 ]);
  });

  it('refuses a copy on a map the window does not hold', () =>
  {
    // Arrange: the window holds map 1 alone.
    const hub = windowWith(copyOf(needler({ moveSpeed: 4 })));

    // Act.
    const outcome = pinCopyField(hub, { mapId: 2, eventId: 12, history: eventHistoryKey(2, 12) }, contextOf(needlerNest()), 'p1.speed');

    // Assert.
    expect(outcome)
      .toStrictEqual({ ok: false, message: EVENT_GONE_MESSAGE });
  });

  /**
   * Reads what a copy of the camp on map 1 is read against in a propagation window: the blueprints and the record of
   * placements it holds, the copy's group found by them.
   * @param {DocumentHub} hub The window's documents.
   * @param {RmmzMapEvent} copy The copy.
   * @returns {CopyContext} The context.
   */
  const campContext = (hub: DocumentHub, copy: RmmzMapEvent): CopyContext =>
  {
    const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT);
    const spots = spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), 1);
    const references = blueprint === null ? undefined : copyGroupOf(hub.map(mapDocumentKey(1)).events, copy, blueprint.stamp, spots);
    return {
      blueprint: blueprintId => blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId),
      tags: [],
      ...(references === undefined ? {} : { references }),
    };
  };

  describe('a copy left behind by undo', () =>
  {
    it('reads a speed left behind at a change undone as an offset, and follows the blueprint again to its value', async () =>
    {
      // Arrange: the guard sped up to 4 in the blueprint, map 1's guard then sped up to 6 by hand in its own window, the
      // blueprint's change undone (map 1's guard keeps its 6), then the hand's change undone, leaving it at 4.
      const window = await propagationWindow();
      const guard = eventHistoryKey(1, 5);
      window.hub.edit('Speed up', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4));
      window.hub.edit('Change movement (page 1)', [ guard ], tx => tx.set('map:1', [ 'events', 5, 'pages', 0, 'moveSpeed' ], 6));
      window.hub.undo(blueprintHistoryKey(BLUEPRINT));
      window.hub.undo(guard);
      const behind = cloneJson(eventOf(window.hub.map('map:1'), 5));
      const before = JSON.stringify(window.hub.document('map:1').toJson());

      // Act.
      const reading = readCopy(behind, campContext(window.hub, behind));
      const outcome = followCopy(window.hub, { mapId: 1, eventId: 5, history: guard }, campContext(window.hub, behind));
      const after = cloneJson(eventOf(window.hub.map('map:1'), 5));
      const read = readCopy(after, campContext(window.hub, after));
      window.hub.undo(guard);

      // Assert: left at 4 while the blueprint holds 3; following again brings it to 3, following in everything; and the
      // undo leaves it behind again, byte for byte.
      expect([
        behind.pages[0].moveSpeed,
        fieldOf(reading, 'p1.speed').state,
        outcome.ok,
        after.pages[0].moveSpeed,
        after.note,
        read.kind === 'read' && read.fields.every(field => field.state.kind === 'follows'),
        JSON.stringify(window.hub.document('map:1').toJson()) === before,
      ])
        .toStrictEqual([ 4, { kind: 'offset', amount: 1 }, true, 3, '<blueprint:[k3x9q2mf, 1]>', true, true ]);
    });

    it('reads a name left behind at a change undone as set by hand, and follows the blueprint again to its name', async () =>
    {
      // Arrange: the guard renamed "Captain" in the blueprint, map 1's guard renamed "Sentry" by hand, the blueprint's
      // change undone, then the hand's, leaving it "Captain" while the blueprint is "Guard" again.
      const window = await propagationWindow();
      const guard = eventHistoryKey(1, 5);
      window.hub.edit('Rename', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain'));
      window.hub.edit('Rename event', [ guard ], tx => tx.set('map:1', [ 'events', 5, 'name' ], 'Sentry'));
      window.hub.undo(blueprintHistoryKey(BLUEPRINT));
      window.hub.undo(guard);
      const behind = cloneJson(eventOf(window.hub.map('map:1'), 5));

      // Act.
      const reading = readCopy(behind, campContext(window.hub, behind));
      followCopyField(window.hub, { mapId: 1, eventId: 5, history: guard }, campContext(window.hub, behind), 'name');

      // Assert: the post beside it, never touched, still follows.
      expect([ behind.name, fieldOf(reading, 'name').state, eventOf(window.hub.map('map:1'), 5).name, eventOf(window.hub.map('map:1'), 6).name ])
        .toStrictEqual([ 'Captain', { kind: 'own' }, 'Guard', 'Post' ]);
    });
  });

  describe('unlinking a copy placed with tiles', () =>
  {
    it('unlinks the copy on its map alone, its placement left in the record, its tiles and its post following on', async () =>
    {
      // Arrange: map 1's guard and post were placed together with the camp's tiles at (1, 1).
      const window = await propagationWindow();
      const record = JSON.stringify(window.hub.document(BLUEPRINT_USES_DOCUMENT).toJson());
      const guard = cloneJson(eventOf(window.hub.map('map:1'), 5));

      // Act: the guard unlinked; then the camp's corner repainted, and its guard sped up and its post renamed.
      const outcome = unlinkCopy(window.hub, { mapId: 1, eventId: 5, history: eventHistoryKey(1, 5) }, campContext(window.hub, guard));
      const touched = outcome.ok ? [ ...new Set(outcome.step?.entries.map(entry => entry.document)) ] : [];
      window.hub.edit('Change', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
      {
        tx.tiles(window.blueprintKey, [ [ cellIndex(2, 2, 0, 0, 0), a5(9) ] ]);
        tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4);
        tx.set(window.blueprintKey, [ 'events', 2, 'name' ], 'Watchtower');
      });

      // Assert: the plain guard stays at 3 while map 2's guard follows to 4; map 1's tiles and post follow.
      const map1 = window.hub.map('map:1');
      expect([
        touched,
        JSON.stringify(window.hub.document(BLUEPRINT_USES_DOCUMENT).toJson()) === record,
        groundOf(map1, 1, 1),
        eventOf(map1, 5).pages[0].moveSpeed,
        eventOf(map1, 6).name,
        eventOf(window.hub.map('map:2'), 5).pages[0].moveSpeed,
      ])
        .toStrictEqual([ [ 'map:1' ], true, a5(9), 3, 'Watchtower', 4 ]);
    });
  });
});

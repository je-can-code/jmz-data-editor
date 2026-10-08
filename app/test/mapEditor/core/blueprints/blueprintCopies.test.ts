import { describe, expect, it, vi } from 'vitest';
import {
  BlueprintCopyCounter,
  copiesInNotes,
  copiesOnMap,
  copyCountWords,
  tallyCopies,
  type BlueprintCopy,
  type BlueprintCopyCounts,
  type EventNote,
} from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { hubWithMaps, mapWithEvents } from '../../support/eventFixtures.ts';

/*
 * The maps' notes are the only record of which events are copies of a blueprint, so every count is worked out from them
 * and kept nowhere of its own. A copy is one event linked to one of a blueprint's events; a blueprint's count is how
 * many there are in all and how many on each map, by map id.
 *
 * The counter counts every map the window holds from its live document, unsaved placements and undos included, afresh
 * whenever its document moves, and every other map from the server's reading of every map's notes on disk, read again
 * whenever a map's file changes and whenever the change stream comes back; a map the window lets go of is counted from
 * the disk again. It reads nothing until something listens, reads one reading at a time however many asks pile up while
 * one waits, and tells its listeners only when the count says something new. Until the server's first answer the copies
 * are still being counted, and a window with no server, or a reading that failed, has them uncounted until a later
 * reading succeeds: neither is ever taken for a blueprint having no copies. Nor is a count while a reading asked for
 * after a map's file changed is on its way: no blueprint's count is handed out, for a delete to trust, until the last
 * reading asked for lands, though the cards keep showing the count they had.
 *
 * The window holds map 1, where event 1 is a copy of blueprint aa, and map 2, with no copies. On disk, map 1 still has
 * the two copies it had before this window's unsaved edits, and map 5, which the window does not hold, has a copy of aa
 * and one of bb.
 */
describe('blueprintCopies', () =>
{
  /**
   * Builds a map file whose events carry the notes given, event 1 first, each at its own column.
   * @param {readonly string[]} notes The notes.
   * @returns {RmmzMap} The file.
   */
  const mapWithNotes = (notes: readonly string[]): RmmzMap =>
  {
    const file = mapWithEvents(8, 2, [ null, ...notes.map((_, index): [ number, number ] => [ index, 0 ]) ]);
    notes.forEach((note, index) =>
    {
      (file.events[index + 1] as RmmzMapEvent).note = note;
    });

    return file;
  };

  /**
   * What the server reads on disk.
   */
  const DISK: readonly EventNote[] = [
    { mapId: 1, eventId: 1, note: '<blueprint:[aa, 3]>' },
    { mapId: 1, eventId: 2, note: '<blueprint:[aa, 3]>' },
    { mapId: 5, eventId: 4, note: 'Guard\n<blueprint:[aa, 3]>' },
    { mapId: 5, eventId: 6, note: '<blueprint:[bb, 1]>' },
    { mapId: 5, eventId: 7, note: 'just words' },
  ];

  /**
   * Builds the window, and a counter over it reading the disk through a stand-in.
   * @param {(() => Promise<readonly EventNote[]>) | null} readNotes What reading the disk does; the disk above by default.
   * @returns {object} The window's documents, the counter and the stand-in.
   */
  const setUp = (readNotes: (() => Promise<readonly EventNote[]>) | null = async () => DISK) =>
  {
    const hub = hubWithMaps({ 1: mapWithNotes([ '<blueprint:[aa, 3]>', 'event 2' ]), 2: mapWithNotes([ 'event 1' ]) });
    const read = readNotes === null ? null : vi.fn(readNotes);
    const counter = new BlueprintCopyCounter({ hub, readNotes: read });
    return { hub, counter, read };
  };

  /**
   * Reads a count's tallies as plain values.
   * @param {BlueprintCopyCounts} counts The count.
   * @returns {object} The state, and each blueprint's count by id.
   */
  const plain = (counts: BlueprintCopyCounts) => ({ state: counts.state, byBlueprint: Object.fromEntries(counts.byBlueprint) });

  /**
   * Places a copy of blueprint aa's event 3 on map 2, as event 2, as one step.
   * @param {ReturnType<typeof setUp>['hub']} hub The window's documents.
   */
  const placeCopy = (hub: ReturnType<typeof setUp>['hub']) =>
  {
    const map = hub.map('map:2');
    const copy = { ...createMapEvent(2, 3, 1), note: '<blueprint:[aa, 3]>' };
    hub.edit('Place blueprint "Goblin"', [ mapHistoryKey(2) ], tx => tx.apply('map:2', map.placeEventPatch(copy)));
  };

  describe('copiesOnMap', () =>
  {
    it('finds every event whose note links it to a blueprint, in id order, passing over empty slots and every other note', () =>
    {
      // Arrange: an empty note, a copy, an empty slot, a copy after words, another tag, and a broken link.
      const file = mapWithNotes([ '', '<blueprint:[aa, 3]>', 'x', 'Guard\n<blueprint:[bb, 1]>', '<moveSpeed:6.0>', '<blueprint:[aa]>' ]);
      file.events[3] = null;

      // Act.
      const copies = copiesOnMap(5, file.events);

      // Assert.
      expect(copies)
        .toStrictEqual([
          { mapId: 5, eventId: 2, blueprintId: 'aa', blueprintEventId: 3 },
          { mapId: 5, eventId: 4, blueprintId: 'bb', blueprintEventId: 1 },
        ]);
    });
  });

  describe('copiesInNotes', () =>
  {
    it('finds every copy among the notes the server read, by the map each stands on', () =>
    {
      // Arrange: the disk's notes.

      // Act.
      const copies = copiesInNotes(DISK);

      // Assert: map 5's words are no copy.
      expect(Object.fromEntries(copies))
        .toStrictEqual({
          1: [ { mapId: 1, eventId: 1, blueprintId: 'aa', blueprintEventId: 3 }, { mapId: 1, eventId: 2, blueprintId: 'aa', blueprintEventId: 3 } ],
          5: [ { mapId: 5, eventId: 4, blueprintId: 'aa', blueprintEventId: 3 }, { mapId: 5, eventId: 6, blueprintId: 'bb', blueprintEventId: 1 } ],
        });
    });
  });

  describe('tallyCopies', () =>
  {
    it('counts copies by blueprint, in all and map by map, by map id', () =>
    {
      // Arrange: aa on map 7 once and map 3 twice, out of order; bb on map 3 once.
      const copy = (mapId: number, eventId: number, blueprintId: string): BlueprintCopy => ({ mapId, eventId, blueprintId, blueprintEventId: 1 });
      const copies = [ copy(7, 1, 'aa'), copy(3, 1, 'aa'), copy(3, 2, 'bb'), copy(3, 4, 'aa') ];

      // Act.
      const tally = tallyCopies(copies);

      // Assert.
      expect(Object.fromEntries(tally))
        .toStrictEqual({
          aa: { total: 3, maps: [ { mapId: 3, copies: 2 }, { mapId: 7, copies: 1 } ] },
          bb: { total: 1, maps: [ { mapId: 3, copies: 1 } ] },
        });
    });
  });

  describe('copyCountWords', () =>
  {
    it('words a count once counted: none, one, and several on one map or more', () =>
    {
      // Arrange.
      const counts: BlueprintCopyCounts = {
        state: 'counted',
        byBlueprint: new Map([
          [ 'one', { total: 1, maps: [ { mapId: 3, copies: 1 } ] } ],
          [ 'three', { total: 3, maps: [ { mapId: 3, copies: 3 } ] } ],
          [ 'five', { total: 5, maps: [ { mapId: 3, copies: 2 }, { mapId: 4, copies: 3 } ] } ],
        ]),
      };

      // Act.
      const words = [ 'none', 'one', 'three', 'five' ].map(id => copyCountWords(counts, id));

      // Assert.
      expect(words)
        .toStrictEqual([ 'No copies yet', '1 copy', '3 copies on 1 map', '5 copies on 2 maps' ]);
    });

    it('says the copies are still being counted, or cannot be, whatever the count would say', () =>
    {
      // Arrange: a count holding a copy of the blueprint asked about.
      const byBlueprint = new Map([ [ 'one', { total: 1, maps: [ { mapId: 3, copies: 1 } ] } ] ]);

      // Act.
      const words = [ copyCountWords({ state: 'counting', byBlueprint }, 'one'), copyCountWords({ state: 'unavailable', byBlueprint }, 'one') ];

      // Assert.
      expect(words)
        .toStrictEqual([ 'Counting copies', 'Copies can\'t be counted' ]);
    });
  });

  describe('BlueprintCopyCounter', () =>
  {
    /**
     * Reads the disk above at once the first time, and every later time answers only when the test hands over what the
     * disk holds by then, as a reading still on its way to the server does.
     * @returns {{ readNotes: () => Promise<readonly EventNote[]>, answers: ((notes: readonly EventNote[]) => void)[] }}
     * The reading, and the answer each later reading waits on, in the order they were asked.
     */
    const answeredLater = () =>
    {
      const answers: ((notes: readonly EventNote[]) => void)[] = [];
      let readings = 0;
      const readNotes = (): Promise<readonly EventNote[]> =>
      {
        readings += 1;
        return readings === 1
          ? Promise.resolve(DISK)
          : new Promise(resolve =>
          {
            answers.push(resolve);
          });
      };

      return { readNotes, answers };
    };

    it('reads nothing until something listens, and is still counting until the server answers', async () =>
    {
      // Arrange.
      const { counter, read } = setUp();
      const before = [ counter.getSnapshot().state, read?.mock.calls.length ];

      // Act.
      counter.subscribe(() => undefined);
      const waiting = counter.getSnapshot().state;
      await counter.settled();

      // Assert.
      expect([ before, waiting, counter.getSnapshot().state, read?.mock.calls.length ])
        .toStrictEqual([ [ 'counting', 0 ], 'counting', 'counted', 1 ]);
    });

    it('starts once however many listen, reading the disk once, and tells each listener', async () =>
    {
      // Arrange.
      const { counter, read } = setUp();
      const heard = [ vi.fn(), vi.fn() ];

      // Act.
      heard.forEach(listener => counter.subscribe(listener));
      await counter.settled();

      // Assert: the first heard the held maps counted as it started, and both heard the disk's answer.
      expect([ read?.mock.calls.length, heard.map(listener => listener.mock.calls.length) ])
        .toStrictEqual([ 1, [ 2, 1 ] ]);
    });

    it('stops telling a listener that left', async () =>
    {
      // Arrange: the listener hears the held maps counted as it starts the counting.
      const { counter } = setUp();
      const heard = vi.fn();
      const leave = counter.subscribe(heard);
      const atStart = heard.mock.calls.length;

      // Act.
      leave();
      await counter.settled();

      // Assert: the disk's answer arrived, and the listener gone was not told.
      expect([ atStart, counter.getSnapshot().state, heard.mock.calls.length ])
        .toStrictEqual([ 1, 'counted', 1 ]);
    });

    it('counts every map the window holds as it stands there, and every other map as the disk holds it', async () =>
    {
      // Arrange.
      const { counter } = setUp();

      // Act.
      counter.subscribe(() => undefined);
      await counter.settled();

      // Assert: map 1's one live copy, not the disk's two, and map 5's from the disk.
      expect(plain(counter.getSnapshot()))
        .toStrictEqual({
          state: 'counted',
          byBlueprint: {
            aa: { total: 2, maps: [ { mapId: 1, copies: 1 }, { mapId: 5, copies: 1 } ] },
            bb: { total: 1, maps: [ { mapId: 5, copies: 1 } ] },
          },
        });
    });

    it('follows a copy placed on a held map, and its undo, at once', async () =>
    {
      // Arrange.
      const { hub, counter } = setUp();
      const heard = vi.fn();
      counter.subscribe(heard);
      await counter.settled();
      heard.mockClear();

      // Act.
      placeCopy(hub);
      const placed = counter.countOf('aa');
      hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ placed, counter.countOf('aa'), heard.mock.calls.length ])
        .toStrictEqual([
          { total: 3, maps: [ { mapId: 1, copies: 1 }, { mapId: 2, copies: 1 }, { mapId: 5, copies: 1 } ] },
          { total: 2, maps: [ { mapId: 1, copies: 1 }, { mapId: 5, copies: 1 } ] },
          2,
        ]);
    });

    it('counts a map the window lets go of as the disk holds it again', async () =>
    {
      // Arrange.
      const { hub, counter } = setUp();
      counter.subscribe(() => undefined);
      await counter.settled();

      // Act.
      hub.release('map:1');

      // Assert.
      expect(counter.countOf('aa'))
        .toStrictEqual({ total: 3, maps: [ { mapId: 1, copies: 2 }, { mapId: 5, copies: 1 } ] });
    });

    it('tells its listeners only when the count says something new', async () =>
    {
      // Arrange.
      const { hub, counter } = setUp();
      const heard = vi.fn();
      counter.subscribe(heard);
      await counter.settled();
      heard.mockClear();

      // Act: a tile painted on map 2 moves its document but changes no copy.
      hub.edit('Paint tiles', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ 0, 1536 ] ]));

      // Assert.
      expect([ hub.map('map:2').revision > 0, heard.mock.calls.length ])
        .toStrictEqual([ true, 0 ]);
    });

    it('reads the disk again when a map\'s file changes, and for no other file', async () =>
    {
      // Arrange: map 5 loses its copy of bb on disk.
      const notes = [ DISK, DISK.filter(note => note.eventId !== 6) ];
      let reading = 0;
      const { counter, read } = setUp(async () =>
      {
        reading += 1;
        return notes[Math.min(reading, notes.length) - 1];
      });
      counter.subscribe(() => undefined);
      await counter.settled();

      // Act.
      counter.fileChanged('data/System.json');
      counter.fileChanged('jmz-editor/blueprints.json');
      await counter.settled();
      const calls = read?.mock.calls.length;
      counter.fileChanged('data/Map005.json');
      await counter.settled();

      // Assert.
      expect([ calls, read?.mock.calls.length, counter.countOf('bb') ])
        .toStrictEqual([ 1, 2, { total: 0, maps: [] } ]);
    });

    it('hands out no blueprint\'s count while a reading asked for after a map\'s file changed is on its way, and the new count once it lands', async () =>
    {
      // Arrange: after the first reading, map 5's copy of bb is taken out on disk, as a save in another window would; the
      // second reading answers only when told.
      const { readNotes, answers } = answeredLater();
      const { counter } = setUp(readNotes);
      counter.subscribe(() => undefined);
      await counter.settled();
      counter.fileChanged('data/System.json');
      const untouched = counter.countOf('bb');

      // Act.
      counter.fileChanged('data/Map005.json');
      const asked = counter.countOf('bb');
      await vi.waitFor(() => expect(answers)
        .toHaveLength(1));
      const onItsWay = counter.countOf('bb');
      answers[0](DISK.filter(note => note.eventId !== 6));
      await counter.settled();

      // Assert: the cards kept the old count meanwhile.
      expect([ untouched, asked, onItsWay, counter.countOf('bb'), counter.getSnapshot().state ])
        .toStrictEqual([ { total: 1, maps: [ { mapId: 5, copies: 1 } ] }, null, null, { total: 0, maps: [] }, 'counted' ]);
    });

    it('hands out no count until the last reading asked for lands, when a map changes again while one is on its way', async () =>
    {
      // Arrange: two readings after the first, each answering only when told.
      const { readNotes, answers } = answeredLater();
      const { counter } = setUp(readNotes);
      counter.subscribe(() => undefined);
      await counter.settled();
      counter.fileChanged('data/Map005.json');
      await vi.waitFor(() => expect(answers)
        .toHaveLength(1));

      // Act: map 5 changes again while the second reading is on its way, which lands still holding bb's copy.
      counter.fileChanged('data/Map005.json');
      answers[0](DISK);
      await vi.waitFor(() => expect(answers)
        .toHaveLength(2));
      const afterSecond = counter.countOf('bb');
      answers[1](DISK.filter(note => note.eventId !== 6));
      await counter.settled();

      // Assert.
      expect([ afterSecond, counter.countOf('bb') ])
        .toStrictEqual([ null, { total: 0, maps: [] } ]);
    });

    it('reads once for every ask that comes while a reading waits to begin', async () =>
    {
      // Arrange.
      const { counter, read } = setUp();
      counter.subscribe(() => undefined);

      // Act: three asks while the first reading waits, then two more once it is done.
      counter.readAgain();
      counter.fileChanged('data/Map001.json');
      counter.readAgain();
      await counter.settled();
      counter.readAgain();
      counter.readAgain();
      await counter.settled();

      // Assert.
      expect(read?.mock.calls.length)
        .toBe(2);
    });

    it('asks nothing of the disk before counting has started, however a file changes', async () =>
    {
      // Arrange.
      const { counter, read } = setUp();

      // Act.
      counter.fileChanged('data/Map005.json');
      counter.readAgain();
      await counter.settled();

      // Assert.
      expect([ read?.mock.calls.length, counter.getSnapshot().state ])
        .toStrictEqual([ 0, 'counting' ]);
    });

    it('has the copies uncounted while the disk cannot be read, and counts them once a later reading can', async () =>
    {
      // Arrange: the first reading fails.
      let reading = 0;
      const { counter } = setUp(async () =>
      {
        reading += 1;
        if (reading === 1)
        {
          throw new Error('the server is down');
        }

        return DISK;
      });
      counter.subscribe(() => undefined);
      await counter.settled();
      const failed = [ counter.getSnapshot().state, counter.countOf('aa') ];

      // Act.
      counter.readAgain();
      await counter.settled();

      // Assert.
      expect([ failed, counter.getSnapshot().state, counter.countOf('aa')?.total ])
        .toStrictEqual([ [ 'unavailable', null ], 'counted', 2 ]);
    });

    it('has the copies uncounted in a window with no server, rather than counting the maps it holds alone', async () =>
    {
      // Arrange.
      const { counter } = setUp(null);

      // Act.
      counter.subscribe(() => undefined);
      await counter.settled();

      // Assert.
      expect([ counter.getSnapshot().state, counter.countOf('aa') ])
        .toStrictEqual([ 'unavailable', null ]);
    });

    it('answers no copies for a blueprint none are linked to, once counted', async () =>
    {
      // Arrange.
      const { counter } = setUp();
      counter.subscribe(() => undefined);

      // Act.
      await counter.settled();

      // Assert.
      expect(counter.countOf('zz'))
        .toStrictEqual({ total: 0, maps: [] });
    });

    it('stops following the window\'s documents once stopped', async () =>
    {
      // Arrange.
      const { hub, counter } = setUp();
      counter.subscribe(() => undefined);
      await counter.settled();

      // Act.
      counter.stop();
      placeCopy(hub);

      // Assert.
      expect(counter.countOf('aa')?.total)
        .toBe(2);
    });

    it('counts a map opened after counting started as it stands', async () =>
    {
      // Arrange.
      const { hub, counter } = setUp();
      counter.subscribe(() => undefined);
      await counter.settled();

      // Act: map 5 opened, its copy of aa since taken out in this window's copy.
      hub.adopt('map:5', mapWithNotes([ 'a', 'b', 'c', 'Guard', 'e', '<blueprint:[bb, 1]>' ]) as unknown as JsonValue);

      // Assert.
      expect([ counter.countOf('aa'), counter.countOf('bb') ])
        .toStrictEqual([ { total: 1, maps: [ { mapId: 1, copies: 1 } ] }, { total: 1, maps: [ { mapId: 5, copies: 1 } ] } ]);
    });
  });
});

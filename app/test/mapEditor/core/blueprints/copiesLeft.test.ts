import { describe, expect, it } from 'vitest';
import { copiesLeftWords } from '../../../../src/mapEditor/core/blueprints/copiesLeft.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey, TREE_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import type { LeftPart } from '../../../../src/mapEditor/core/history/stepParts.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Patch } from '../../../../src/mapEditor/core/model/patches.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * When undoing or redoing a blueprint's change leaves copies changed since as they stand, the author is owed plain words
 * for it, or the undo reads as half broken: that it moved all the same, how many copies (and tiles) it left, each copy by
 * its name and id on its map as the project names it, and where the change in its way can be undone from, so the author
 * can take that back first and move the blueprint's change again. A change in a copy's own event window is undone there; a
 * change on the map, on the map; a file changed on disk, or outside the editor, can be undone nowhere here, and the words
 * say so. A copy is counted once however many of its fields were left, and past five things the rest are counted.
 *
 * Map 1 is held as Riverside Stroll, with a door (event 1) and a chest (event 3) and nothing in slot 2; map 4 is not held.
 */
describe('copiesLeftWords', () =>
{
  /**
   * The words, over a hub holding map 1 with its door renamed Bandit, and map names from a list.
   * @returns {ReturnType<typeof copiesLeftWords>} The words.
   */
  const buildWords = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    const map = buildMapJson();
    map.events[1] = { ...(map.events[1] as RmmzMapEvent), name: 'Bandit' };
    map.events[3] = { ...(map.events[3] as RmmzMapEvent), name: '  ' };
    hub.adopt('map:1', map as unknown as JsonValue);
    const names: Readonly<Record<number, string>> = { 1: 'Riverside Stroll', 4: 'Map 4' };
    return copiesLeftWords({ hub, mapName: mapId => names[mapId] });
  };

  /**
   * A step standing in a copy's way, recorded in the histories given.
   * @param {readonly string[]} histories The histories.
   * @param {string} id Its id.
   * @returns {HistoryStep} The step.
   */
  const edit = (histories: readonly string[], id = 'window-a#9'): HistoryStep => ({ id, label: 'Edit', histories, entries: [], origin: 'window-a', at: 0 });

  /**
   * A part left: a field of an event on a map.
   * @param {DocumentKey} document The map.
   * @param {number} eventId The event.
   * @param {HistoryStep | null} by The change in its way.
   * @param {string} field The field.
   * @returns {LeftPart} The part.
   */
  const copyPart = (document: DocumentKey, eventId: number, by: HistoryStep | null, field = 'name'): LeftPart => ({
    document,
    patch: { kind: 'set', path: [ 'events', eventId, field ], before: 'a', after: 'b' },
    by,
  });

  /**
   * A part left: cells of a map.
   * @param {number} count How many cells.
   * @param {HistoryStep | null} by The change in their way.
   * @returns {LeftPart} The part.
   */
  const tilesPart = (count: number, by: HistoryStep | null): LeftPart => ({
    document: 'map:1',
    patch: { kind: 'tiles', indices: Array.from({ length: count }, (_, index) => index), before: [], after: [] } as Patch,
    by,
  });

  /**
   * The step the words are about; they never read it.
   */
  const MOVED = edit([ blueprintHistoryKey('k3x9q2mf') ], 'window-a#1');

  it('names a copy changed in its own event window, by name and id on its map, and says to undo it there', () =>
  {
    // Arrange.
    const words = buildWords();

    // Act.
    const told = words(MOVED, [ copyPart('map:1', 1, edit([ eventHistoryKey(1, 1) ])) ], 'backward');

    // Assert.
    expect(told)
      .toBe('Undone, except on 1 copy changed since: Bandit (event 1) on Riverside Stroll, whose own change can be undone in its event window.');
  });

  it('says redone for a redo, and names the map for a change made on the map', () =>
  {
    // Arrange.
    const words = buildWords();

    // Act.
    const told = words(MOVED, [ copyPart('map:1', 1, edit([ mapHistoryKey(1) ])) ], 'forward');

    // Assert.
    expect(told)
      .toBe('Redone, except on 1 copy changed since: Bandit (event 1) on Riverside Stroll, whose own change can be undone on the map.');
  });

  it('counts a copy once however many of its fields were left, beside another copy and a map\'s tiles', () =>
  {
    // Arrange: the door twice, by the first change in its way; the chest, whose name is blank; three cells.
    const words = buildWords();
    const inWindow = edit([ eventHistoryKey(1, 1) ]);
    const onMap = edit([ mapHistoryKey(1) ]);

    // Act.
    const told = words(MOVED, [ copyPart('map:1', 1, inWindow), copyPart('map:1', 1, onMap, 'note'), copyPart('map:1', 3, onMap), tilesPart(2, onMap), tilesPart(1, onMap) ], 'backward');

    // Assert.
    expect(told)
      .toBe('Undone, except on 2 copies and 3 tiles changed since: Bandit (event 1) on Riverside Stroll, whose own change can be undone in its event window; event 3 on Riverside Stroll, whose own change can be undone on the map; 3 tiles on Riverside Stroll, whose painting can be undone on the map.');
  });

  it('says a copy on a map not held here, or gone from its map, by its id, and a file changed on disk or outside the editor', () =>
  {
    // Arrange.
    const words = buildWords();
    const outside = edit([ mapHistoryKey(1) ], 'outside:map:1:x>disk:1:1');

    // Act.
    const told = words(MOVED, [ copyPart('map:4', 7, null), copyPart('map:1', 2, outside) ], 'backward');

    // Assert.
    expect(told)
      .toBe('Undone, except on 2 copies changed since: event 7 on Map 4, changed on disk; event 2 on Riverside Stroll, changed outside the editor.');
  });

  it('says where a change in a blueprint, in the map tree, forgotten, or made anywhere else can be undone, or that it cannot', () =>
  {
    // Arrange.
    const words = buildWords();

    // Act.
    const told = [ [ blueprintHistoryKey('k3x9q2mf') ], [ TREE_HISTORY_KEY ], [], [ 'common-event:4' ] ]
      .map(histories => words(MOVED, [ copyPart('map:1', 1, edit(histories)) ], 'backward'));

    // Assert.
    expect(told.map(each => each.slice(each.indexOf('whose'))))
      .toStrictEqual([
        'whose own change can be undone in its blueprint.',
        'whose own change can be undone in the map tree.',
        'whose own change can no longer be undone.',
        'whose own change can be undone where it was made.',
      ]);
  });

  it('names five things and counts the rest', () =>
  {
    // Arrange.
    const words = buildWords();
    const parts = [ 11, 12, 13, 14, 15, 16, 17 ].map(eventId => copyPart('map:4', eventId, null));

    // Act.
    const told = words(MOVED, parts, 'backward');

    // Assert.
    expect(told)
      .toBe('Undone, except on 7 copies changed since: event 11 on Map 4, changed on disk; event 12 on Map 4, changed on disk; event 13 on Map 4, changed on disk; event 14 on Map 4, changed on disk; event 15 on Map 4, changed on disk; 2 more.');
  });

  it('counts a part of anything but a copy or a map\'s tiles as an other part, by its document', () =>
  {
    // Arrange: one of map 1's own settings, and the blueprints.
    const words = buildWords();
    const settings: LeftPart = { document: 'map:1', patch: { kind: 'set', path: [ 'note' ], before: '', after: 'x' }, by: null };
    const blueprints: LeftPart = { document: 'editor-data:blueprints', patch: { kind: 'set', path: [ 'data' ], before: 1, after: 2 }, by: null };

    // Act.
    const told = words(MOVED, [ settings, blueprints ], 'backward');

    // Assert.
    expect(told)
      .toBe('Undone, except on 2 other parts changed since: Map 1, changed since; Blueprints, changed since.');
  });
});

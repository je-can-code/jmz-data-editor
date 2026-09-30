import { describe, expect, it } from 'vitest';
import { patchInterference } from '../../../../src/mapEditor/core/history/patchInterference.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Patch, PatchPath } from '../../../../src/mapEditor/core/model/patches.ts';

/*
 * This relation is the whole test for undoing a step out of order: the step is taken back out from under every
 * later edit on its documents only when no later patch bears on any of its own, and patch addresses are never
 * rebased. So it owes two things at once. It must catch every later patch that changed the same data, moved where
 * the earlier patch's data sits (a resize moves every cell; adding or removing items in a list moves every item
 * after them), or would be moved by the earlier patch going; missing one lets an undo write to the wrong place,
 * which is the quiet kind of damage nobody notices until the game plays wrong. And it must let everything else
 * pass, or D8's promise (a blueprint change or a door pair undoes after unrelated edits) is broken.
 *
 * Every case therefore sits beside its near miss: a cell beside the painted one, an item just in front of or just
 * behind a run, a list edit that keeps the length beside one that changes it.
 */
describe('patchInterference', () =>
{
  /**
   * A set patch.
   * @param {PatchPath} path Where it writes.
   * @param {JsonValue | undefined} before What it replaced; undefined when the key or item was absent.
   * @param {JsonValue | undefined} after What it wrote; undefined when it removed the key or item.
   * @returns {Patch} The patch.
   */
  const set = (path: PatchPath, before: JsonValue | undefined, after: JsonValue | undefined): Patch =>
    ({ kind: 'set', path, before, after });

  /**
   * A splice patch that took out and put in plain placeholder items.
   * @param {PatchPath} path The list.
   * @param {number} index Where it starts.
   * @param {number} removed How many items it took out.
   * @param {number} inserted How many it put in their place.
   * @returns {Patch} The patch.
   */
  const splice = (path: PatchPath, index: number, removed: number, inserted: number): Patch =>
    ({ kind: 'splice', path, index, removed: new Array(removed).fill('old'), inserted: new Array(inserted).fill('new') });

  /**
   * A tiles patch over some cells.
   * @param {readonly number[]} indices The cells.
   * @returns {Patch} The patch.
   */
  const tiles = (...indices: readonly number[]): Patch =>
    ({ kind: 'tiles', indices, before: indices.map(() => 1), after: indices.map(() => 2) });

  /**
   * A resize from one tile to two tiles wide.
   * @returns {Patch} The patch.
   */
  const resize = (): Patch => ({
    kind: 'resize',
    before: { width: 1, height: 1, data: [ 1, 2, 3, 4, 5, 6 ] },
    after: { width: 2, height: 1, data: [ 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0 ] },
  });

  describe('tiles', () =>
  {
    it('relates two strokes only through a cell both painted', () =>
    {
      // Arrange: the second stroke shares cell 4 with the first; the third paints only the cells beside them.
      const first = tiles(3, 4);

      // Act.
      const relations = [ patchInterference(first, tiles(4, 9)), patchInterference(first, tiles(5, 2)) ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'overlap', null ]);
    });

    it('lets a resize bear on every tile patch: moving an earlier stroke, moved by an earlier resize, or overlapping one', () =>
    {
      // Arrange: a stroke and a resize, in each order, and two resizes.

      // Act.
      const relations = [
        patchInterference(tiles(0), resize()),
        patchInterference(resize(), tiles(0)),
        patchInterference(resize(), resize()),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'moved', 'would-move', 'overlap' ]);
    });

    it('never relates a tile patch to a set or splice, which cannot reach the tiles', () =>
    {
      // Arrange: grid patches against JSON patches, each side first.

      // Act.
      const relations = [
        patchInterference(tiles(0), set([ 'note' ], '', 'x')),
        patchInterference(set([ 'note' ], '', 'x'), resize()),
        patchInterference(splice([ 'events' ], 0, 0, 1), tiles(0)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ null, null, null ]);
    });
  });

  describe('values', () =>
  {
    it('relates two values only when one holds the other', () =>
    {
      // Arrange: a whole event against its name, both ways round, and names of one event and of two.

      // Act.
      const relations = [
        patchInterference(set([ 'events', 1 ], null, {}), set([ 'events', 1, 'name' ], 'a', 'b')),
        patchInterference(set([ 'events', 1, 'name' ], 'a', 'b'), set([ 'events', 1 ], {}, null)),
        patchInterference(set([ 'events', 1, 'name' ], 'a', 'b'), set([ 'events', 1, 'note' ], 'a', 'b')),
        patchInterference(set([ 'events', 1, 'name' ], 'a', 'b'), set([ 'events', 2, 'name' ], 'a', 'b')),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'overlap', 'overlap', null, null ]);
    });

    it('finds a value that holds a whole list overlapping any edit of its items, either way round', () =>
    {
      // Arrange: the pages list replaced whole, against a splice of it, then a splice of it against the event.
      const pages = [ 'events', 1, 'pages' ];

      // Act.
      const relations = [
        patchInterference(set(pages, [], []), splice(pages, 0, 1, 0)),
        patchInterference(splice(pages, 0, 0, 1), set([ 'events', 1 ], {}, null)),
        patchInterference(splice(pages, 0, 0, 1), set([ 'events', 2 ], {}, null)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'overlap', 'overlap', null ]);
    });
  });

  describe('runs of items', () =>
  {
    const pages = [ 'events', 1, 'pages' ];

    it('finds a later change inside the items an earlier splice put in', () =>
    {
      // Arrange: the splice put in the item at index 2; the near miss changes the item in front of it.
      const earlier = splice(pages, 2, 0, 1);

      // Act.
      const relations = [
        patchInterference(earlier, set([ ...pages, 2, 'trigger' ], 0, 3)),
        patchInterference(earlier, set([ ...pages, 1, 'trigger' ], 0, 3)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'overlap', null ]);
    });

    it('finds an earlier change moved by a later splice in front of it that changed the list\'s length', () =>
    {
      // Arrange: page 2 is changed; later the first page is removed, then (near misses) the third page is removed,
      // or the first page is replaced by another without changing the length.
      const earlier = set([ ...pages, 1, 'trigger' ], 0, 3);

      // Act.
      const relations = [
        patchInterference(earlier, splice(pages, 0, 1, 0)),
        patchInterference(earlier, splice(pages, 2, 1, 0)),
        patchInterference(earlier, splice(pages, 0, 1, 1)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'moved', null, null ]);
    });

    it('finds a later change that taking an earlier splice back out would move', () =>
    {
      // Arrange: a page put in at index 1, then page 3 changed; the near miss replaced page 1 without growing the list.
      const later = set([ ...pages, 3, 'trigger' ], 0, 3);

      // Act.
      const relations = [
        patchInterference(splice(pages, 1, 0, 1), later),
        patchInterference(splice(pages, 1, 1, 1), later),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'would-move', null ]);
    });

    it('relates two splices of one list by where they sit and whether the one in front changed the length', () =>
    {
      // Arrange: an event added at 5, then one added right behind it, and one added in front of it; items 2 and 3
      // put in, then item 3 taken out; and item 2 replaced, then an item added right behind it.

      // Act.
      const relations = [
        patchInterference(splice([ 'events' ], 5, 0, 1), splice([ 'events' ], 6, 0, 1)),
        patchInterference(splice([ 'events' ], 5, 0, 1), splice([ 'events' ], 2, 0, 1)),
        patchInterference(splice([ 'events' ], 2, 0, 2), splice([ 'events' ], 3, 1, 0)),
        patchInterference(splice([ 'events' ], 2, 1, 1), splice([ 'events' ], 3, 0, 1)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'would-move', 'moved', 'overlap', null ]);
    });

    it('finds a later splice cutting across the place an earlier one took items out of', () =>
    {
      // Arrange: items taken out at 3; later, items 2 to 4 are replaced around that place, or (near miss) only
      // item 1, in front of it, is.

      // Act.
      const relations = [
        patchInterference(splice([ 'events' ], 3, 2, 0), splice([ 'events' ], 2, 2, 2)),
        patchInterference(splice([ 'events' ], 3, 2, 0), splice([ 'events' ], 1, 1, 1)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'overlap', null ]);
    });

    it('treats a set that appends to a list or takes its last item as a splice at the end', () =>
    {
      // Arrange: event 5 appended, then event 6 appended behind it, or (near miss) the free slot 2 filled in
      // front of it; and the last event taken off, then event 1 renamed in front of it.
      const appended = set([ 'events', 5 ], undefined, { id: 5 });

      // Act.
      const relations = [
        patchInterference(appended, set([ 'events', 6 ], undefined, { id: 6 })),
        patchInterference(appended, set([ 'events', 2 ], null, { id: 2 })),
        patchInterference(set([ 'events', 4 ], { id: 4 }, undefined), set([ 'events', 1, 'name' ], 'a', 'b')),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'would-move', null, null ]);
    });

    it('reads an edit inside one item of an outer list as a change to that whole item', () =>
    {
      // Arrange: an event added at 5, against page edits of event 1 in front of it and of event 6 behind it; then
      // a page added to event 1, against event 0 taken out in front of it.

      // Act.
      const relations = [
        patchInterference(splice([ 'events' ], 5, 0, 1), splice(pages, 0, 1, 0)),
        patchInterference(splice([ 'events' ], 5, 0, 1), splice([ 'events', 6, 'pages' ], 0, 1, 0)),
        patchInterference(splice(pages, 0, 0, 1), splice([ 'events' ], 0, 1, 0)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ null, 'would-move', 'moved' ]);
    });

    it('works on a document that is itself a list, like the map tree', () =>
    {
      // Arrange: a row put in at 3, against a later rename of row 5 behind it and of row 1 in front of it.

      // Act.
      const relations = [
        patchInterference(splice([], 3, 0, 1), set([ 5, 'name' ], 'a', 'b')),
        patchInterference(splice([], 3, 0, 1), set([ 1, 'name' ], 'a', 'b')),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'would-move', null ]);
    });

    it('counts a list reached by a key as shared whole, since no position can be told apart', () =>
    {
      // Arrange: an item put in a list, then a key set beneath the list's path.

      // Act.
      const relation = patchInterference(splice([ 'data', 'blueprints' ], 0, 0, 1), set([ 'data', 'blueprints', 'x' ], 1, 2));

      // Assert.
      expect(relation)
        .toBe('overlap');
    });

    it('relates nothing whose paths part before either list', () =>
    {
      // Arrange: a page list against the map's title, and two lists side by side.

      // Act.
      const relations = [
        patchInterference(splice(pages, 0, 0, 1), set([ 'displayName' ], 'a', 'b')),
        patchInterference(splice([ 'encounterList' ], 0, 0, 1), splice([ 'events' ], 0, 0, 1)),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('either way round', () =>
  {
    it('finds two patches bearing on each other, or not, whichever one is taken as the earlier', () =>
    {
      // Arrange: pairs that bear on each other in every shape above, and pairs that do not, each read both ways
      // round. Only the kind of relation may change with the order; whether there is one must not.
      const pairs: [ Patch, Patch ][] = [
        [ tiles(3, 4), tiles(4, 9) ],
        [ tiles(0), resize() ],
        [ set([ 'events', 5 ], undefined, { id: 5 }), set([ 'events', 5, 'name' ], 'a', 'b') ],
        [ set([ 'events', 4 ], { id: 4 }, undefined), set([ 'events', 4, 'name' ], 'a', 'b') ],
        [ splice([ 'events' ], 3, 2, 0), splice([ 'events' ], 3, 0, 1) ],
        [ splice([ 'events' ], 2, 2, 2), splice([ 'events' ], 3, 0, 1) ],
        [ splice([ 'events' ], 5, 0, 1), splice([ 'events', 6, 'pages' ], 0, 1, 0) ],
        [ tiles(3, 4), tiles(5, 2) ],
        [ splice([ 'events' ], 2, 1, 1), splice([ 'events' ], 3, 0, 1) ],
        [ splice([ 'events' ], 2, 1, 1), splice([ 'events' ], 3, 1, 0) ],
        [ splice([ 'events' ], 5, 0, 1), splice([ 'events', 1, 'pages' ], 0, 1, 0) ],
        [ set([ 'events', 1, 'name' ], 'a', 'b'), set([ 'events', 1, 'note' ], 'a', 'b') ],
      ];

      // Act.
      const related = pairs.map(([ left, right ]) => [ patchInterference(left, right) !== null, patchInterference(right, left) !== null ]);

      // Assert.
      expect(related)
        .toStrictEqual([
          [ true, true ], [ true, true ], [ true, true ], [ true, true ], [ true, true ], [ true, true ], [ true, true ],
          [ false, false ], [ false, false ], [ false, false ], [ false, false ], [ false, false ],
        ]);
    });
  });
});

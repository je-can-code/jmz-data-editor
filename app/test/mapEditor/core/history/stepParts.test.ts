import { describe, expect, it } from 'vitest';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import {
  filePart,
  heldPart,
  leftPartsOf,
  movesWhole,
  movingStep,
  splitTiles,
  type EditOnDocument,
} from '../../../../src/mapEditor/core/history/stepParts.ts';
import type { Patch, SetPatch, TilesPatch } from '../../../../src/mapEditor/core/model/patches.ts';

/*
 * When an undo or a redo of a step following its change meets an edit in the way, it owes the author exactly this much
 * and no more: the part of each patch nothing stands in the way of moves, and the rest stays as it stands. Which is which
 * is decided by the one rule that refuses every other step (see patchInterference), so a part that moves always finds its
 * data where it left it; a tiles patch is decided cell by cell, since a cell painted over by hand is the one to keep, and a
 * resize gives every cell a new place, so none moves. A file nobody holds is asked what it would take, and without a way
 * to ask, everything moves for the write to check. The step that moves keeps the step's id and narrows only what it
 * reaches: its entries, and what each file differing from its document takes, which keeps whatever reaches the same data
 * as a part left. It still names every document it writes through, one it no longer changes included, since its histories
 * still live there and naming it is what lets the step move without that map open.
 */
describe('stepParts', () =>
{
  /**
   * A step standing in the way, with its patches on the document.
   * @param {readonly Patch[]} patches The patches.
   * @param {string} id Its id.
   * @returns {EditOnDocument} The edit.
   */
  const editOf = (patches: readonly Patch[], id: string): EditOnDocument => ({
    step: { id, label: id, histories: [], entries: [], origin: 'w', at: 0 },
    patches,
  });

  /**
   * A set of an event's name.
   * @param {number} eventId The event.
   * @returns {SetPatch} The patch.
   */
  const nameSet = (eventId: number): SetPatch => ({ kind: 'set', path: [ 'events', eventId, 'name' ], before: 'a', after: 'b' });

  /**
   * A tiles patch over cells, each going from its index to its index plus 100.
   * @param {readonly number[]} indices The cells.
   * @returns {TilesPatch} The patch.
   */
  const cells = (indices: readonly number[]): TilesPatch => ({ kind: 'tiles', indices, before: [ ...indices ], after: indices.map(index => index + 100) });

  describe('splitTiles', () =>
  {
    it('splits a patch\'s cells by what keeps them, each side null when it has none', () =>
    {
      // Arrange.
      const patch = cells([ 1, 2, 3 ]);

      // Act.
      const parts = [ splitTiles(patch, index => index !== 2), splitTiles(patch, () => true), splitTiles(patch, () => false) ];

      // Assert.
      expect(parts)
        .toStrictEqual([ [ cells([ 1, 3 ]), cells([ 2 ]) ], [ patch, null ], [ null, patch ] ]);
    });
  });

  describe('heldPart', () =>
  {
    it('moves a patch no edit in the way touches, and leaves one an edit changed, naming the newest such edit', () =>
    {
      // Arrange: the newest edit renames event 2, the next event 1, the oldest event 1 too.
      const edits = [ editOf([ nameSet(2) ], 'newest'), editOf([ nameSet(1) ], 'middle'), editOf([ nameSet(1) ], 'oldest') ];

      // Act.
      const parts = [ heldPart('map:1', nameSet(1), edits, 'backward'), heldPart('map:1', nameSet(3), edits, 'backward') ];

      // Assert.
      expect(parts.map(part => [ part.moving, part.left, part.by?.id ?? null ]))
        .toStrictEqual([ [ null, nameSet(1), 'middle' ], [ nameSet(3), null, null ] ]);
    });

    it('reads an edit as coming after the patch for an undo, and before it for a redo', () =>
    {
      // Arrange: an edit appending to a list the patch sets a value inside of, which moves it only when it came first.
      const inside: SetPatch = { kind: 'set', path: [ 'list', 0 ], before: 'a', after: 'b' };
      const append = editOf([ { kind: 'splice', path: [ 'list' ], index: 0, removed: [], inserted: [ 'x' ] } ], 'append');

      // Act.
      const parts = [ heldPart('map:1', inside, [ append ], 'backward'), heldPart('map:1', inside, [ append ], 'forward') ];

      // Assert: either way the splice moves what the set addresses.
      expect(parts.map(part => part.by?.id ?? null))
        .toStrictEqual([ 'append', 'append' ]);
    });

    it('moves the cells no stroke painted and leaves the rest, naming the newest stroke that painted any of those', () =>
    {
      // Arrange.
      const edits = [ editOf([ cells([ 9 ]) ], 'newest'), editOf([ nameSet(1), cells([ 2, 3 ]) ], 'older') ];

      // Act.
      const part = heldPart('map:1', cells([ 1, 2, 3 ]), edits, 'backward');

      // Assert.
      expect([ part.moving, part.left, part.by?.id ])
        .toStrictEqual([ cells([ 1 ]), cells([ 2, 3 ]), 'older' ]);
    });

    it('moves a tiles patch whole when no stroke touched it, and leaves it whole after a resize', () =>
    {
      // Arrange.
      const resize = editOf([ { kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 2, height: 1, data: [] } } ], 'resize');

      // Act.
      const parts = [ heldPart('map:1', cells([ 1 ]), [ editOf([ cells([ 2 ]) ], 'stroke') ], 'backward'), heldPart('map:1', cells([ 1 ]), [ resize ], 'backward') ];

      // Assert.
      expect(parts.map(part => [ part.moving, part.left, part.by?.id ?? null ]))
        .toStrictEqual([ [ cells([ 1 ]), null, null ], [ null, cells([ 1 ]), 'resize' ] ]);
    });
  });

  describe('filePart', () =>
  {
    it('moves everything when there is no way to tell what a file takes', () =>
    {
      // Arrange: nothing to ask.

      // Act.
      const part = filePart('map:3', nameSet(1), 'backward', null);

      // Assert.
      expect(part)
        .toStrictEqual(movesWhole('map:3', nameSet(1)));
    });

    it('asks the file about the patch turned the way it moves, and leaves what it would not take', () =>
    {
      // Arrange: a file taking nothing, and one taking whatever it is asked.
      const asked: Patch[] = [];
      const takesNothing = (_key: string, patch: Patch): Patch | null =>
      {
        asked.push(patch);
        return null;
      };

      // Act.
      const parts = [ filePart('map:3', nameSet(1), 'backward', takesNothing), filePart('map:3', nameSet(1), 'forward', (_key, patch) => patch) ];

      // Assert: an undo asks about the patch taken back out.
      expect([ asked, parts.map(part => [ part.moving, part.left, part.by ]) ])
        .toStrictEqual([
          [ { kind: 'set', path: [ 'events', 1, 'name' ], before: 'b', after: 'a' } ],
          [ [ null, nameSet(1), null ], [ nameSet(1), null, null ] ],
        ]);
    });

    it('moves the cells a file would take and leaves the rest', () =>
    {
      // Arrange: a file taking cell 2 alone.
      const fit = (_key: string, patch: Patch): Patch | null => (patch.kind === 'tiles' ? { ...patch, indices: [ 2 ] } : patch);

      // Act.
      const part = filePart('map:3', cells([ 1, 2, 3 ]), 'backward', fit);

      // Assert.
      expect([ part.moving, part.left, part.by ])
        .toStrictEqual([ cells([ 2 ]), cells([ 1, 3 ]), null ]);
    });
  });

  describe('movingStep and leftPartsOf', () =>
  {
    /**
     * A step changing the blueprints, map 1's door and cells, and map 3's door written through, with map 1's file taking
     * a version of its own.
     * @returns {HistoryStep} The step.
     */
    const stepWhole = (): HistoryStep => ({
      id: 'w#1',
      label: 'Change',
      histories: [ 'blueprint:k3x9q2mf', 'map:1' ],
      entries: [
        { document: 'editor-data:blueprints', patch: nameSet(9) },
        { document: 'map:1', patch: nameSet(1) },
        { document: 'map:1', patch: cells([ 1, 2 ]) },
        { document: 'map:3', patch: nameSet(1) },
      ],
      through: [ 'map:3' ],
      fileVersions: [
        {
          document: 'map:1',
          patches: [
            { kind: 'splice', path: [ 'events' ], index: 1, removed: [], inserted: [ null ] },
            nameSet(4),
            { kind: 'set', path: [ 'events', 1, 'pages' ], before: [], after: [ 1 ] },
            cells([ 2, 5 ]),
            { kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 1, height: 1, data: [] } },
          ],
        },
      ],
      followers: [ 'map:1', 'map:3' ],
      origin: 'w',
      at: 5,
    });

    it('narrows the step to what moves, keeping its id, every file version and every document written through, and lists what was left', () =>
    {
      // Arrange: map 1's door and cell 2 left, and map 3's door, which leaves nothing moving on map 3.
      const step = stepWhole();
      const by = editOf([], 'hand').step;
      const parts = [
        movesWhole('editor-data:blueprints', nameSet(9)),
        { document: 'map:1' as const, moving: null, left: nameSet(1), by },
        { document: 'map:1' as const, moving: cells([ 1 ]), left: cells([ 2 ]), by },
        { document: 'map:3' as const, moving: null, left: nameSet(1), by: null },
      ];

      // Act.
      const moving = movingStep(step, parts);
      const left = leftPartsOf(parts);

      // Assert: the file keeps the splice of the event list holding the door, and cell 2; it gives back event 4's name, the
      // door's pages, which the door's name never reaches, cell 5 and the resize. Map 3 is still named as written through.
      expect([ moving, left ])
        .toStrictEqual([
          {
            id: 'w#1',
            label: 'Change',
            histories: [ 'blueprint:k3x9q2mf', 'map:1' ],
            entries: [ { document: 'editor-data:blueprints', patch: nameSet(9) }, { document: 'map:1', patch: cells([ 1 ]) } ],
            through: [ 'map:3' ],
            fileVersions: [
              {
                document: 'map:1',
                patches: [
                  nameSet(4),
                  { kind: 'set', path: [ 'events', 1, 'pages' ], before: [], after: [ 1 ] },
                  cells([ 5 ]),
                  { kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 1, height: 1, data: [] } },
                ],
              },
            ],
            followers: [ 'map:1', 'map:3' ],
            origin: 'w',
            at: 5,
          },
          [ { document: 'map:1', patch: nameSet(1), by }, { document: 'map:1', patch: cells([ 2 ]), by }, { document: 'map:3', patch: nameSet(1), by: null } ],
        ]);
    });

    it('keeps a document written through that still moves, and leaves out every cell and resize of a file once a resize was left', () =>
    {
      // Arrange: a resize of map 1 left in place of its cells, and map 3's door moving.
      const step = stepWhole();
      const resize: Patch = { kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 2, height: 1, data: [] } };
      const parts = [
        movesWhole('editor-data:blueprints', nameSet(9)),
        movesWhole('map:1', nameSet(1)),
        { document: 'map:1' as const, moving: null, left: resize, by: null },
        movesWhole('map:3', nameSet(1)),
      ];

      // Act.
      const moving = movingStep(step, parts);

      // Assert.
      expect([ moving.through, moving.fileVersions?.[0].patches ])
        .toStrictEqual([
          [ 'map:3' ],
          [ { kind: 'splice', path: [ 'events' ], index: 1, removed: [], inserted: [ null ] }, nameSet(4), { kind: 'set', path: [ 'events', 1, 'pages' ], before: [], after: [ 1 ] } ],
        ]);
    });

    it('leaves a step with no file versions without any', () =>
    {
      // Arrange.
      const { fileVersions: _fileVersions, ...step } = stepWhole();

      // Act.
      const moving = movingStep(step, [ movesWhole('map:3', nameSet(1)) ]);

      // Assert.
      expect([ 'fileVersions' in moving, moving.entries.length ])
        .toStrictEqual([ false, 1 ]);
    });
  });
});

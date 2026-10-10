import { describe, expect, it } from 'vitest';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import {
  fileKeepsLeft,
  filePart,
  fileShareOf,
  heldPart,
  leftPartsOf,
  likeliestWayOf,
  movesWhole,
  movingStep,
  reachesLeft,
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
 * to ask, everything moves for the write to check.
 *
 * A document's file is judged apart from the document, since the edit in a part's way reaches the file only once it is
 * saved: of the patches the file took the step by, those reaching only what moves go whole, and those reaching a part
 * left go as far as the file still holds the step's side, so a file whose edit in the way is unsaved follows the step
 * while the document keeps that edit on top, and one holding the edit keeps it. Get that wrong and a discarded map, or a
 * crash, leaves a copy on disk parted from its blueprint. The step that moves keeps the step's id, its entries narrowed to
 * what moves, and carries each such file's share as that document's file version, unless it is just what moves there. It
 * still names every document it writes through, one it no longer changes included, since its histories still live there
 * and naming it is what lets the step move without that map open.
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

    it('narrows the step to what moves, keeping its id and every document written through, carrying each file\'s share, and lists what was left', () =>
    {
      // Arrange: map 1's door and cell 2 left, and map 3's door, which leaves nothing moving on map 3; map 1's file judged
      // to take its door back with the rest.
      const step = stepWhole();
      const by = editOf([], 'hand').step;
      const parts = [
        movesWhole('editor-data:blueprints', nameSet(9)),
        { document: 'map:1' as const, moving: null, left: nameSet(1), by },
        { document: 'map:1' as const, moving: cells([ 1 ]), left: cells([ 2 ]), by },
        { document: 'map:3' as const, moving: null, left: nameSet(1), by: null },
      ];
      const share = [ nameSet(1), nameSet(4), cells([ 5 ]) ];

      // Act.
      const moving = movingStep(step, parts, new Map([ [ 'map:1' as const, share ] ]));
      const left = leftPartsOf(parts);

      // Assert: map 1's file version is its share, in its place; map 3 is still named as written through.
      expect([ moving, left ])
        .toStrictEqual([
          {
            id: 'w#1',
            label: 'Change',
            histories: [ 'blueprint:k3x9q2mf', 'map:1' ],
            entries: [ { document: 'editor-data:blueprints', patch: nameSet(9) }, { document: 'map:1', patch: cells([ 1 ]) } ],
            through: [ 'map:3' ],
            fileVersions: [ { document: 'map:1', patches: share } ],
            followers: [ 'map:1', 'map:3' ],
            origin: 'w',
            at: 5,
          },
          [ { document: 'map:1', patch: nameSet(1), by }, { document: 'map:1', patch: cells([ 2 ]), by }, { document: 'map:3', patch: nameSet(1), by: null } ],
        ]);
    });

    it('keeps the file version of a document that left nothing as the step had it, beside one judged afresh', () =>
    {
      // Arrange: map 2's file took a version of its own and leaves nothing; map 1 leaves its door.
      const whole = stepWhole();
      const step: HistoryStep = {
        ...whole,
        entries: [ ...whole.entries, { document: 'map:2', patch: nameSet(2) } ],
        fileVersions: [ ...whole.fileVersions ?? [], { document: 'map:2', patches: [ nameSet(7) ] } ],
      };
      const parts = [
        movesWhole('editor-data:blueprints', nameSet(9)),
        { document: 'map:1' as const, moving: null, left: nameSet(1), by: null },
        movesWhole('map:1', cells([ 1, 2 ])),
        movesWhole('map:3', nameSet(1)),
        movesWhole('map:2', nameSet(2)),
      ];

      // Act.
      const moving = movingStep(step, parts, new Map([ [ 'map:1' as const, [ cells([ 2, 5 ]) ] ] ]));

      // Assert.
      expect(moving.fileVersions)
        .toStrictEqual([ { document: 'map:1', patches: [ cells([ 2, 5 ]) ] }, { document: 'map:2', patches: [ nameSet(7) ] } ]);
    });

    it('gives a document with no file version its file\'s share when the file takes more than moves in the document', () =>
    {
      // Arrange: a step with no file versions, map 1's door left in the document while its file takes it back too.
      const { fileVersions: _fileVersions, ...step } = stepWhole();
      const parts = [
        movesWhole('editor-data:blueprints', nameSet(9)),
        { document: 'map:1' as const, moving: null, left: nameSet(1), by: null },
        movesWhole('map:1', cells([ 1, 2 ])),
        movesWhole('map:3', nameSet(1)),
      ];

      // Act.
      const moving = movingStep(step, parts, new Map([ [ 'map:1' as const, [ nameSet(1), cells([ 1, 2 ]) ] ] ]));

      // Assert.
      expect(moving.fileVersions)
        .toStrictEqual([ { document: 'map:1', patches: [ nameSet(1), cells([ 1, 2 ]) ] } ]);
    });

    it('leaves a step with no file versions without any when each file takes just what moves in its document', () =>
    {
      // Arrange: map 1's door left in the document and in its file alike.
      const { fileVersions: _fileVersions, ...step } = stepWhole();
      const parts = [
        { document: 'map:1' as const, moving: null, left: nameSet(1), by: null },
        movesWhole('map:1', cells([ 1, 2 ])),
        movesWhole('map:3', nameSet(1)),
      ];

      // Act.
      const moving = movingStep(step, parts, new Map([ [ 'map:1' as const, [ cells([ 1, 2 ]) ] ] ]));

      // Assert: the moving part still holds map 3's door, which proves the step was narrowed rather than dropped.
      expect([ 'fileVersions' in moving, moving.entries ])
        .toStrictEqual([ false, [ { document: 'map:1', patch: cells([ 1, 2 ]) }, { document: 'map:3', patch: nameSet(1) } ] ]);
    });
  });

  describe('fileShareOf', () =>
  {
    /**
     * A set of a whole event, which holds every path inside it.
     * @param {number} eventId The event.
     * @returns {SetPatch} The patch.
     */
    const eventSet = (eventId: number): SetPatch => ({ kind: 'set', path: [ 'events', eventId ], before: 'was', after: 'now' });

    it('moves whole what reaches no part left, and a patch reaching one only as far as the file takes it, asking turned the way it moves', () =>
    {
      // Arrange: the door's name left, and cells 2 and 3; the file takes the door back and cell 3 alone. Event 10's name,
      // whose place merely starts like the door's, reaches nothing left.
      const asked: Patch[] = [];
      const fit = (_key: string, patch: Patch): Patch | null =>
      {
        asked.push(patch);
        return patch.kind === 'tiles' ? { ...patch, indices: [ 3 ] } : patch;
      };
      const way = [ nameSet(10), nameSet(1), cells([ 1, 2, 3 ]) ];

      // Act.
      const share = fileShareOf('map:1', way, [ nameSet(1), cells([ 2, 3 ]) ], 'backward', fit);

      // Assert.
      expect([ share, asked ])
        .toStrictEqual([
          [ nameSet(10), nameSet(1), cells([ 1, 3 ]) ],
          [ { kind: 'set', path: [ 'events', 1, 'name' ], before: 'b', after: 'a' }, { kind: 'tiles', indices: [ 2, 3 ], before: [ 102, 103 ], after: [ 2, 3 ] } ],
        ]);
    });

    it('keeps in the file a patch reaching a part left that the file would not take, the whole event holding it included', () =>
    {
      // Arrange: a file holding the edit in the door's way, so it takes nothing reaching the door.
      const fit = (): Patch | null => null;

      // Act.
      const share = fileShareOf('map:1', [ eventSet(1), nameSet(4), cells([ 1 ]) ], [ nameSet(1) ], 'backward', fit);

      // Assert.
      expect(share)
        .toStrictEqual([ nameSet(4), cells([ 1 ]) ]);
    });

    it('asks about a redo as the patch goes in', () =>
    {
      // Arrange.
      const asked: Patch[] = [];
      const fit = (_key: string, patch: Patch): Patch | null =>
      {
        asked.push(patch);
        return patch;
      };

      // Act.
      fileShareOf('map:1', [ nameSet(1) ], [ nameSet(1) ], 'forward', fit);

      // Assert.
      expect(asked)
        .toStrictEqual([ nameSet(1) ]);
    });

    it('takes everything when there is no way to tell what the file holds', () =>
    {
      // Arrange: nothing to ask.

      // Act.
      const share = fileShareOf('map:1', [ nameSet(1), cells([ 1, 2 ]) ], [ nameSet(1), cells([ 2 ]) ], 'backward', null);

      // Assert.
      expect(share)
        .toStrictEqual([ nameSet(1), cells([ 1, 2 ]) ]);
    });

    it('asks about every cell and the resize once a resize was left, and nothing else', () =>
    {
      // Arrange: a file taking cell 2 alone and no resize.
      const resize: Patch = { kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 2, height: 1, data: [] } };
      const fit = (_key: string, patch: Patch): Patch | null => (patch.kind === 'tiles' ? { ...patch, indices: [ 2 ] } : null);

      // Act.
      const share = fileShareOf('map:1', [ cells([ 1, 2 ]), resize, nameSet(4) ], [ resize ], 'backward', fit);

      // Assert: event 4's name reaches nothing left, so the file is never asked about it, and it goes.
      expect(share)
        .toStrictEqual([ cells([ 2 ]), nameSet(4) ]);
    });
  });

  describe('reachesLeft', () =>
  {
    it('finds a patch reaching a cell or a path of a part left, and none reaching elsewhere', () =>
    {
      // Arrange: parts left on the door's name and cell 2.
      const left = [ nameSet(1), cells([ 2 ]) ];

      // Act.
      const reached = [
        reachesLeft([ cells([ 2, 5 ]) ], left),
        reachesLeft([ { kind: 'set', path: [ 'events', 1 ], before: 1, after: 2 } ], left),
        reachesLeft([ cells([ 5 ]), nameSet(10) ], left),
        reachesLeft([], left),
      ];

      // Assert.
      expect(reached)
        .toStrictEqual([ true, true, false, false ]);
    });
  });

  describe('fileKeepsLeft', () =>
  {
    /**
     * A step with the given entries and file versions.
     * @param {Partial<HistoryStep>} fields The fields.
     * @returns {HistoryStep} The step.
     */
    const stepWith = (fields: Partial<HistoryStep>): HistoryStep => ({ id: 'w#1', label: 'Change', histories: [], entries: [], origin: 'w', at: 0, ...fields });

    it('keeps the parts left in a file whose share is just what moved, or reaches none of them, and not in one whose share does', () =>
    {
      // Arrange: map 1's door left; a share reaching the door, one reaching only cell 5, and none at all.
      const left = stepWith({ entries: [ { document: 'map:1', patch: nameSet(1) } ] });
      const gave = stepWith({ fileVersions: [ { document: 'map:1', patches: [ nameSet(1), cells([ 5 ]) ] } ] });
      const kept = stepWith({ fileVersions: [ { document: 'map:1', patches: [ cells([ 5 ]) ] } ] });
      const none = stepWith({});

      // Act.
      const keeps = [ fileKeepsLeft(gave, left, 'map:1'), fileKeepsLeft(kept, left, 'map:1'), fileKeepsLeft(none, left, 'map:1') ];

      // Assert.
      expect(keeps)
        .toStrictEqual([ false, true, true ]);
    });

    it('keeps nothing in the file of a document the move left no part on', () =>
    {
      // Arrange: the parts left are on map 1 alone.
      const left = stepWith({ entries: [ { document: 'map:1', patch: nameSet(1) } ] });

      // Act.
      const keeps = fileKeepsLeft(stepWith({}), left, 'map:2');

      // Assert.
      expect(keeps)
        .toBe(false);
    });
  });

  describe('likeliestWayOf', () =>
  {
    it('finds the file version a step recorded for a document, and otherwise the document\'s own patches alone', () =>
    {
      // Arrange: a version for map 1 alone, and entries on both maps.
      const step: HistoryStep = {
        id: 'w#1',
        label: 'Change',
        histories: [],
        entries: [ { document: 'map:1', patch: nameSet(1) }, { document: 'map:2', patch: nameSet(2) }, { document: 'map:2', patch: cells([ 4 ]) } ],
        fileVersions: [ { document: 'map:1', patches: [ nameSet(8) ] } ],
        origin: 'w',
        at: 0,
      };

      // Act.
      const ways = [ likeliestWayOf(step, 'map:1'), likeliestWayOf(step, 'map:2') ];

      // Assert.
      expect(ways)
        .toStrictEqual([ [ nameSet(8) ], [ nameSet(2), cells([ 4 ]) ] ]);
    });
  });
});

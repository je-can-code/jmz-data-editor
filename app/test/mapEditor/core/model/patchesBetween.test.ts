import { describe, expect, it } from 'vitest';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { applyJsonPatch, invertPatch, type Patch, type SetPatch, type SplicePatch } from '../../../../src/mapEditor/core/model/patches.ts';
import { patchesBetween } from '../../../../src/mapEditor/core/model/patchesBetween.ts';

/*
 * An outside change to a file arrives as patches, so it can be one undoable step like any edit. The patches owe two
 * things. They must be exact: applied in order to the old content they give the new content, and reversed newest
 * first they give the old content back, down to absent keys and list lengths. And they must address only what
 * changed, so every edit elsewhere in the document still finds its own data where it left it and can be undone
 * around them; that is why the fixtures keep untouched siblings beside every change, and why an item inserted into
 * a list must be one splice rather than a rewrite of every item behind it. The root itself can never be replaced by a
 * patch, so a root that changed kind has no answer.
 */
describe('patchesBetween', () =>
{
  /**
   * Applies patches in order to a copy of a value.
   * @param {JsonValue} value The value.
   * @param {readonly Patch[]} patches The patches, each a set or a splice.
   * @returns {JsonValue} The patched copy.
   */
  const applyAll = (value: JsonValue, patches: readonly Patch[]): JsonValue =>
  {
    const copy = cloneJson(value);
    patches.forEach(patch => applyJsonPatch(copy, patch as SetPatch | SplicePatch));
    return copy;
  };

  /**
   * Takes patches back out of a copy of a value, newest first.
   * @param {JsonValue} value The value the patches were applied to.
   * @param {readonly Patch[]} patches The patches, oldest first.
   * @returns {JsonValue} The copy with every patch reversed.
   */
  const reverseAll = (value: JsonValue, patches: readonly Patch[]): JsonValue =>
  {
    return applyAll(value, [ ...patches ].reverse().map(invertPatch));
  };

  it('says nothing when the two are equal, whatever order their keys are in', () =>
  {
    // Arrange: the same object with its keys written the other way round.
    const before = { name: 'Town', note: '' };
    const after = { note: '', name: 'Town' };

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([]);
  });

  it('reaches down to the one value that changed, and addresses none of its siblings', () =>
  {
    // Arrange.
    const before = { name: 'Town', bgm: { name: 'Town', volume: 90 }, note: 'keep' };
    const after = { name: 'Town', bgm: { name: 'Town', volume: 60 }, note: 'keep' };

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([ { kind: 'set', path: [ 'bgm', 'volume' ], before: 90, after: 60 } ]);
  });

  it('adds and removes keys with sets that name the key as absent on one side', () =>
  {
    // Arrange: one key goes, one arrives, one stays.
    const before = { meta: { tag: 1 }, name: 'Town' };
    const after = { name: 'Town', quick: true };

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([
        { kind: 'set', path: [ 'meta' ], before: { tag: 1 }, after: undefined },
        { kind: 'set', path: [ 'quick' ], before: undefined, after: true },
      ]);
  });

  it('changes items of a list that kept its length in place, reaching inside each one', () =>
  {
    // Arrange: the first and last rows change, the middle row does not.
    const before = [ null, { id: 1, name: 'Town' }, { id: 2, name: 'Cave' }, { id: 3, name: 'Peak' } ];
    const after = [ null, { id: 1, name: 'Harbor' }, { id: 2, name: 'Cave' }, { id: 3, name: 'Summit' } ];

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([
        { kind: 'set', path: [ 1, 'name' ], before: 'Town', after: 'Harbor' },
        { kind: 'set', path: [ 3, 'name' ], before: 'Peak', after: 'Summit' },
      ]);
  });

  it('inserts an item in the middle of a list as one splice, leaving every item behind it alone', () =>
  {
    // Arrange: a command slipped in between the second and third.
    const before = { list: [ 'a', 'b', 'c', 'd' ] };
    const after = { list: [ 'a', 'b', 'x', 'c', 'd' ] };

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([ { kind: 'splice', path: [ 'list' ], index: 2, removed: [], inserted: [ 'x' ] } ]);
  });

  it('changes one item in place and adds the new ones after, when that touches fewer items than one splice', () =>
  {
    // Arrange: the first row is renamed and a row is added at the end.
    const before = [ null, { name: 'Town' }, { name: 'Cave' }, { name: 'Peak' } ];
    const after = [ null, { name: 'Harbor' }, { name: 'Cave' }, { name: 'Peak' }, { name: 'Lake' } ];

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([
        { kind: 'set', path: [ 1, 'name' ], before: 'Town', after: 'Harbor' },
        { kind: 'splice', path: [], index: 4, removed: [], inserted: [ { name: 'Lake' } ] },
      ]);
  });

  it('takes items off the end of a list with one splice', () =>
  {
    // Arrange: the last two rows are gone.
    const before = [ null, 'one', 'two', 'three' ];
    const after = [ null, 'one' ];

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([ { kind: 'splice', path: [], index: 2, removed: [ 'two', 'three' ], inserted: [] } ]);
  });

  it('lines the items up past an insertion, so the items it pushed along are left alone and only the changed one changes', () =>
  {
    // Arrange: an item arrives at the front and the last one changes, so every item compared by position would differ.
    const before = [ 'a', 'b', 'c' ];
    const after = [ 'x', 'a', 'b', 'z' ];

    // Act.
    const patches = patchesBetween(before, after);

    // Assert: the change is addressed where the insertion left it.
    expect(patches)
      .toStrictEqual([
        { kind: 'splice', path: [], index: 0, removed: [], inserted: [ 'x' ] },
        { kind: 'set', path: [ 3 ], before: 'c', after: 'z' },
      ]);
  });

  it('says a stretch too long to line up as one splice when it grew, and item by item when it kept its length', () =>
  {
    // Arrange: 600 items that all change, once with one more item after them and once without.
    const before = Array.from({ length: 600 }, (_, index) => index);
    const grown = [ ...before.map(value => value + 1000), 5000 ];
    const kept = before.map(value => value + 1000);

    // Act.
    const whenGrown = patchesBetween(before, grown) as Patch[];
    const whenKept = patchesBetween(before, kept) as Patch[];

    // Assert.
    expect([ whenGrown.map(patch => patch.kind), whenKept.length, whenKept[599] ])
      .toStrictEqual([ [ 'splice' ], 600, { kind: 'set', path: [ 599 ], before: 599, after: 1599 } ]);
  });

  it('replaces a value that changed kind below the root with one set', () =>
  {
    // Arrange: an empty slot gets an event, and a list becomes a number.
    const before = { events: [ null, null ], scroll: [ 1, 2 ] };
    const after = { events: [ null, { id: 1 } ], scroll: 3 };

    // Act.
    const patches = patchesBetween(before, after);

    // Assert.
    expect(patches)
      .toStrictEqual([
        { kind: 'set', path: [ 'events', 1 ], before: null, after: { id: 1 } },
        { kind: 'set', path: [ 'scroll' ], before: [ 1, 2 ], after: 3 },
      ]);
  });

  it('has no answer when the root itself changed kind, but answers for equal roots of any kind', () =>
  {
    // Arrange: a list that became an object, two different numbers, and two equal numbers.

    // Act.
    const answers = [ patchesBetween([ null ], { rows: [] }), patchesBetween(1, 2), patchesBetween(1, 1) ];

    // Assert.
    expect(answers)
      .toStrictEqual([ null, null, [] ]);
  });

  it('reaches the new content exactly when applied, and the old content exactly when reversed', () =>
  {
    // Arrange: every kind of change at once, nested in lists and objects.
    const before: JsonValue = {
      events: [ null, { id: 1, name: 'Door', pages: [ { list: [ 'a', 'b', 'c' ] } ] }, null, { id: 3, name: 'Chest' } ],
      meta: { tag: 1 },
      note: '',
    };
    const after: JsonValue = {
      events: [ null, { id: 1, name: 'Gate', pages: [ { list: [ 'a', 'x', 'b', 'c' ] }, { list: [] } ] }, { id: 2, name: 'New' } ],
      note: 'changed',
      quick: true,
    };

    // Act.
    const patches = patchesBetween(before, after) as Patch[];
    const applied = applyAll(before, patches);
    const reversed = reverseAll(applied, patches);

    // Assert.
    expect([ applied, reversed ])
      .toStrictEqual([ after, before ]);
  });

  it('hands back patches that share nothing with either value, so changing one afterwards changes no patch', () =>
  {
    // Arrange.
    const before = { rows: [ { name: 'Town' } ] };
    const after = { rows: [ { name: 'Town' } ], added: { name: 'Cave' } };

    // Act.
    const [ patch ] = patchesBetween(before, after) as SetPatch[];
    after.added.name = 'changed afterwards';

    // Assert.
    expect(patch.after)
      .toStrictEqual({ name: 'Cave' });
  });
});

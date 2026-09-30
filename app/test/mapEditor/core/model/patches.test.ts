import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import {
  applyJsonPatch,
  createSetPatch,
  createSplicePatch,
  describePath,
  invertPatch,
  isNoopPatch,
  PatchConflictError,
  readAt,
  type Patch,
} from '../../../../src/mapEditor/core/model/patches.ts';

/*
 * Patches are the only way anything in the map editor changes, and undo is nothing more than applying a patch's
 * inverse. So the module owes two things. Every patch must reverse exactly: apply it, apply its inverse, and the
 * tree is the tree it was, down to array lengths and absent keys. And every patch must refuse to land on a tree
 * that no longer holds what it expects to replace, because two histories edit the same map and a patch that
 * overwrote whatever it found would quietly undo the other one's work.
 */
describe('patches', () =>
{
  /**
   * A tree with siblings everywhere, so a write to the wrong place shows.
   * @returns {JsonValue} A fresh tree.
   */
  const buildTree = (): JsonValue => ({
    name: 'Town',
    note: 'keep me',
    list: [ 'a', 'b', 'c' ],
    nested: { depth: 1, other: 2 },
  });

  describe('invertPatch', () =>
  {
    it('swaps what a set wrote with what it replaced', () =>
    {
      // Arrange.
      const patch: Patch = { kind: 'set', path: [ 'name' ], before: 'Town', after: 'City' };

      // Act.
      const inverse = invertPatch(patch);

      // Assert.
      expect(inverse)
        .toStrictEqual({ kind: 'set', path: [ 'name' ], before: 'City', after: 'Town' });
    });

    it('swaps what a splice removed with what it inserted', () =>
    {
      // Arrange.
      const patch: Patch = { kind: 'splice', path: [ 'list' ], index: 1, removed: [ 'b' ], inserted: [ 'x', 'y' ] };

      // Act.
      const inverse = invertPatch(patch);

      // Assert.
      expect(inverse)
        .toStrictEqual({ kind: 'splice', path: [ 'list' ], index: 1, removed: [ 'x', 'y' ], inserted: [ 'b' ] });
    });

    it('swaps the cell values of a tiles patch and keeps its indices', () =>
    {
      // Arrange.
      const patch: Patch = { kind: 'tiles', indices: [ 4, 9 ], before: [ 1, 2 ], after: [ 7, 8 ] };

      // Act.
      const inverse = invertPatch(patch);

      // Assert.
      expect(inverse)
        .toStrictEqual({ kind: 'tiles', indices: [ 4, 9 ], before: [ 7, 8 ], after: [ 1, 2 ] });
    });

    it('swaps the two sizes of a resize', () =>
    {
      // Arrange.
      const small = { width: 1, height: 1, data: [ 1, 2, 3, 4, 5, 6 ] };
      const wide = { width: 2, height: 1, data: [ 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6 ] };
      const patch: Patch = { kind: 'resize', before: small, after: wide };

      // Act.
      const inverse = invertPatch(patch);

      // Assert.
      expect(inverse)
        .toStrictEqual({ kind: 'resize', before: wide, after: small });
    });
  });

  describe('readAt', () =>
  {
    it('walks object keys and array indexes', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const value = readAt(tree, [ 'list', 1 ]);

      // Assert.
      expect(value)
        .toBe('b');
    });

    it('answers undefined for an index past the end', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const value = readAt(tree, [ 'list', 3 ]);

      // Assert.
      expect(value)
        .toBeUndefined();
    });

    it('answers undefined for a key the object lacks', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const value = readAt(tree, [ 'nested', 'missing' ]);

      // Assert.
      expect(value)
        .toBeUndefined();
    });

    it('answers undefined when a path steps into a primitive', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const value = readAt(tree, [ 'name', 'length' ]);

      // Assert.
      expect(value)
        .toBeUndefined();
    });

    it('answers the whole tree for the empty path', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const value = readAt(tree, []);

      // Assert.
      expect(value)
        .toBe(tree);
    });
  });

  describe('applyJsonPatch', () =>
  {
    it('replaces one key and leaves its siblings alone', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'nested', 'depth' ], before: 1, after: 5 });

      // Assert.
      expect(tree)
        .toStrictEqual({ name: 'Town', note: 'keep me', list: [ 'a', 'b', 'c' ], nested: { depth: 5, other: 2 } });
    });

    it('adds a key that was absent', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'meta' ], before: undefined, after: {} });

      // Assert.
      expect(readAt(tree, [ 'meta' ]))
        .toStrictEqual({});
    });

    it('removes a key when the new value is absent', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'note' ], before: 'keep me', after: undefined });

      // Assert.
      expect(Object.keys(tree as object))
        .toStrictEqual([ 'name', 'list', 'nested' ]);
    });

    it('refuses a set when the value is no longer the one it replaced', () =>
    {
      // Arrange.
      const tree = buildTree();
      const stale: Patch = { kind: 'set', path: [ 'name' ], before: 'Village', after: 'City' };

      // Act.
      const apply = () => applyJsonPatch(tree, stale);

      // Assert.
      expect(apply)
        .toThrow(PatchConflictError);
      expect(readAt(tree, [ 'name' ]))
        .toBe('Town');
    });

    it('refuses to set a key that appeared since the patch was made', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'note' ], before: undefined, after: 'mine' });

      // Assert.
      expect(apply)
        .toThrow(PatchConflictError);
    });

    it('refuses to replace the root', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [], before: tree, after: {} });

      // Assert.
      expect(apply)
        .toThrow(/root/u);
    });

    it('replaces an existing array item', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'list', 1 ], before: 'b', after: 'B' });

      // Assert.
      expect(readAt(tree, [ 'list' ]))
        .toStrictEqual([ 'a', 'B', 'c' ]);
    });

    it('appends at exactly the end of an array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'list', 3 ], before: undefined, after: 'd' });

      // Assert.
      expect(readAt(tree, [ 'list' ]))
        .toStrictEqual([ 'a', 'b', 'c', 'd' ]);
    });

    it('removes the last array item', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'set', path: [ 'list', 2 ], before: 'c', after: undefined });

      // Assert.
      expect(readAt(tree, [ 'list' ]))
        .toStrictEqual([ 'a', 'b' ]);
    });

    it('refuses to remove an array item before the last, which would not reverse', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'list', 1 ], before: 'b', after: undefined });

      // Assert.
      expect(apply)
        .toThrow(/last item/u);
    });

    it('refuses to write past the end of an array, which would leave holes', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'list', 5 ], before: undefined, after: 'z' });

      // Assert.
      expect(apply)
        .toThrow(/splice/u);
    });

    it('refuses a string key on an array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'list', 'x' ], before: undefined, after: 1 });

      // Assert.
      expect(apply)
        .toThrow(/addressed by key/u);
    });

    it('refuses a numeric index on an object', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'nested', 0 ], before: undefined, after: 1 });

      // Assert.
      expect(apply)
        .toThrow(/addressed by index/u);
    });

    it('refuses a path whose parent does not exist', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'set', path: [ 'ghost', 'x' ], before: undefined, after: 1 });

      // Assert.
      expect(apply)
        .toThrow(/no container/u);
    });

    it('splices items into and out of an array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      applyJsonPatch(tree, { kind: 'splice', path: [ 'list' ], index: 1, removed: [ 'b' ], inserted: [ 'x', 'y' ] });

      // Assert.
      expect(readAt(tree, [ 'list' ]))
        .toStrictEqual([ 'a', 'x', 'y', 'c' ]);
    });

    it('refuses a splice when the items it removed are no longer there', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'splice', path: [ 'list' ], index: 1, removed: [ 'c' ], inserted: [] });

      // Assert.
      expect(apply)
        .toThrow(PatchConflictError);
      expect(readAt(tree, [ 'list' ]))
        .toStrictEqual([ 'a', 'b', 'c' ]);
    });

    it('refuses a splice that starts past the end of the array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'splice', path: [ 'list' ], index: 4, removed: [], inserted: [ 'z' ] });

      // Assert.
      expect(apply)
        .toThrow(PatchConflictError);
    });

    it('refuses a splice on something that is not an array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const apply = () => applyJsonPatch(tree, { kind: 'splice', path: [ 'nested' ], index: 0, removed: [], inserted: [ 1 ] });

      // Assert.
      expect(apply)
        .toThrow(/no array/u);
    });

    it('stores a copy of the value, so the patch and the tree never share an object', () =>
    {
      // Arrange.
      const tree = buildTree();
      const patch = { kind: 'set' as const, path: [ 'extra' ], before: undefined, after: { count: 1 } };

      // Act.
      applyJsonPatch(tree, patch);
      (readAt(tree, [ 'extra' ]) as { count: number }).count = 99;

      // Assert.
      expect(patch.after)
        .toStrictEqual({ count: 1 });
    });

    it('reverses every kind of change exactly', () =>
    {
      // Arrange.
      const tree = buildTree();
      const original = structuredClone(tree);
      const patches: Patch[] = [
        { kind: 'set', path: [ 'name' ], before: 'Town', after: 'City' },
        { kind: 'set', path: [ 'meta' ], before: undefined, after: { a: 1 } },
        { kind: 'set', path: [ 'note' ], before: 'keep me', after: undefined },
        { kind: 'set', path: [ 'list', 3 ], before: undefined, after: 'd' },
        { kind: 'splice', path: [ 'list' ], index: 0, removed: [ 'a', 'b' ], inserted: [ 'q' ] },
      ];

      // Act.
      patches.forEach(patch => applyJsonPatch(tree, patch as never));
      [ ...patches ].reverse().forEach(patch => applyJsonPatch(tree, invertPatch(patch) as never));

      // Assert.
      expect(tree)
        .toStrictEqual(original);
    });
  });

  describe('createSetPatch', () =>
  {
    it('captures a copy of what it replaces', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const patch = createSetPatch(tree, [ 'nested' ], { depth: 9 });
      (readAt(tree, [ 'nested' ]) as { depth: number }).depth = 42;

      // Assert.
      expect(patch)
        .toStrictEqual({ kind: 'set', path: [ 'nested' ], before: { depth: 1, other: 2 }, after: { depth: 9 } });
    });
  });

  describe('createSplicePatch', () =>
  {
    it('captures the items it removes', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const patch = createSplicePatch(tree, [ 'list' ], 1, 2, [ 'z' ]);

      // Assert.
      expect(patch)
        .toStrictEqual({ kind: 'splice', path: [ 'list' ], index: 1, removed: [ 'b', 'c' ], inserted: [ 'z' ] });
    });

    it('removes nothing from something that is not an array', () =>
    {
      // Arrange.
      const tree = buildTree();

      // Act.
      const patch = createSplicePatch(tree, [ 'name' ], 0, 1, []);

      // Assert.
      expect(patch.removed)
        .toStrictEqual([]);
    });
  });

  describe('isNoopPatch', () =>
  {
    it('spots a set that writes what was already there', () =>
    {
      // Arrange.
      const same: Patch = { kind: 'set', path: [ 'a' ], before: { x: 1 }, after: { x: 1 } };
      const different: Patch = { kind: 'set', path: [ 'a' ], before: { x: 1 }, after: { x: 2 } };

      // Act.
      const verdicts = [ isNoopPatch(same), isNoopPatch(different) ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false ]);
    });

    it('spots a splice that puts back what it took', () =>
    {
      // Arrange.
      const same: Patch = { kind: 'splice', path: [ 'a' ], index: 0, removed: [ 1 ], inserted: [ 1 ] };
      const different: Patch = { kind: 'splice', path: [ 'a' ], index: 0, removed: [ 1 ], inserted: [ 2 ] };

      // Act.
      const verdicts = [ isNoopPatch(same), isNoopPatch(different) ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false ]);
    });

    it('spots a tiles patch that changes no cell', () =>
    {
      // Arrange.
      const same: Patch = { kind: 'tiles', indices: [ 1 ], before: [ 5 ], after: [ 5 ] };
      const different: Patch = { kind: 'tiles', indices: [ 1 ], before: [ 5 ], after: [ 6 ] };

      // Act.
      const verdicts = [ isNoopPatch(same), isNoopPatch(different) ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false ]);
    });

    it('spots a resize to the same size and tiles', () =>
    {
      // Arrange.
      const size = { width: 1, height: 1, data: [ 1, 2, 3, 4, 5, 6 ] };
      const same: Patch = { kind: 'resize', before: size, after: size };
      const different: Patch = { kind: 'resize', before: size, after: { ...size, data: [ 1, 2, 3, 4, 5, 7 ] } };

      // Act.
      const verdicts = [ isNoopPatch(same), isNoopPatch(different) ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false ]);
    });
  });

  describe('describePath', () =>
  {
    it('joins a path with slashes, and names the root', () =>
    {
      // Arrange: two paths.

      // Act.
      const described = [ describePath([ 'events', 5, 'x' ]), describePath([]) ];

      // Assert.
      expect(described)
        .toStrictEqual([ 'events/5/x', '(root)' ]);
    });
  });
});

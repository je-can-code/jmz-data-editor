import { describe, expect, it } from 'vitest';
import { cloneJson, isJsonObject, jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';

/*
 * Every patch check in the editor comes down to one question: does the document still hold this value? That is
 * jsonEquals. It must see through key order (a server that re-marshals a file reorders it), compare typed
 * arrays by content (tile data lives in one), and never confuse an absent key with a present one, which is the
 * whole difference between a file that kept its `meta` and one that lost it. cloneJson is the other half: the
 * copy every value takes across a document's boundary, so history and live data never share an object.
 */
describe('json', () =>
{
  describe('jsonEquals', () =>
  {
    it('ignores key order', () =>
    {
      // Arrange.
      const left = { a: 1, b: [ 2, 3 ] };
      const right = { b: [ 2, 3 ], a: 1 };

      // Act.
      const equal = jsonEquals(left, right);

      // Assert.
      expect(equal)
        .toBe(true);
    });

    it('tells an absent key from a present one, even an undefined one', () =>
    {
      // Arrange.
      const left = { a: 1, b: undefined };
      const right = { a: 1, c: undefined };

      // Act.
      const equal = jsonEquals(left, right);

      // Assert.
      expect(equal)
        .toBe(false);
    });

    it('tells objects with different key counts apart', () =>
    {
      // Arrange.
      const left = { a: 1 };
      const right = { a: 1, b: 2 };

      // Act.
      const equal = jsonEquals(left, right);

      // Assert.
      expect(equal)
        .toBe(false);
    });

    it('compares arrays in order and by length', () =>
    {
      // Arrange: a reordering and a shortening, each a near miss.

      // Act.
      const verdicts = [
        jsonEquals([ 1, 2 ], [ 1, 2 ]),
        jsonEquals([ 1, 2 ], [ 2, 1 ]),
        jsonEquals([ 1, 2 ], [ 1 ]),
      ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false, false ]);
    });

    it('compares a typed array with a plain array by content', () =>
    {
      // Arrange.
      const cells = new Uint16Array([ 5, 6, 7 ]);

      // Act.
      const verdicts = [ jsonEquals(cells, [ 5, 6, 7 ]), jsonEquals(cells, [ 5, 6, 8 ]) ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false ]);
    });

    it('never matches an array with an object, or null with an object', () =>
    {
      // Arrange: pairs that differ only in kind.

      // Act.
      const verdicts = [ jsonEquals([], {}), jsonEquals(null, {}), jsonEquals({}, null), jsonEquals(0, '0') ];

      // Assert.
      expect(verdicts)
        .toStrictEqual([ false, false, false, false ]);
    });
  });

  describe('cloneJson', () =>
  {
    it('copies deeply, so the copy can change alone', () =>
    {
      // Arrange.
      const original = { list: [ { name: 'a' } ] };

      // Act.
      const copy = cloneJson(original);
      copy.list[0].name = 'b';

      // Assert.
      expect(original.list[0].name)
        .toBe('a');
    });

    it('passes primitives and null through', () =>
    {
      // Arrange: one of each.

      // Act.
      const copies = [ cloneJson(3), cloneJson('x'), cloneJson(null), cloneJson(undefined) ];

      // Assert.
      expect(copies)
        .toStrictEqual([ 3, 'x', null, undefined ]);
    });
  });

  describe('isJsonObject', () =>
  {
    it('accepts plain objects only', () =>
    {
      // Arrange: an object beside its near misses.

      // Act.
      const verdicts = [ {}, [], null, new Uint16Array(1), 'text' ].map(value => isJsonObject(value));

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false, false, false, false ]);
    });
  });
});

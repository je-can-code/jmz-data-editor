import { describe, expect, it } from 'vitest';
import { patchAt } from '@services/utils/patchAt.ts';

/**
 * Every board edits its rows through a state updater, and `patchAt` is what the updater applies. It owes the
 * boards three things. It changes exactly one entry and hands every other back untouched. It keeps that
 * entry's prototype, because the boards hold domain models, and a model that lost its methods would fail on
 * the next save. And it builds on the list it is given, so two changes made in a single click both land:
 * Apply on a class's growth row writes the formula into the note and the baked values into the params,
 * and before this existed the second change put back the note the first one had just written.
 */
describe('patchAt', () =>
{
  /**
   * A stand-in domain model: plain data, plus a method the copy has to keep.
   */
  class Row
  {
    constructor(public id: number, public note: string, public params: number[])
    {
    }

    toRmmz(): string
    {
      return `${this.id}:${this.note}:${this.params.join(',')}`;
    }
  }

  it('changes only the entry at the index it is given', () =>
  {
    // Arrange- three rows, so both neighbours of the changed one can be checked.
    const rows = [ new Row(1, 'first', []), new Row(2, 'second', []), new Row(3, 'third', []) ];

    // Act
    const patched = patchAt(rows, 1, { note: 'changed' });

    // Assert- the neighbours are the very same objects, and only the middle row changed.
    expect(patched[ 0 ])
      .toBe(rows[ 0 ]);
    expect(patched[ 2 ])
      .toBe(rows[ 2 ]);
    expect(patched[ 1 ].note)
      .toBe('changed');
  });

  it('keeps the entry\'s class, so a domain model keeps its methods', () =>
  {
    // Arrange
    const rows = [ new Row(1, 'first', [ 5 ]) ];

    // Act
    const [ patched ] = patchAt(rows, 0, { note: 'changed' });

    // Assert
    expect(patched)
      .toBeInstanceOf(Row);
    expect(patched.toRmmz())
      .toBe('1:changed:5');
  });

  it('leaves the list it was given as it was', () =>
  {
    // Arrange
    const rows = [ new Row(1, 'first', []) ];

    // Act
    const patched = patchAt(rows, 0, { note: 'changed' });

    // Assert- a new list and a new entry; the old ones still read as before.
    expect(patched)
      .not.toBe(rows);
    expect(rows[ 0 ].note)
      .toBe('first');
  });

  it('keeps both of two changes made to one entry in a single click', () =>
  {
    // Arrange- Apply on a growth row: the formula into the note, then the baked values into the params,
    // chained the way React chains the updaters of one click.
    const rows = [ new Row(2, 'old formula', [ 1, 2 ]) ];
    const updaters = [
      (list: Row[]) => patchAt(list, 0, { note: 'new formula' }),
      (list: Row[]) => patchAt(list, 0, { params: [ 3, 4 ] }),
    ];

    // Act
    const [ patched ] = updaters.reduce((list, update) => update(list), rows);

    // Assert- the formula survived the values written after it.
    expect(patched.note)
      .toBe('new formula');
    expect(patched.params)
      .toEqual([ 3, 4 ]);
  });
});

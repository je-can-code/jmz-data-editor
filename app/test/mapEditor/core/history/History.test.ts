import { describe, expect, it } from 'vitest';
import { History } from '../../../../src/mapEditor/core/history/History.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';

/*
 * One history lists which of its steps are applied. Undo and redo invoked in it act on its head, and a new step
 * drops whatever could have been redone. A step shared with other histories can also move because one of those
 * moved it, and may then sit anywhere in this one: undone out of the middle of the done list, or redone after
 * this history had already dropped it from its redo list. Either way the history must end up truthful, with the
 * step exactly once, in the right list, and every other step where it was.
 */
describe('History', () =>
{
  /**
   * A step that touches nothing, identified by name.
   * @param {string} id The step id and label.
   * @returns {HistoryStep} The step.
   */
  const step = (id: string): HistoryStep => ({ id, label: id, histories: [ 'map:1' ], entries: [], origin: 'w', at: 0 });

  /**
   * Lists a history's steps by id.
   * @param {History} history The history.
   * @returns {[ string[], string[] ]} The done ids, then the undone ids.
   */
  const ids = (history: History): [ string[], string[] ] => [ history.done.map(each => each.id), history.undone.map(each => each.id) ];

  it('hands back the steps a new record makes unredoable', () =>
  {
    // Arrange.
    const history = new History('map:1', [ step('a'), step('b') ]);
    history.markUndone(history.lastDone() as HistoryStep);

    // Act.
    const dropped = history.record(step('c'));

    // Assert.
    expect([ dropped.map(each => each.id), ids(history) ])
      .toStrictEqual([ [ 'b' ], [ [ 'a', 'c' ], [] ] ]);
  });

  it('undoes a step out of the middle, keeping the newer steps done in their order', () =>
  {
    // Arrange: a transaction undone from another history while this one has a newer step.
    const shared = step('shared');
    const history = new History('map:1', [ step('a'), shared, step('newer') ], [ step('older-undone') ]);

    // Act.
    history.markUndone(shared);

    // Assert: the newer step is still this history's next undo; the shared one is its next redo.
    expect([ ids(history), history.lastDone()?.id, history.nextRedo()?.id ])
      .toStrictEqual([ [ [ 'a', 'newer' ], [ 'older-undone', 'shared' ] ], 'newer', 'shared' ]);
  });

  it('redoes a step it had dropped from its redo list, as its newest done step', () =>
  {
    // Arrange: this history moved on after the shared step was undone, then another history redid it.
    const shared = step('shared');
    const history = new History('map:1', [ step('a') ], [ shared ]);
    history.record(step('b'));

    // Act.
    history.markRedone(shared);

    // Assert.
    expect(ids(history))
      .toStrictEqual([ [ 'a', 'b', 'shared' ], [] ]);
  });

  it('redoes a step from the middle of its redo list, leaving the others to redo', () =>
  {
    // Arrange.
    const shared = step('shared');
    const history = new History('map:1', [], [ step('x'), shared, step('y') ]);

    // Act.
    history.markRedone(shared);

    // Assert.
    expect(ids(history))
      .toStrictEqual([ [ 'shared' ], [ 'x', 'y' ] ]);
  });

  it('knows where a step sits, and drops it from wherever that is', () =>
  {
    // Arrange.
    const history = new History('map:1', [ step('a') ], [ step('b') ]);

    // Act.
    const states = [ history.stateOf('a'), history.stateOf('b'), history.stateOf('z') ];
    const dropped = [ history.drop('b'), history.drop('z') ];

    // Assert.
    expect([ states, dropped, history.undone ])
      .toStrictEqual([ [ 'done', 'undone', null ], [ true, false ], [] ]);
  });
});

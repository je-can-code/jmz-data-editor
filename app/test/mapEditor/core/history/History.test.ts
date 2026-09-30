import { describe, expect, it } from 'vitest';
import { History } from '../../../../src/mapEditor/core/history/History.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';

/*
 * One history is a strict stack: steps are undone newest first and redone in the reverse order, and a new step
 * drops whatever could have been redone. The stack refuses to move any step but the one at its head, because a
 * history that let a middle step move would no longer describe a path back to where the map started.
 */
describe('History', () =>
{
  /**
   * A step that touches nothing, identified by name.
   * @param {string} id The step id and label.
   * @returns {HistoryStep} The step.
   */
  const step = (id: string): HistoryStep => ({ id, label: id, histories: [ 'map:1' ], entries: [], origin: 'w', at: 0 });

  it('hands back the steps a new record makes unredoable', () =>
  {
    // Arrange.
    const history = new History('map:1', [ step('a'), step('b') ]);
    history.markUndone(history.lastDone() as HistoryStep);

    // Act.
    const dropped = history.record(step('c'));

    // Assert.
    expect([ dropped.map(each => each.id), history.done.map(each => each.id), history.undone ])
      .toStrictEqual([ [ 'b' ], [ 'a', 'c' ], [] ]);
  });

  it('refuses to undo a step that is not the newest', () =>
  {
    // Arrange.
    const first = step('a');
    const history = new History('map:1', [ first, step('b') ]);

    // Act.
    const undo = () => history.markUndone(first);

    // Assert.
    expect(undo)
      .toThrow(/not the newest step/u);
  });

  it('refuses to redo a step that is not next in line', () =>
  {
    // Arrange.
    const history = new History('map:1', [], [ step('b'), step('a') ]);

    // Act.
    const redo = () => history.markRedone(history.undone[0]);

    // Assert.
    expect(redo)
      .toThrow(/not the next step to redo/u);
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

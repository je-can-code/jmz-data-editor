import { describe, expect, it } from 'vitest';
import type { RmmzMoveCommand, RmmzMoveRoute } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { moveRun, removeRun, replaceRun, runOfStep, setRunCount, stepRuns } from '../../../../src/mapEditor/core/moveRoutes/routeRuns.ts';

/*
 * The route editor lists a route as runs of identical steps, "Move Left ×3", so a long walk reads at a glance. The runs
 * owe the editor an honest grouping: steps join a run only when they do exactly the same thing, the same code with
 * the same inputs, wherever each sits; a step between two of a kind keeps them apart. A run's count can be set, its
 * inputs changed for every step in it at once, the whole run taken away, or moved past its neighbour. Every change
 * keeps the route's end step and its options exactly as they were, since the editor writes the route back whole.
 */
describe('stepRuns', () =>
{
  it('groups identical steps that follow each other, and keeps apart those that differ', () =>
  {
    // Arrange: left three times, a wait, a different wait, left again.
    const steps: RmmzMoveCommand[] = [
      { code: 2 }, { code: 2, indent: null }, { code: 2 },
      { code: 15, parameters: [ 60 ] }, { code: 15, parameters: [ 30 ] },
      { code: 2 },
    ];

    // Act.
    const runs = stepRuns(steps);

    // Assert: the indent is no part of a step; the waits differ; the last left stands alone.
    expect(runs.map(run => [ run.start, run.count, run.step.code ]))
      .toStrictEqual([ [ 0, 3, 2 ], [ 3, 1, 15 ], [ 4, 1, 15 ], [ 5, 1, 2 ] ]);
  });

  it('makes no runs of no steps', () =>
  {
    // Arrange: nothing to group.

    // Act.
    const runs = stepRuns([]);

    // Assert.
    expect(runs)
      .toStrictEqual([]);
  });
});

describe('runOfStep', () =>
{
  it('finds the run holding a step, and none past the end', () =>
  {
    // Arrange: a run of three, then a run of one.
    const runs = stepRuns([ { code: 2 }, { code: 2 }, { code: 2 }, { code: 1 } ]);

    // Act.
    const found = [ 0, 2, 3, 4 ].map(step => runOfStep(runs, step));

    // Assert.
    expect(found)
      .toStrictEqual([ 0, 0, 1, -1 ]);
  });
});

describe('route runs', () =>
{
  /**
   * Builds a route: left three times, then down, then a wait.
   * @returns {RmmzMoveRoute} The route.
   */
  const buildRoute = (): RmmzMoveRoute => ({
    list: [ { code: 2 }, { code: 2 }, { code: 2 }, { code: 1 }, { code: 15, parameters: [ 60 ] }, { code: 0 } ],
    repeat: false,
    skippable: true,
    wait: true,
  });

  /**
   * Reads a route's codes, the end step included.
   * @param {RmmzMoveRoute} route The route.
   * @returns {number[]} The codes.
   */
  const codes = (route: RmmzMoveRoute): number[] => route.list.map(step => step.code);

  it('makes a run longer or shorter, never shorter than one, keeping the route\'s options', () =>
  {
    // Arrange.
    const route = buildRoute();
    const [ lefts ] = stepRuns(route.list.slice(0, -1));

    // Act.
    const longer = setRunCount(route, lefts, 5);
    const shorter = setRunCount(route, lefts, 1);
    const none = setRunCount(route, lefts, 0);

    // Assert.
    expect([ codes(longer), codes(shorter), codes(none), longer.skippable ])
      .toStrictEqual([ [ 2, 2, 2, 2, 2, 1, 15, 0 ], [ 2, 1, 15, 0 ], [ 2, 1, 15, 0 ], true ]);
  });

  it('gives every step of a run the new inputs', () =>
  {
    // Arrange: two 60-frame waits in a row.
    const route: RmmzMoveRoute = { ...buildRoute(), list: [ { code: 15, parameters: [ 60 ] }, { code: 15, parameters: [ 60 ] }, { code: 1 }, { code: 0 } ] };
    const [ waits ] = stepRuns(route.list.slice(0, -1));

    // Act.
    const edited = replaceRun(route, waits, { code: 15, parameters: [ 20 ] });

    // Assert.
    expect(edited.list)
      .toStrictEqual([ { code: 15, parameters: [ 20 ] }, { code: 15, parameters: [ 20 ] }, { code: 1 }, { code: 0 } ]);
  });

  it('takes a whole run away', () =>
  {
    // Arrange.
    const route = buildRoute();
    const [ lefts ] = stepRuns(route.list.slice(0, -1));

    // Act.
    const removed = removeRun(route, lefts);

    // Assert.
    expect(codes(removed))
      .toStrictEqual([ 1, 15, 0 ]);
  });

  it('moves a run up past its neighbour, and down past the next', () =>
  {
    // Arrange: runs left ×3, down, wait.
    const route = buildRoute();
    const runs = stepRuns(route.list.slice(0, -1));

    // Act.
    const downUp = moveRun(route, runs, 1, -1);
    const leftsDown = moveRun(route, runs, 0, 1);

    // Assert.
    expect([ codes(downUp), codes(leftsDown) ])
      .toStrictEqual([ [ 1, 2, 2, 2, 15, 0 ], [ 1, 2, 2, 2, 15, 0 ] ]);
  });

  it('leaves a run at either end where it is when moved outward', () =>
  {
    // Arrange.
    const route = buildRoute();
    const runs = stepRuns(route.list.slice(0, -1));

    // Act.
    const first = moveRun(route, runs, 0, -1);
    const last = moveRun(route, runs, runs.length - 1, 1);

    // Assert.
    expect([ first === route, last === route ])
      .toStrictEqual([ true, true ]);
  });

  it('moves a later run down past the one after it', () =>
  {
    // Arrange: runs left ×3, down, wait; down moves below the wait.
    const route = buildRoute();
    const runs = stepRuns(route.list.slice(0, -1));

    // Act.
    const moved = moveRun(route, runs, 1, 1);

    // Assert.
    expect(codes(moved))
      .toStrictEqual([ 2, 2, 2, 15, 1, 0 ]);
  });
});

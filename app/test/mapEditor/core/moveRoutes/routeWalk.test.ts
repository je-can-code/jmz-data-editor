import { describe, expect, it } from 'vitest';
import type { RmmzMoveCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { walkRoute, type Facing, type WalkMap, type Walker } from '../../../../src/mapEditor/core/moveRoutes/routeWalk.ts';

/*
 * The route preview draws where a route takes its walker, so the walk owes the author the engine's own answer, step for
 * step, as rmmz_objects.js has it. Straight steps turn the walker toward their way whether or not they go; diagonal
 * steps go by either corner and turn it only when it faced back against them; a step forward follows the facing and a
 * step backward keeps it. Jumps land wherever they end, walls or not, facing the way of the longer half. Turns follow
 * the engine's quarter-turn tables, and Direction Fix holds the facing through all of it. A wall or the map's edge stops
 * a step; Through walks through walls but never off the map; a looping map wraps instead. A step the map refuses is
 * skipped on a route that skips what it cannot do, and otherwise holds the route there forever, so the walk ends on
 * it. Steps that depend on the dice or the player are marked as guesses, leaving the walker where it stood.
 */
describe('walkRoute', () =>
{
  /**
   * Builds a 5x5 map with walls: a wall tile lets nothing out and nothing in.
   * @param {object} options The walls, as "x,y", and whether the map loops either way.
   * @returns {WalkMap} The map.
   */
  const buildMap = (options: { walls?: readonly string[]; loopsX?: boolean; loopsY?: boolean } = {}): WalkMap =>
  {
    const walls = new Set(options.walls ?? []);
    return {
      width: 5,
      height: 5,
      loopsX: options.loopsX ?? false,
      loopsY: options.loopsY ?? false,
      isPassable: (x: number, y: number) => walls.has(`${x},${y}`) === false,
    };
  };

  /**
   * Builds a walker.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {Partial<Walker>} rest Its facing and settings, down and off unless given.
   * @returns {Walker} The walker.
   */
  const walker = (x: number, y: number, rest: Partial<Walker> = {}): Walker => ({ x, y, facing: 2, directionFix: false, through: false, ...rest });

  /**
   * Builds steps from their codes, a jump's offset when given.
   * @param {...(number | readonly [ number, number, number ])} codes The codes, or [14, dx, dy] for a jump.
   * @returns {RmmzMoveCommand[]} The steps.
   */
  const steps = (codes: readonly (number | readonly [ number, number, number ])[]): RmmzMoveCommand[] =>
  {
    return codes.map(code => (typeof code === 'number' ? { code } : { code: code[0], parameters: [ code[1], code[2] ] }));
  };

  /**
   * Reads where each step left the walker, as "x,y facing".
   * @param {ReturnType<typeof walkRoute>} walk The walk.
   * @returns {string[]} One entry per step taken.
   */
  const trail = (walk: ReturnType<typeof walkRoute>): string[] =>
  {
    return walk.steps.map(step => `${step.to.x},${step.to.y} ${step.facing}`);
  };

  it('walks straight steps, facing the way each goes', () =>
  {
    // Arrange: down, right, up and left from the middle.
    const route = steps([ 1, 3, 4, 2 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap(), false);

    // Assert.
    expect([ trail(walk), walk.steps.map(step => step.kind), walk.stuck ])
      .toStrictEqual([ [ '2,3 2', '3,3 6', '3,2 8', '2,2 4' ], [ 'move', 'move', 'move', 'move' ], false ]);
  });

  it('holds the route on a wall it cannot skip, turned toward it, taking nothing after', () =>
  {
    // Arrange: a wall right of the walker, then a step down that never comes.
    const route = steps([ 3, 1 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap({ walls: [ '3,2' ] }), false);

    // Assert.
    expect([ trail(walk), walk.steps[0].blocked, walk.stuck, walk.end ])
      .toStrictEqual([ [ '2,2 6' ], { x: 3, y: 2 }, true, walker(2, 2, { facing: 6 }) ]);
  });

  it('skips a wall on a route that skips what it cannot do, and goes on', () =>
  {
    // Arrange.
    const route = steps([ 3, 1 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap({ walls: [ '3,2' ] }), true);

    // Assert.
    expect([ trail(walk), walk.stuck ])
      .toStrictEqual([ [ '2,2 6', '2,3 2' ], false ]);
  });

  it('stops at the map\'s edge', () =>
  {
    // Arrange: the walker stands on the left edge.
    const route = steps([ 2 ]);

    // Act.
    const walk = walkRoute(walker(0, 2), route, buildMap(), false);

    // Assert.
    expect([ walk.steps[0].blocked, walk.stuck ])
      .toStrictEqual([ { x: -1, y: 2 }, true ]);
  });

  it('walks through walls with Through on, never off the map, and is stopped again once it is off', () =>
  {
    // Arrange: walls right of the walker and below where it lands; Through goes off before the step down.
    const route = steps([ 3, 3, 3, 38, 1 ]);

    // Act.
    const walk = walkRoute(walker(2, 2, { through: true }), route, buildMap({ walls: [ '3,2', '4,3' ] }), true);

    // Assert: through the wall to the edge, refused off it, then the wall below stops it.
    expect([ trail(walk), walk.steps.map(step => step.blocked) ])
      .toStrictEqual([
        [ '3,2 6', '4,2 6', '4,2 6', '4,2 6', '4,2 2' ],
        [ null, null, { x: 5, y: 2 }, null, { x: 4, y: 3 } ],
      ]);
  });

  it('turns Through on partway, from a step', () =>
  {
    // Arrange: a wall right of the walker.
    const route = steps([ 37, 3 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap({ walls: [ '3,2' ] }), false);

    // Assert.
    expect([ trail(walk), walk.end.through ])
      .toStrictEqual([ [ '2,2 2', '3,2 6' ], true ]);
  });

  it('wraps around a map that loops across, and stops at the edge of one that does not', () =>
  {
    // Arrange: the walker on the right edge, stepping right.
    const route = steps([ 3 ]);

    // Act.
    const looped = walkRoute(walker(4, 2), route, buildMap({ loopsX: true }), false);
    const edged = walkRoute(walker(4, 2), route, buildMap({ loopsY: true }), false);

    // Assert.
    expect([ trail(looped), edged.stuck ])
      .toStrictEqual([ [ '0,2 6' ], true ]);
  });

  it('wraps around a map that loops up and down', () =>
  {
    // Arrange: the walker on the bottom edge, stepping down.
    const route = steps([ 1 ]);

    // Act.
    const walk = walkRoute(walker(2, 4), route, buildMap({ loopsY: true }), false);

    // Assert.
    expect(trail(walk))
      .toStrictEqual([ '2,0 2' ]);
  });

  it('turns on a diagonal step only when facing back against either half of it', () =>
  {
    // Arrange: a step lower right, facing each way in turn.
    const facings: Facing[] = [ 2, 4, 6, 8 ];

    // Act.
    const after = facings.map(facing => walkRoute(walker(1, 1, { facing }), steps([ 6 ]), buildMap(), false).end);

    // Assert: facing left turns right, facing up turns down; the rest keep their facing.
    expect(after.map(end => `${end.x},${end.y} ${end.facing}`))
      .toStrictEqual([ '2,2 2', '2,2 6', '2,2 6', '2,2 2' ]);
  });

  it('steps diagonally by the second corner when the first is walled off', () =>
  {
    // Arrange: the tile below is a wall, the tile to the right is open.
    const route = steps([ 6 ]);

    // Act.
    const walk = walkRoute(walker(1, 1), route, buildMap({ walls: [ '1,2' ] }), false);

    // Assert.
    expect([ trail(walk), walk.steps[0].blocked ])
      .toStrictEqual([ [ '2,2 2' ], null ]);
  });

  it('refuses a diagonal step with both corners walled off', () =>
  {
    // Arrange: the tiles below and to the right are walls.
    const route = steps([ 6 ]);

    // Act.
    const walk = walkRoute(walker(1, 1, { facing: 4 }), route, buildMap({ walls: [ '1,2', '2,1' ] }), false);

    // Assert: it stays, turned right all the same, and the route holds.
    expect([ trail(walk), walk.steps[0].blocked, walk.stuck ])
      .toStrictEqual([ [ '1,1 6' ], { x: 2, y: 2 }, true ]);
  });

  it('steps forward the way it faces, and backward without turning', () =>
  {
    // Arrange: facing right.
    const route = steps([ 12, 13, 13 ]);

    // Act.
    const walk = walkRoute(walker(2, 2, { facing: 6 }), route, buildMap(), false);

    // Assert.
    expect([ trail(walk), walk.end.directionFix ])
      .toStrictEqual([ [ '3,2 6', '2,2 6', '1,2 6' ], false ]);
  });

  it('jumps over walls, facing the way of the longer half of the leap', () =>
  {
    // Arrange: a wall between the walker and where it lands.
    const route = steps([ [ 14, 2, 1 ], [ 14, -1, -2 ], [ 14, 1, 1 ], [ 14, 0, 0 ], [ 14, -2, 1 ] ]);

    // Act.
    const walk = walkRoute(walker(1, 1, { facing: 8 }), route, buildMap({ walls: [ '2,1' ] }), false);

    // Assert: right faces right, up faces up, an even leap faces up or down, a leap on the spot keeps the facing, and a
    // leap left faces left.
    expect([ trail(walk), walk.steps.map(step => step.kind) ])
      .toStrictEqual([ [ '3,2 6', '2,0 8', '3,1 2', '3,1 2', '1,2 4' ], [ 'jump', 'jump', 'jump', 'jump', 'jump' ] ]);
  });

  it('reads a jump without its offsets as a leap on the spot', () =>
  {
    // Arrange: a jump step stored with no parameters.
    const route: RmmzMoveCommand[] = [ { code: 14 } ];

    // Act.
    const walk = walkRoute(walker(1, 1, { facing: 4 }), route, buildMap(), false);

    // Assert.
    expect(trail(walk))
      .toStrictEqual([ '1,1 4' ]);
  });

  it('turns to each fixed facing, and by quarter and half turns as the engine\'s tables say', () =>
  {
    // Arrange: turn down, left, right, up, then quarter right, quarter left and half.
    const route = steps([ 16, 17, 18, 19, 20, 20, 21, 22 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap(), false);

    // Assert: up turned a quarter right faces right, then down; a quarter left from down faces right; half faces left.
    expect([ walk.steps.map(step => step.facing), walk.steps.map(step => step.kind) ])
      .toStrictEqual([ [ 2, 4, 6, 8, 6, 2, 6, 4 ], [ 'turn', 'turn', 'turn', 'turn', 'turn', 'turn', 'turn', 'turn' ] ]);
  });

  it('holds the facing through turns and steps while Direction Fix is on, and lets it go once it is off', () =>
  {
    // Arrange: fix on, turn left, step right, fix off, turn left.
    const route = steps([ 35, 17, 3, 36, 17 ]);

    // Act.
    const walk = walkRoute(walker(2, 2), route, buildMap(), false);

    // Assert.
    expect(trail(walk))
      .toStrictEqual([ '2,2 2', '2,2 2', '3,2 2', '3,2 2', '3,2 4' ]);
  });

  it('marks the steps that depend on the dice or the player as guesses, leaving the walker where it stood', () =>
  {
    // Arrange: every move and turn that is random or follows the player, then a step down that is known.
    const route = steps([ 9, 10, 11, 23, 24, 25, 26, 1 ]);

    // Act.
    const walk = walkRoute(walker(2, 2, { facing: 4 }), route, buildMap(), false);

    // Assert.
    expect([ walk.steps.map(step => step.kind), trail(walk).at(-2), trail(walk).at(-1) ])
      .toStrictEqual([ [ 'guess', 'guess', 'guess', 'guess', 'guess', 'guess', 'guess', 'move' ], '2,2 4', '2,3 2' ]);
  });

  it('leaves the walker as it stands through waits and settings that change nothing it walks by', () =>
  {
    // Arrange: a wait, walking animation on, a speed change.
    const route: RmmzMoveCommand[] = [ { code: 15, parameters: [ 60 ] }, { code: 31 }, { code: 29, parameters: [ 5 ] } ];

    // Act.
    const walk = walkRoute(walker(2, 2, { facing: 8 }), route, buildMap(), false);

    // Assert.
    expect([ walk.steps.map(step => step.kind), walk.end ])
      .toStrictEqual([ [ 'other', 'other', 'other' ], walker(2, 2, { facing: 8 }) ]);
  });

  it('takes no steps for an empty route', () =>
  {
    // Arrange: nothing to walk.

    // Act.
    const walk = walkRoute(walker(2, 2), [], buildMap(), false);

    // Assert.
    expect(walk)
      .toStrictEqual({ steps: [], end: walker(2, 2), stuck: false });
  });
});

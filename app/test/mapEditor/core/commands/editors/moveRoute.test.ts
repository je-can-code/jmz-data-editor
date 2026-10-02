import { describe, expect, it } from 'vitest';
import {
  describeMoveStep,
  insertStep,
  MOVE_STEP_KINDS,
  moveRouteLines,
  moveStep,
  moveStepKind,
  newMoveRoute,
  newMoveStep,
  parseSetMovementRoute,
  removeStep,
  replaceStep,
  routeSteps,
  setRouteOption,
  setStepParameter,
  writeSetMovementRoute,
} from '../../../../../src/mapEditor/core/commands/editors/moveRoute.ts';
import type { RmmzEventCommand, RmmzMoveRoute } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A move route is a list of steps ending in an end step, plus three options. The same route editor serves Set
 * Movement Route and an event page's own movement, so its operations work on the route alone: they never touch
 * the end step, and they keep each step's and the route's own layout (routes arrive with their keys in either of
 * two orders). Set Movement Route also writes one display line per step after itself; those are always rebuilt
 * from the route, so a command whose lines are anything else reads as null.
 */
describe('move route', () =>
{
  /**
   * A route in the order most of the game stores routes: a move, a jump, a wait, then the end.
   * @returns {RmmzMoveRoute} The route.
   */
  const route = (): RmmzMoveRoute => ({
    list: [
      { code: 1, indent: null },
      { code: 14, parameters: [ 1, -2 ], indent: null },
      { code: 15, parameters: [ 30 ] },
      { code: 0 },
    ],
    repeat: false,
    skippable: true,
    wait: true,
  });

  /**
   * Builds a Set Movement Route command with its lines.
   * @param {RmmzMoveRoute} moveRoute The route.
   * @returns {{ command: RmmzEventCommand, continuation: RmmzEventCommand[] }} The command and its lines.
   */
  const setMovementRoute = (moveRoute: RmmzMoveRoute) => ({
    command: { code: 205, indent: 2, parameters: [ -1, moveRoute as never ] } as RmmzEventCommand,
    continuation: moveRoute.list.slice(0, -1).map(step => ({ code: 505, indent: 2, parameters: [ step as never ] }) as RmmzEventCommand),
  });

  describe('newMoveStep and moveStepKind', () =>
  {
    it('build steps as MZ writes them: an empty indent, and inputs at their defaults when there are any', () =>
    {
      // Arrange: a plain step, a jump, a sound and a code MZ never writes.

      // Act.
      const steps = [ newMoveStep(4), newMoveStep(14), newMoveStep(44), newMoveStep(99) ];

      // Assert.
      expect(JSON.stringify(steps))
        .toBe(JSON.stringify([
          { code: 4, indent: null },
          { code: 14, parameters: [ 0, 0 ], indent: null },
          { code: 44, parameters: [ { name: '', volume: 90, pitch: 100, pan: 0 } ], indent: null },
          { code: 99, indent: null },
        ]));
    });

    it('know all forty-five steps MZ offers, and no others', () =>
    {
      // Arrange: every code from the end step to one past the last.

      // Act.
      const known = Array.from({ length: 47 }, (_, code) => moveStepKind(code) !== null);

      // Assert.
      expect([ known.filter(Boolean).length, known[0], known[46], MOVE_STEP_KINDS.map(kind => kind.code).join(',') === Array.from({ length: 45 }, (_, index) => index + 1).join(',') ])
        .toStrictEqual([ 45, false, false, true ]);
    });
  });

  describe('newMoveRoute', () =>
  {
    it('starts a command\'s route waiting and once, and a page\'s repeating, each ended as MZ ends it', () =>
    {
      // Arrange: both places a route lives.

      // Act.
      const routes = [ newMoveRoute('command'), newMoveRoute('page') ];

      // Assert.
      expect(JSON.stringify(routes))
        .toBe(JSON.stringify([
          { list: [ { code: 0 } ], repeat: false, skippable: false, wait: true },
          { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false },
        ]));
    });
  });

  describe('route operations', () =>
  {
    it('insert, remove, move and replace steps without touching the end step', () =>
    {
      // Arrange.
      const original = route();

      // Act.
      const inserted = routeSteps(insertStep(original, 1, newMoveStep(16))).map(step => step.code);
      const clamped = routeSteps(insertStep(original, 99, newMoveStep(16))).map(step => step.code);
      const removed = routeSteps(removeStep(original, 0)).map(step => step.code);
      const moved = routeSteps(moveStep(original, 2, 0)).map(step => step.code);
      const replaced = routeSteps(replaceStep(original, 1, newMoveStep(3))).map(step => step.code);
      const endKept = [ insertStep(original, 0, newMoveStep(2)), removeStep(original, 1) ].map(each => each.list.at(-1));

      // Assert.
      expect([ inserted, clamped, removed, moved, replaced, endKept ])
        .toStrictEqual([ [ 1, 16, 14, 15 ], [ 1, 14, 15, 16 ], [ 14, 15 ], [ 15, 1, 14 ], [ 1, 3, 15 ], [ { code: 0 }, { code: 0 } ] ]);
    });

    it('keep the route\'s keys in the order it arrived with', () =>
    {
      // Arrange: the other order the game stores routes in.
      const reordered: RmmzMoveRoute = { repeat: true, skippable: false, wait: false, list: [ { code: 0 } ] };

      // Act.
      const changed = setRouteOption(insertStep(reordered, 0, newMoveStep(1)), 'wait', true);

      // Assert.
      expect(Object.keys(changed))
        .toStrictEqual([ 'repeat', 'skippable', 'wait', 'list' ]);
    });

    it('leave the route alone for a move to the same place or a place with no step', () =>
    {
      // Arrange.
      const original = route();

      // Act.
      const results = [ moveStep(original, 1, 1), moveStep(original, 0, 3), moveStep(original, -1, 0) ];

      // Assert.
      expect(results)
        .toStrictEqual([ original, original, original ]);
    });

    it('treat a list with no end step as all steps, and keep it without one', () =>
    {
      // Arrange: a list a tool left unended.
      const unended: RmmzMoveRoute = { list: [ { code: 1 }, { code: 2 } ], repeat: false, skippable: false, wait: false };

      // Act.
      const grown = insertStep(unended, 2, newMoveStep(3));

      // Assert.
      expect(grown.list.map(step => step.code))
        .toStrictEqual([ 1, 2, 3 ]);
    });

    it('change one input of a step, keeping its layout, and start inputs for a step that had none', () =>
    {
      // Arrange.
      const jump = { code: 14, parameters: [ 1, -2 ], indent: null };
      const bare = { code: 15 };

      // Act.
      const changed = [ setStepParameter(jump, 1, 5), setStepParameter(bare, 0, 20) ];

      // Assert.
      expect(JSON.stringify(changed))
        .toBe(JSON.stringify([ { code: 14, parameters: [ 1, 5 ], indent: null }, { code: 15, parameters: [ 20 ] } ]));
    });
  });

  describe('describeMoveStep', () =>
  {
    it('reads each step the way MZ\'s route list shows it', () =>
    {
      // Arrange: a step of every shape of description.
      const steps = [
        { code: 4 },
        { code: 14, parameters: [ 1, -2 ] },
        { code: 14, parameters: [ 0, 0 ] },
        { code: 15, parameters: [ 30 ] },
        { code: 27, parameters: [ 12 ] },
        { code: 29, parameters: [ 5 ] },
        { code: 30, parameters: [ 9 ] },
        { code: 41, parameters: [ 'Actor1', 3 ] },
        { code: 41, parameters: [ '', 0 ] },
        { code: 42, parameters: [ 128 ] },
        { code: 43, parameters: [ 1 ] },
        { code: 44, parameters: [ { name: 'Door1', volume: 90, pitch: 100, pan: 0 } ] },
        { code: 44, parameters: [ { name: '', volume: 90, pitch: 100, pan: 0 } ] },
        { code: 44, parameters: [ 'broken' ] },
        { code: 45, parameters: [ 'this.jump(0, 0);' ] },
        { code: 15 },
        { code: 77 },
      ];

      // Act.
      const described = steps.map(describeMoveStep);

      // Assert.
      expect(described)
        .toStrictEqual([
          'Move Up',
          'Jump: +1, -2',
          'Jump: +0, +0',
          'Wait: 30 frames',
          'Switch ON: #0012',
          'Change Speed: 5: x2 Faster',
          'Change Frequency: 9',
          'Change Image: Actor1 (3)',
          'Change Image: None',
          'Change Opacity: 128',
          'Change Blend Mode: Additive',
          'Play SE: Door1 (90, 100, 0)',
          'Play SE: None (90, 100, 0)',
          'Play SE: ',
          'Script: this.jump(0, 0);',
          'Wait: undefined frames',
          'Step 77',
        ]);
    });
  });

  describe('parseSetMovementRoute', () =>
  {
    it('reads who moves and the route', () =>
    {
      // Arrange.
      const { command, continuation } = setMovementRoute(route());

      // Act.
      const model = parseSetMovementRoute(command, continuation);

      // Assert.
      expect(model)
        .toStrictEqual({ characterId: -1, route: route() });
    });

    it('refuses lines that are not exactly the route\'s steps', () =>
    {
      // Arrange: a line missing, and a line changed.
      const { command, continuation } = setMovementRoute(route());
      const changed = continuation.map((line, index) => (index === 1 ? { ...line, parameters: [ { code: 14, parameters: [ 9, 9 ], indent: null } ] } : line));

      // Act.
      const models = [ parseSetMovementRoute(command, continuation.slice(1)), parseSetMovementRoute(command, changed) ];

      // Assert.
      expect(models)
        .toStrictEqual([ null, null ]);
    });

    it('refuses a route MZ never writes, or another code', () =>
    {
      // Arrange: each differs from a valid route in one way.
      const shapes: unknown[] = [
        { ...route(), extra: 1 },
        { ...route(), list: [] },
        { ...route(), list: [ { code: 1 } ] },
        { ...route(), list: [ { code: 'one' }, { code: 0 } ] },
        { ...route(), repeat: 'no' },
        { ...route(), skippable: 1 },
        { ...route(), wait: null },
        [ 1, 2 ],
      ];

      // Act.
      const models = shapes.map(shape => parseSetMovementRoute({ code: 205, indent: 0, parameters: [ 0, shape as never ] }, []));
      const wrongCode = parseSetMovementRoute({ code: 206, indent: 0, parameters: [ 0, route() as never ] }, []);
      const wrongCharacter = parseSetMovementRoute({ code: 205, indent: 0, parameters: [ 'player', route() as never ] }, []);

      // Assert.
      expect([ ...models, wrongCode, wrongCharacter ])
        .toStrictEqual([ ...shapes.map(() => null), null, null ]);
    });
  });

  describe('writeSetMovementRoute and moveRouteLines', () =>
  {
    it('write the command and rebuild one line per step at its indent', () =>
    {
      // Arrange.
      const { command } = setMovementRoute(route());
      const changed = removeStep(route(), 0);

      // Act.
      const written = writeSetMovementRoute(command, { characterId: 5, route: changed });

      // Assert.
      expect(JSON.stringify(written))
        .toBe(JSON.stringify({
          command: { code: 205, indent: 2, parameters: [ 5, changed ] },
          continuation: moveRouteLines(changed, 2),
        }));
      expect(written.continuation.map(line => line.parameters[0]))
        .toStrictEqual(routeSteps(changed));
    });
  });
});

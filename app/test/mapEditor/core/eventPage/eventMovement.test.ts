import { describe, expect, it } from 'vitest';
import {
  MOVE_TYPE_OPTIONS,
  parseEventMovement,
  usesCustomRoute,
  withMoveFrequency,
  withMoveRoute,
  withMoveSpeed,
  withMoveType,
  writeEventMovement,
  type EventMovementFields,
} from '../../../../src/mapEditor/core/eventPage/eventMovement.ts';
import type { RmmzMoveRoute } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A page's own movement is four fields: how it moves, its speed and frequency, and a route that only Custom ever
 * reads. Each setter below changes exactly the field it names, and in particular the move type setter never
 * touches the route either way it switches, so a page can be flipped between Custom and anything else without its
 * prepared route being reset or discarded.
 */
describe('event page movement', () =>
{
  const customRoute = (): RmmzMoveRoute =>
  {
    return { list: [ { code: 1, indent: null }, { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false };
  };

  const defaultRoute = (): RmmzMoveRoute =>
  {
    return { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false };
  };

  const fields = (overrides: Partial<EventMovementFields> = {}): EventMovementFields => ({
    moveType: 0,
    moveSpeed: 3,
    moveFrequency: 3,
    moveRoute: defaultRoute(),
    ...overrides,
  });

  describe('usesCustomRoute', () =>
  {
    it('reads true only for Custom, the fourth of the four move types', () =>
    {
      // Arrange: every move type MZ offers, in order.

      // Act.
      const results = [ 0, 1, 2, 3 ].map(usesCustomRoute);

      // Assert.
      expect(results)
        .toStrictEqual([ false, false, false, true ]);
    });
  });

  describe('withMoveType', () =>
  {
    it('changes the type, leaving an already-populated route exactly as it was', () =>
    {
      // Arrange: a page carrying a real route, switched away from Custom.
      const start = fields({ moveType: 3, moveRoute: customRoute() });

      // Act.
      const switched = withMoveType(start, 0);

      // Assert.
      expect(switched)
        .toStrictEqual({ ...start, moveType: 0 });
    });

    it('switches back to Custom without touching the default route it finds there, the near miss of the case above', () =>
    {
      // Arrange: nothing prepared yet, switched the other way.
      const start = fields({ moveType: 0, moveRoute: defaultRoute() });

      // Act.
      const switched = withMoveType(start, 3);

      // Assert.
      expect(switched)
        .toStrictEqual({ ...start, moveType: 3 });
    });
  });

  describe('withMoveSpeed and withMoveFrequency', () =>
  {
    it('change only the one field each names', () =>
    {
      // Arrange.
      const start = fields();

      // Act.
      const sped = withMoveSpeed(start, 5);
      const often = withMoveFrequency(start, 1);

      // Assert.
      expect([ sped, often ])
        .toStrictEqual([ { ...start, moveSpeed: 5 }, { ...start, moveFrequency: 1 } ]);
    });
  });

  describe('withMoveRoute', () =>
  {
    it('replaces the route, leaving the other three fields untouched', () =>
    {
      // Arrange.
      const start = fields({ moveType: 3 });
      const route = customRoute();

      // Act.
      const replaced = withMoveRoute(start, route);

      // Assert.
      expect(replaced)
        .toStrictEqual({ ...start, moveRoute: route });
    });
  });

  describe('parseEventMovement and writeEventMovement', () =>
  {
    it('round-trip all four fields for every move type', () =>
    {
      // Arrange: one fixture per move type, Custom carrying a real route and the rest the default one.
      const fixtures = [ 0, 1, 2, 3 ].map(moveType => fields({ moveType, moveRoute: moveType === 3 ? customRoute() : defaultRoute() }));

      // Act.
      const written = fixtures.map(each => writeEventMovement(parseEventMovement(each)));

      // Assert.
      expect(written)
        .toStrictEqual(fixtures);
    });
  });

  describe('MOVE_TYPE_OPTIONS', () =>
  {
    it('offers Fixed, Random, Approach and Custom, in RMMZ\'s own order and numbering', () =>
    {
      // Arrange: the engine's own move-type codes.

      // Act.
      const values = MOVE_TYPE_OPTIONS.map(option => option.value);
      const labels = MOVE_TYPE_OPTIONS.map(option => option.label);

      // Assert.
      expect(values)
        .toStrictEqual([ 0, 1, 2, 3 ]);
      expect(labels)
        .toStrictEqual([ 'Fixed', 'Random', 'Approach', 'Custom' ]);
    });
  });
});

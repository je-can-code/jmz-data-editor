import { describe, expect, it } from 'vitest';
import { numpadStep } from '../../../../src/mapEditor/core/moveRoutes/routeKeys.ts';

/*
 * The number pad types a route the way the move pad is laid out: each key walks the way it sits from 5, and 5 waits;
 * with Shift held, the four straight keys turn instead. Only the pad's own keys count, so the row of digits above the
 * letters keeps typing digits, and any other key types no step at all.
 */
describe('numpadStep', () =>
{
  it('walks the way each key sits from the middle, and waits on 5', () =>
  {
    // Arrange: every key of the pad, 1 through 9.
    const keys = [ 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9' ];

    // Act.
    const steps = keys.map(key => numpadStep(key, false));

    // Assert: lower left, down, lower right, left, wait, right, upper left, up, upper right.
    expect(steps)
      .toStrictEqual([ 5, 1, 6, 2, 15, 3, 7, 4, 8 ]);
  });

  it('turns with Shift held on the four straight keys, and types nothing on the others', () =>
  {
    // Arrange: the straight keys, then a corner and the middle.
    const keys = [ 'Numpad2', 'Numpad4', 'Numpad6', 'Numpad8', 'Numpad7', 'Numpad5' ];

    // Act.
    const steps = keys.map(key => numpadStep(key, true));

    // Assert.
    expect(steps)
      .toStrictEqual([ 16, 17, 18, 19, null, null ]);
  });

  it('types nothing for the digit row or any other key', () =>
  {
    // Arrange: the digit 8 above the letters, a letter, and the pad's own Enter.
    const keys = [ 'Digit8', 'KeyW', 'NumpadEnter' ];

    // Act.
    const steps = keys.map(key => numpadStep(key, false));

    // Assert.
    expect(steps)
      .toStrictEqual([ null, null, null ]);
  });
});

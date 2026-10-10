/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RoutePads } from '../../../../src/mapEditor/views/moveRoute/RoutePads.tsx';

/*
 * The pads put every step a route can take where it can be found at a glance, and each key owes the author exactly the
 * step it is named for, by MZ's own name: the move pad laid out as the number pad is, its middle waiting; the moves that
 * go no fixed way beside it; the turn pad's arrows, quarter and half turns and the turns left to chance; every setting
 * as an ON and OFF pair; and the settings that take a value. A key the number pad also types says so when hovered.
 */
describe('RoutePads', () =>
{
  /**
   * Renders the pads and presses keys by name.
   * @param {readonly string[]} names The keys to press, in order.
   * @returns {number[]} The steps they added.
   */
  const press = (names: readonly string[]): number[] =>
  {
    const onAdd = vi.fn();
    render(<RoutePads onAdd={onAdd}/>);
    names.forEach(name => fireEvent.click(screen.getByRole('button', { name })));
    return onAdd.mock.calls.map(([ code ]) => code as number);
  };

  it('adds the step each key of the move pad walks, the middle waiting', () =>
  {
    // Arrange: the pad's nine keys, row by row.
    const names = [
      'Move Upper Left', 'Move Up', 'Move Upper Right',
      'Move Left', 'Wait', 'Move Right',
      'Move Lower Left', 'Move Down', 'Move Lower Right',
    ];

    // Act.
    const added = press(names);

    // Assert.
    expect(added)
      .toStrictEqual([ 7, 4, 8, 2, 15, 3, 5, 1, 6 ]);
  });

  it('adds the moves that go no fixed way', () =>
  {
    // Arrange.
    const names = [ 'Move at Random', 'Move toward Player', 'Move away from Player', '1 Step Forward', '1 Step Backward', 'Jump' ];

    // Act.
    const added = press(names);

    // Assert.
    expect(added)
      .toStrictEqual([ 9, 10, 11, 12, 13, 14 ]);
  });

  it('adds every turn, on the pad and beside it', () =>
  {
    // Arrange: the pad's nine keys row by row, then the two beside it.
    const names = [
      'Turn 90° Left', 'Turn Up', 'Turn 90° Right',
      'Turn Left', 'Turn 180°', 'Turn Right',
      'Turn 90° Right or Left', 'Turn Down', 'Turn at Random',
      'Turn toward Player', 'Turn away from Player',
    ];

    // Act.
    const added = press(names);

    // Assert.
    expect(added)
      .toStrictEqual([ 21, 19, 20, 17, 22, 18, 23, 16, 24, 25, 26 ]);
  });

  it('turns each setting on and off', () =>
  {
    // Arrange: every pair, on then off.
    const names = [
      'Walking Animation ON', 'Walking Animation OFF',
      'Stepping Animation ON', 'Stepping Animation OFF',
      'Direction Fix ON', 'Direction Fix OFF',
      'Through ON', 'Through OFF',
      'Transparent ON', 'Transparent OFF',
      'Switch ON', 'Switch OFF',
    ];

    // Act.
    const added = press(names);

    // Assert.
    expect(added)
      .toStrictEqual([ 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 27, 28 ]);
  });

  it('adds the settings that take a value', () =>
  {
    // Arrange.
    const names = [ 'Change Speed', 'Change Frequency', 'Change Opacity', 'Change Blend Mode', 'Change Image', 'Play SE', 'Script' ];

    // Act.
    const added = press(names);

    // Assert.
    expect(added)
      .toStrictEqual([ 29, 30, 42, 43, 41, 44, 45 ]);
  });

  it('names the number pad key that types a step, when hovered', async () =>
  {
    // Arrange.
    render(<RoutePads onAdd={vi.fn()}/>);

    // Act.
    fireEvent.mouseOver(screen.getByRole('button', { name: 'Move Upper Left' }));

    // Assert.
    expect((await screen.findByRole('tooltip')).textContent)
      .toBe('Move Upper Left (numpad 7)');
  });

  it('names only the step for a key the number pad does not type, when hovered', async () =>
  {
    // Arrange.
    render(<RoutePads onAdd={vi.fn()}/>);

    // Act.
    fireEvent.mouseOver(screen.getByRole('button', { name: 'Jump' }));

    // Assert.
    expect((await screen.findByRole('tooltip')).textContent)
      .toBe('Jump');
  });
});

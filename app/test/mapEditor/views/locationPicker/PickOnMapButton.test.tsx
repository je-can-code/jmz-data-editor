/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapLocation } from '../../../../src/mapEditor/core/locations/LocationPicks.ts';
import type { LocationPickerDialogProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx';
import { PickOnMapButton } from '../../../../src/mapEditor/views/locationPicker/PickOnMapButton.tsx';

// the picker itself is proved in its own tests; here it stands in as a line naming where it started and two buttons,
// one picking tile 4, 2 on map 5 and one giving up.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx', () =>
{
  /**
   * Stands in for the picker.
   * @param {LocationPickerDialogProps} props Where it starts, and who hears how it ends.
   * @returns {React.JSX.Element} Where it started, and two ways to end it.
   */
  const LocationPickerDialog = (props: LocationPickerDialogProps) =>
  {
    const { start, onClose } = props;
    return (
      <div role={'dialog'}>
        <span>{`Started on map ${start.mapId} at ${start.x}, ${start.y}`}</span>
        <button type={'button'} onClick={() => onClose({ mapId: 5, x: 4, y: 2 })}>Pick tile 4, 2 on map 5</button>
        <button type={'button'} onClick={() => onClose(null)}>Give up</button>
      </div>
    );
  };

  return { LocationPickerDialog };
});

/*
 * The button is how anything rendered in place, a command's form or a quick panel, offers the location picker, and it
 * owes its owner three things. The picker opens on the place the setting holds now, and only when there is one place
 * to start from: several settings holding different places leave the button unavailable. A place picked is handed
 * over once and closes the picker; giving up closes it and hands over nothing.
 */
describe('PickOnMapButton', () =>
{
  /**
   * Where a transfer to Room of Sacrifice lands.
   */
  const START: MapLocation = { mapId: 322, x: 22, y: 13 };

  it('shows no picker until it is pressed', () =>
  {
    // Arrange: nothing beyond the button, rendered.

    // Act.
    render(<PickOnMapButton start={START} onPick={vi.fn()}/>);

    // Assert.
    expect([ screen.getByRole('button', { name: 'Pick on the map' }) !== null, screen.queryByRole('dialog') ])
      .toStrictEqual([ true, null ]);
  });

  it('opens the picker on the place the setting holds now', () =>
  {
    // Arrange.
    render(<PickOnMapButton start={START} onPick={vi.fn()}/>);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));

    // Assert.
    expect(screen.getByText('Started on map 322 at 22, 13'))
      .toBeInTheDocument();
  });

  it('hands over the place picked once, and closes the picker', () =>
  {
    // Arrange.
    const onPick = vi.fn();
    render(<PickOnMapButton start={START} onPick={onPick}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick tile 4, 2 on map 5' }));

    // Assert.
    expect([ onPick.mock.calls, screen.queryByRole('dialog') ])
      .toStrictEqual([ [ [ { mapId: 5, x: 4, y: 2 } ] ], null ]);
  });

  it('hands over nothing when the author gives up, and closes the picker', () =>
  {
    // Arrange: the picker was open.
    const onPick = vi.fn();
    render(<PickOnMapButton start={START} onPick={onPick}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));
    const opened = screen.queryByRole('dialog') !== null;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Give up' }));

    // Assert.
    expect([ opened, onPick.mock.calls, screen.queryByRole('dialog') ])
      .toStrictEqual([ true, [], null ]);
  });

  it('stays unavailable with no one place to start from', () =>
  {
    // Arrange: nothing beyond the button, given no place.

    // Act.
    render(<PickOnMapButton start={null} onPick={vi.fn()}/>);

    // Assert.
    expect(screen.getByRole('button', { name: 'Pick on the map' }))
      .toBeDisabled();
  });
});

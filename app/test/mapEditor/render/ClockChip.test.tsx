/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowClock } from '../../../src/mapEditor/core/time/WindowClock.ts';
import { partOfDay } from '../../../src/mapEditor/modules/time/timePhases.ts';
import { ClockChip, clockWords, PHASE_MARKS } from '../../../src/mapEditor/render/ClockChip.tsx';

/*
 * The window's clock sits in a map view's bar as a chip naming the time and the part of the day, the way the game's own
 * clock reads, and follows the clock wherever it was moved from. Clicking it opens a slider across the whole day, marked
 * where each part of the day begins: an arrow key moves it a minute, Shift with an arrow an hour, and moving it moves
 * the window's clock, so every map follows. Clicking away closes it.
 */
describe('ClockChip', () =>
{
  describe('clockWords', () =>
  {
    it('names the time on a 24-hour face and the part of the day it falls in', () =>
    {
      // Arrange: 14:00 and a minute before midnight.
      const times = [ 840, 1439 ];

      // Act.
      const words = times.map(minutes => clockWords(minutes, partOfDay));

      // Assert.
      expect(words)
        .toStrictEqual([ '14:00 Afternoon', '23:59 Night' ]);
    });
  });

  describe('PHASE_MARKS', () =>
  {
    it('marks the slider where each part of the day begins', () =>
    {
      // Arrange: the marks as the slider takes them.

      // Act.
      const marks = PHASE_MARKS.map(mark => [ mark.value, mark.label ]);

      // Assert.
      expect(marks)
        .toStrictEqual([ [ 0, '00:00' ], [ 240, '04:00' ], [ 480, '08:00' ], [ 720, '12:00' ], [ 960, '16:00' ], [ 1200, '20:00' ] ]);
    });
  });

  it('names the time and the part of the day, following the clock wherever it was moved from', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay}/>);
    const before = screen.getByTestId('map-clock').textContent;

    // Act: moved from elsewhere, as another view's slider moves it.
    act(() => clock.set(1320));

    // Assert.
    expect([ before, screen.getByTestId('map-clock').textContent ])
      .toStrictEqual([ '14:00 Afternoon', '22:00 Night' ]);
  });

  it('opens a slider across the day when clicked, standing at the clock\'s time', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay}/>);

    // Act.
    fireEvent.click(screen.getByTestId('map-clock'));

    // Assert.
    const slider = screen.getByRole('slider', { name: 'Time of day' });
    expect([ slider.getAttribute('aria-valuemin'), slider.getAttribute('aria-valuemax'), slider.getAttribute('aria-valuenow') ])
      .toStrictEqual([ '0', '1439', '840' ]);
  });

  it('moves the window\'s clock a minute with an arrow key and an hour with Shift held', () =>
  {
    // Arrange: the slider open at 14:00.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay}/>);
    fireEvent.click(screen.getByTestId('map-clock'));
    const slider = screen.getByRole('slider', { name: 'Time of day' });
    const times: number[] = [];

    // Act.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    times.push(clock.time());
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    times.push(clock.time());

    // Assert: a minute on, then an hour on from there.
    expect([ times, screen.getByTestId('map-clock').textContent ])
      .toStrictEqual([ [ 841, 901 ], '15:01 Afternoon' ]);
  });

  it('closes the slider when clicked away from', async () =>
  {
    // Arrange: the slider open.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay}/>);
    fireEvent.click(screen.getByTestId('map-clock'));

    // Act: the backdrop behind the slider clicked, as a click elsewhere on the page lands there.
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement;
    fireEvent.click(backdrop);

    // Assert.
    await act(async () => Promise.resolve());
    expect(screen.queryByRole('slider', { name: 'Time of day' }))
      .toBeNull();
  });
});

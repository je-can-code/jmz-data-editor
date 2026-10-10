/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { SeasonOffer } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import { WindowClock } from '../../../src/mapEditor/core/time/WindowClock.ts';
import { seasonsOf } from '../../../src/mapEditor/modules/time/timeModule.ts';
import { partOfDay } from '../../../src/mapEditor/modules/time/timePhases.ts';
import { ClockChip, clockWords, dateCaption, PHASE_MARKS, shownSeason } from '../../../src/mapEditor/render/ClockChip.tsx';

/*
 * The window's clock sits in a map view's bar as a chip naming the time and the part of the day, the way the game's own
 * clock reads, and the season when the game's calendar has them, and follows the clock wherever it was moved from.
 * Clicking it opens a slider across the whole day, marked where each part of the day begins: an arrow key moves it a
 * minute, Shift with an arrow an hour, and moving it moves the window's clock, so every map follows. Beneath it, a
 * calendar with seasons offers a button for each, the one shown pressed, with the date it brings: the season the game
 * starts in, and its starting date, until the author picks another, which moves the window's clock to it. Clicking the
 * season already shown changes nothing. Clicking away closes it all.
 */
describe('ClockChip', () =>
{
  /**
   * Chef Adventure's seasons, as J-TIME's module offers them: a new game on 16 December 2026, in Winter.
   */
  const SEASONS: SeasonOffer = seasonsOf({ seconds: 0, days: 16, months: 12, years: 2026 });

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

    it('names the season after the time when the clock has one', () =>
    {
      // Arrange: 22:00 in Winter.

      // Act.
      const words = clockWords(1320, partOfDay, 'Winter');

      // Assert.
      expect(words)
        .toBe('22:00 Night · Winter');
    });
  });

  describe('shownSeason and dateCaption', () =>
  {
    it('shows the season picked, or the one the game starts in while none is, or one the calendar has no name for', () =>
    {
      // Arrange: Summer picked, none picked, and a fifth season, from a game that numbered more.
      const picked = [ 1, null, 4 ];

      // Act.
      const shown = picked.map(season => shownSeason(season, SEASONS));

      // Assert.
      expect(shown)
        .toStrictEqual([ 1, 3, 3 ]);
    });

    it('names the date each season brings, saying when it is the day a new game starts', () =>
    {
      // Arrange: Summer, and Winter, the season the game starts in.
      const seasons = [ 1, 3 ];

      // Act.
      const captions = seasons.map(season => dateCaption(season, SEASONS));

      // Assert.
      expect(captions)
        .toStrictEqual([ 'June 16, 2027.', 'December 16, 2026, the day a new game starts.' ]);
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

  it('names the season the game starts in until one is picked, following the clock wherever it was picked', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay} seasons={SEASONS}/>);
    const before = screen.getByTestId('map-clock').textContent;

    // Act: Spring picked from elsewhere, as another view's chip picks it.
    act(() => clock.chooseSeason(0));

    // Assert.
    expect([ before, screen.getByTestId('map-clock').textContent ])
      .toStrictEqual([ '14:00 Afternoon · Winter', '14:00 Afternoon · Spring' ]);
  });

  it('opens a button for each season, the one shown pressed, with the date it brings', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay} seasons={SEASONS}/>);

    // Act.
    fireEvent.click(screen.getByTestId('map-clock'));

    // Assert.
    const buttons = within(screen.getByRole('group', { name: 'Season' })).getAllByRole('button');
    expect([ buttons.map(button => [ button.textContent, button.getAttribute('aria-pressed') ]), screen.getByTestId('map-clock-date').textContent ])
      .toStrictEqual([
        [ [ 'Spring', 'false' ], [ 'Summer', 'false' ], [ 'Autumn', 'false' ], [ 'Winter', 'true' ] ],
        'December 16, 2026, the day a new game starts.',
      ]);
  });

  it('moves the window\'s clock to the season clicked, naming the date it brings', () =>
  {
    // Arrange: the seasons open.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay} seasons={SEASONS}/>);
    fireEvent.click(screen.getByTestId('map-clock'));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Summer' }));

    // Assert.
    expect([ clock.season(), screen.getByTestId('map-clock').textContent, screen.getByTestId('map-clock-date').textContent ])
      .toStrictEqual([ 1, '14:00 Afternoon · Summer', 'June 16, 2027.' ]);
  });

  it('changes nothing when the season already shown is clicked again', () =>
  {
    // Arrange: the seasons open, Winter shown, the game's own; the clock's moves counted.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay} seasons={SEASONS}/>);
    fireEvent.click(screen.getByTestId('map-clock'));
    let moves = 0;
    clock.subscribe(() =>
    {
      moves += 1;
    });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Winter' }));

    // Assert.
    expect([ clock.season(), moves ])
      .toStrictEqual([ null, 0 ]);
  });

  it('offers no season for a clock whose calendar has none', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    render(<ClockChip clock={clock} partOfDay={partOfDay}/>);

    // Act.
    fireEvent.click(screen.getByTestId('map-clock'));

    // Assert.
    expect([ screen.queryByRole('group', { name: 'Season' }), screen.getByTestId('map-clock').textContent ])
      .toStrictEqual([ null, '14:00 Afternoon' ]);
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

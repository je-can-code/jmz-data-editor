/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ConfigRead, OnDemandConfig, SkyCondition } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import { WindowClock } from '../../../src/mapEditor/core/time/WindowClock.ts';
import { skyOfferFor } from '../../../src/mapEditor/modules/weather/skyWeather.ts';
import { NO_SKY, pickCondition, SkyChip, skyWords } from '../../../src/mapEditor/render/SkyChip.tsx';
import { CHEF_START, CHEF_WEATHER_CONFIG } from '../support/skyFixtures.ts';

/*
 * The window's sky sits in a map view's bar beside the clock, as a chip naming the condition and the strength picked, by
 * the plugin's own names, or that no sky weather is picked, which it is not until the author picks one, since a new
 * game's sky is random. It follows the clock wherever the sky was picked from. Nothing is read for it until it opens:
 * then the project's sky is asked for, the picker saying so while it is read, and lists every condition, those the
 * clock's moment rules out greyed and said to be, with a button for each strength, those the picked condition is never
 * at greyed too, and all of them while none is picked. Picking a condition picks it at the strength picked before,
 * pulled to the nearest it has, or its usual one; picking a strength keeps the condition. Beneath them it says what the
 * sky shows at the clock's hour and season, and a button picks no sky again, offered only while one is picked.
 */
describe('SkyChip', () =>
{
  /**
   * J-Weather's config as the window holds it: unread until the test reads it in, which its listeners hear, noting how
   * often it was asked for.
   * @returns {{ config: OnDemandConfig, arrive: (read: ConfigRead) => void, asked: () => number }} The config.
   */
  const heldConfig = () =>
  {
    const listeners = new Set<() => void>();
    let read: ConfigRead | undefined;
    let asked = 0;
    const config: OnDemandConfig = {
      current: () => read,
      request: () =>
      {
        asked += 1;
      },
      subscribe: listener =>
      {
        listeners.add(listener);
        return () =>
        {
          listeners.delete(listener);
        };
      },
    };
    const arrive = (next: ConfigRead) =>
    {
      read = next;
      listeners.forEach(listener => listener());
    };
    return { config, arrive, asked: () => asked };
  };

  /**
   * Shows the chip over Chef Adventure's sky, at a time of day, the config read unless asked otherwise.
   * @param {number} minutes The clock's time of day.
   * @param {boolean} read Whether the config is read already.
   * @returns {{ clock: WindowClock, held: ReturnType<typeof heldConfig> }} The clock and the config.
   */
  const shown = (minutes: number, read = true) =>
  {
    const held = heldConfig();
    if (read)
    {
      held.arrive({ content: CHEF_WEATHER_CONFIG, problem: null });
    }

    const clock = new WindowClock(minutes);
    render(<SkyChip clock={clock} offer={skyOfferFor(held.config, CHEF_START)}/>);
    return { clock, held };
  };

  /**
   * The condition buttons, by name, with whether each is pressed and whether it is greyed.
   * @returns {string[][]} Each button's name, pressed state and disabled state.
   */
  const conditionButtons = (): string[][] =>
  {
    return within(screen.getByRole('group', { name: 'Condition' })).getAllByRole('button')
      .map(button => [ button.textContent ?? '', button.getAttribute('aria-pressed') ?? '', String((button as HTMLButtonElement).disabled) ]);
  };

  /**
   * The strength buttons, with whether each is greyed.
   * @returns {string[][]} Each button's name and disabled state.
   */
  const strengthButtons = (): string[][] =>
  {
    return within(screen.getByRole('group', { name: 'Strength' })).getAllByRole('button')
      .map(button => [ button.textContent ?? '', String((button as HTMLButtonElement).disabled) ]);
  };

  describe('skyWords and pickCondition', () =>
  {
    it('names the sky picked by its condition and strength, or that none is', () =>
    {
      // Arrange: heavy rain, and none.

      // Act.
      const words = [ skyWords({ condition: 'rain', strength: 'heavy' }), skyWords(null) ];

      // Assert.
      expect(words)
        .toStrictEqual([ 'rain · heavy', NO_SKY ]);
    });

    it('picks a condition at the strength it takes from the one picked before, or from none', () =>
    {
      // Arrange: a condition that takes whatever it is handed, uppercased.
      const condition: SkyCondition = { name: 'mist', strengths: [], possible: true, strengthFor: wanted => (wanted === null ? 'usual' : wanted.toUpperCase()) };

      // Act.
      const picks = [ pickCondition(condition, { condition: 'rain', strength: 'heavy' }), pickCondition(condition, null) ];

      // Assert.
      expect(picks)
        .toStrictEqual([ { condition: 'mist', strength: 'HEAVY' }, { condition: 'mist', strength: 'usual' } ]);
    });
  });

  it('says no sky weather is picked, reading nothing, and follows the sky wherever it was picked', () =>
  {
    // Arrange.
    const { clock, held } = shown(840, false);
    const before = screen.getByTestId('map-sky').textContent;

    // Act: heavy snow picked from elsewhere, as another view's chip picks it.
    act(() => clock.chooseSky({ condition: 'snow', strength: 'heavy' }));

    // Assert.
    expect([ before, screen.getByTestId('map-sky').textContent, held.asked() ])
      .toStrictEqual([ NO_SKY, 'snow · heavy', 0 ]);
  });

  it('asks for the project\'s sky as it opens, says it is being read, and lists the conditions once it arrives', () =>
  {
    // Arrange: the chip, the config not yet read.
    const { held } = shown(840, false);

    // Act: opened, then the config read.
    fireEvent.click(screen.getByTestId('map-sky'));
    const reading = [ held.asked(), screen.getByText('Reading the project\'s sky…') !== null, screen.queryByRole('group', { name: 'Condition' }) ];
    act(() => held.arrive({ content: CHEF_WEATHER_CONFIG, problem: null }));

    // Assert.
    expect([ reading, conditionButtons().map(([ name ]) => name) ])
      .toStrictEqual([ [ 1, true, null ], [ 'clear', 'overcast', 'breezy', 'rain', 'mist', 'sakura', 'monsoon', 'snow' ] ]);
  });

  it('greys the conditions the clock\'s season never has, saying so, and every strength while none is picked', () =>
  {
    // Arrange: 14:00 on the game's own date, in Winter.
    shown(840);

    // Act.
    fireEvent.click(screen.getByTestId('map-sky'));

    // Assert.
    expect([ conditionButtons().filter(([ , , disabled ]) => disabled === 'true').map(([ name ]) => name), strengthButtons(), screen.getByText('Greyed conditions never come at this time of year.') !== null ])
      .toStrictEqual([ [ 'mist', 'sakura', 'monsoon' ], [ [ 'light', 'true' ], [ 'moderate', 'true' ], [ 'heavy', 'true' ] ], true ]);
  });

  it('picks a condition at its usual strength, then a strength, then another condition keeping the strength', () =>
  {
    // Arrange: the picker open in Winter.
    const { clock } = shown(840);
    fireEvent.click(screen.getByTestId('map-sky'));
    const picks: unknown[] = [];

    // Act: rain, heavy, then snow.
    fireEvent.click(screen.getByRole('button', { name: 'rain' }));
    picks.push(clock.sky());
    fireEvent.click(screen.getByRole('button', { name: 'heavy' }));
    picks.push(clock.sky());
    fireEvent.click(screen.getByRole('button', { name: 'snow' }));
    picks.push(clock.sky());

    // Assert.
    expect([ picks, conditionButtons().find(([ name ]) => name === 'snow'), screen.getByTestId('map-sky').textContent ])
      .toStrictEqual([
        [ { condition: 'rain', strength: 'moderate' }, { condition: 'rain', strength: 'heavy' }, { condition: 'snow', strength: 'heavy' } ],
        [ 'snow', 'true', 'false' ],
        'snow · heavy',
      ]);
  });

  it('pulls the strength to the nearest a condition picked has, and greys the strengths it never has', () =>
  {
    // Arrange: heavy rain picked, the picker open in Autumn.
    const { clock } = shown(840);
    act(() =>
    {
      clock.chooseSeason(2);
      clock.chooseSky({ condition: 'rain', strength: 'heavy' });
    });
    fireEvent.click(screen.getByTestId('map-sky'));

    // Act: mist picked.
    fireEvent.click(screen.getByRole('button', { name: 'mist' }));

    // Assert.
    expect([ clock.sky(), strengthButtons() ])
      .toStrictEqual([ { condition: 'mist', strength: 'moderate' }, [ [ 'light', 'false' ], [ 'moderate', 'false' ], [ 'heavy', 'true' ] ] ]);
  });

  it('says what the sky shows at the clock\'s hour and season, and following the clock as it moves', () =>
  {
    // Arrange: a clear sky at 22:00, the picker open.
    const { clock } = shown(1320);
    act(() => clock.chooseSky({ condition: 'clear', strength: 'moderate' }));
    fireEvent.click(screen.getByTestId('map-sky'));
    const night = screen.getByTestId('map-sky-reading').textContent;

    // Act: Summer.
    act(() => clock.chooseSeason(1));

    // Assert.
    expect([ night, screen.getByTestId('map-sky-reading').textContent ])
      .toStrictEqual([ 'Shows as starfall (moderate) at this hour and season.', 'Shows as fireflies (moderate) at this hour and season.' ]);
  });

  it('picks no sky again with its button, offered only while a sky is picked', () =>
  {
    // Arrange: heavy rain picked, the picker open.
    const { clock } = shown(840);
    act(() => clock.chooseSky({ condition: 'rain', strength: 'heavy' }));
    fireEvent.click(screen.getByTestId('map-sky'));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: NO_SKY }));

    // Assert: none picked, the chip saying so, and the button gone.
    expect([ clock.sky(), screen.getByTestId('map-sky').textContent, screen.queryByRole('button', { name: NO_SKY }), screen.getByTestId('map-sky-reading').textContent ])
      .toStrictEqual([ null, NO_SKY, null, 'A new game\'s sky is random, so none shows until you pick one.' ]);
  });

  it('says why no conditions are listed when the project\'s config holds no sky', () =>
  {
    // Arrange: a config read without a sky.
    const held = heldConfig();
    held.arrive({ content: { motions: {}, presets: {} }, problem: null });
    const clock = new WindowClock(840);
    render(<SkyChip clock={clock} offer={skyOfferFor(held.config, CHEF_START)}/>);

    // Act.
    fireEvent.click(screen.getByTestId('map-sky'));

    // Assert.
    expect([ screen.getByText('The sky cannot be read from data/config.weather.json, so none shows.') !== null, screen.queryByRole('group', { name: 'Condition' }) ])
      .toStrictEqual([ true, null ]);
  });
});

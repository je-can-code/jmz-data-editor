import { describe, expect, it } from 'vitest';
import type { ConfigRead, OnDemandConfig, SkyOffer } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import type { SkyWeather } from '../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { WindowClock } from '../../../src/mapEditor/core/time/WindowClock.ts';
import { followSky, isSameSky, type SkySource } from '../../../src/mapEditor/render/skyFollower.ts';
import { skyOfferFor } from '../../../src/mapEditor/modules/weather/skyWeather.ts';
import { CHEF_START, CHEF_WEATHER_CONFIG } from '../support/skyFixtures.ts';

/*
 * A map view's sky follows the window's clock: while a module offers a sky and the author has picked one, the view's
 * renderer is told what the sky is doing at the clock's hour and season, and told again only when that changes, as when
 * the hour turns a clear winter day's frigid air into a starry night; an hour that changes nothing tells it nothing.
 *
 * Weather must cost a map without any nothing, and a new game's sky is random, so none is picked at first: then the
 * renderer is told nothing at all, keeping the none it starts with, and nothing is asked of the server. A sky picked has
 * its config asked for, and the renderer is told the sky once the config arrives, and again whenever a read of it
 * changes what the sky shows. Picking none again, or the modules switching off the sky they offered, tells the renderer
 * there is none; a module switching on afresh with another sky is followed, and the one before let go. Stopping stops
 * all of it.
 */
describe('skyFollower', () =>
{
  /**
   * J-Weather's config as the window holds it: unread until the test reads it in, which its listeners hear, noting how
   * often it was asked for.
   * @returns {{ config: OnDemandConfig, arrive: (read: ConfigRead) => void, asked: () => number, listening: () => number }}
   * The config.
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
    return { config, arrive, asked: () => asked, listening: () => listeners.size };
  };

  /**
   * The window's modules, offering a sky until the test switches them, telling their listeners when it does.
   * @param {SkyOffer | null} offer The sky offered at first.
   * @returns {{ modules: SkySource, offer: (next: SkyOffer | null) => void }} The modules, and a way to switch them.
   */
  const modulesOffering = (offer: SkyOffer | null) =>
  {
    const listeners = new Set<() => void>();
    let offered = offer;
    const modules: SkySource = {
      skyOffer: () => offered,
      subscribe: listener =>
      {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const switchTo = (next: SkyOffer | null) =>
    {
      offered = next;
      listeners.forEach(listener => listener());
    };
    return { modules, offer: switchTo };
  };

  /**
   * A renderer that notes every sky it is told.
   * @returns {{ setWeatherSky: (sky: SkyWeather | null) => void, told: (SkyWeather | null)[] }} The renderer.
   */
  const renderer = () =>
  {
    const told: (SkyWeather | null)[] = [];
    return { setWeatherSky: (sky: SkyWeather | null) => told.push(sky), told };
  };

  /**
   * The game's sky read from its config, as J-Weather's module offers it.
   */
  const READ: ConfigRead = { content: CHEF_WEATHER_CONFIG, problem: null };

  describe('followSky', () =>
  {
    it('tells the renderer nothing and asks nothing of the server while no sky is picked, the clock moving or not', () =>
    {
      // Arrange: J-Weather-Time's sky offered at 14:00, none picked.
      const held = heldConfig();
      const { modules } = modulesOffering(skyOfferFor(held.config, CHEF_START));
      const clock = new WindowClock(840);
      const target = renderer();

      // Act.
      followSky(target, clock, modules);
      clock.set(1320);
      clock.chooseSeason(1);

      // Assert.
      expect([ target.told, held.asked() ])
        .toStrictEqual([ [], 0 ]);
    });

    it('asks for the config once a sky is picked, and tells the renderer the sky once it arrives', () =>
    {
      // Arrange: the sky offered at 22:00 in Winter.
      const held = heldConfig();
      const { modules } = modulesOffering(skyOfferFor(held.config, CHEF_START));
      const clock = new WindowClock(1320);
      const target = renderer();
      followSky(target, clock, modules);

      // Act: a clear sky picked, then the config read.
      clock.chooseSky({ condition: 'clear', strength: 'moderate' });
      const beforeRead = [ ...target.told ];
      held.arrive(READ);

      // Assert: starfall, a clear winter night's face.
      expect([ held.asked() > 0, beforeRead, target.told ])
        .toStrictEqual([ true, [], [ { preset: 'starfall', intensity: 'moderate', type: 'clear' } ] ]);
    });

    it('tells the renderer again only when the clock changes what the sky shows', () =>
    {
      // Arrange: a clear sky at 21:00 in Winter, the config read.
      const held = heldConfig();
      held.arrive(READ);
      const { modules } = modulesOffering(skyOfferFor(held.config, CHEF_START));
      const clock = new WindowClock(1260);
      clock.chooseSky({ condition: 'clear', strength: 'moderate' });
      const target = renderer();
      followSky(target, clock, modules);

      // Act: 23:00, still night; 04:00, day; the strength made heavy; then Summer.
      clock.set(1380);
      clock.set(240);
      clock.chooseSky({ condition: 'clear', strength: 'heavy' });
      clock.chooseSeason(1);

      // Assert.
      expect(target.told.map(sky => (sky === null ? null : `${sky.preset} ${sky.intensity}`)))
        .toStrictEqual([ 'starfall moderate', 'frigid moderate', 'frigid heavy', 'scorcher heavy' ]);
    });

    it('tells the renderer there is no sky once none is picked again, or the modules stop offering one', () =>
    {
      // Arrange: heavy rain, the config read, followed by two views.
      const held = heldConfig();
      held.arrive(READ);
      const offer = skyOfferFor(held.config, CHEF_START);
      const picked = modulesOffering(offer);
      const offered = modulesOffering(offer);
      const clock = new WindowClock(720);
      clock.chooseSky({ condition: 'rain', strength: 'heavy' });
      const first = renderer();
      const second = renderer();
      followSky(first, clock, picked.modules);
      const otherClock = new WindowClock(720);
      otherClock.chooseSky({ condition: 'rain', strength: 'heavy' });
      followSky(second, otherClock, offered.modules);

      // Act: no sky picked in the one window, and the sky no longer offered in the other.
      clock.chooseSky(null);
      offered.offer(null);

      // Assert.
      const rain = { preset: 'rain', intensity: 'heavy', type: 'rain' };
      expect([ first.told, second.told ])
        .toStrictEqual([ [ rain, null ], [ rain, null ] ]);
    });

    it('follows a sky the modules offer afresh, letting the one before go, and tells the renderer what the new one shows', () =>
    {
      // Arrange: snow picked, the sky offered from a config not yet read, followed.
      const before = heldConfig();
      const after = heldConfig();
      after.arrive(READ);
      const { modules, offer } = modulesOffering(skyOfferFor(before.config, CHEF_START));
      const clock = new WindowClock(720);
      clock.chooseSky({ condition: 'snow', strength: 'light' });
      const target = renderer();
      followSky(target, clock, modules);
      const listenedBefore = before.listening();

      // Act: the modules switch on afresh with a sky read from another copy of the config.
      offer(skyOfferFor(after.config, CHEF_START));

      // Assert: the old copy is no longer listened to, and the new sky is told.
      expect([ listenedBefore, before.listening(), target.told ])
        .toStrictEqual([ 1, 0, [ { preset: 'snow', intensity: 'light', type: 'snow' } ] ]);
    });

    it('tells the renderer nothing more once it stops following', () =>
    {
      // Arrange: heavy rain followed, the config not yet read.
      const held = heldConfig();
      const { modules, offer } = modulesOffering(skyOfferFor(held.config, CHEF_START));
      const clock = new WindowClock(720);
      clock.chooseSky({ condition: 'rain', strength: 'heavy' });
      const target = renderer();
      const stop = followSky(target, clock, modules);

      // Act: stopped, then the config read, the clock moved and the modules switched.
      stop();
      held.arrive(READ);
      clock.set(1320);
      offer(null);

      // Assert.
      expect([ target.told, held.listening() ])
        .toStrictEqual([ [], 0 ]);
    });
  });

  describe('isSameSky', () =>
  {
    it('holds two skies the same by look, strength and condition, none being the same only as none', () =>
    {
      // Arrange: a clear night, and one differing in each part.
      const night = { preset: 'starfall', intensity: 'light', type: 'clear' };
      const pairs: [ SkyWeather | null, SkyWeather | null ][] = [
        [ night, { ...night } ],
        [ night, { ...night, preset: 'fireflies' } ],
        [ night, { ...night, intensity: 'heavy' } ],
        [ night, { ...night, type: 'breezy' } ],
        [ null, null ],
        [ null, night ],
        [ night, null ],
      ];

      // Act.
      const same = pairs.map(([ left, right ]) => isSameSky(left, right));

      // Assert.
      expect(same)
        .toStrictEqual([ true, false, false, false, true, false, false ]);
    });
  });
});

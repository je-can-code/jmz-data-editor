import type { SkyOffer } from '../core/modules/PluginModule.ts';
import type { SkyWeather } from '../core/renderer/weatherLayer.ts';
import type { WindowClock } from '../core/time/WindowClock.ts';

/**
 * Where a map view's sky goes: its renderer, which draws every map's weather under it.
 */
type SkyTarget = {
  /**
   * Says what the sky is doing, or null for nothing.
   * @param {SkyWeather | null} sky The sky.
   */
  setWeatherSky(sky: SkyWeather | null): void;
};

/**
 * The window's modules, as far as the sky reads them: the sky they offer, and when they switch on afresh.
 */
type SkySource = {
  skyOffer(): SkyOffer | null;
  subscribe(listener: () => void): () => void;
};

/**
 * Reports whether two skies are the same: the same look, at the same strength, in the same condition, or both none.
 * @param {SkyWeather | null} left One sky, or null for none.
 * @param {SkyWeather | null} right The other.
 * @returns {boolean} True when they are the same.
 */
const isSameSky = (left: SkyWeather | null, right: SkyWeather | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.preset === right.preset && left.intensity === right.intensity && left.type === right.type;
};

/**
 * Keeps a map view's sky following the window's clock: while a module offers a sky and the author has picked one, the
 * renderer is told what the sky is doing at the clock's hour and season, and told again only when that changes, as when
 * the hour turns a clear day into a starry night; with no sky offered or picked, as on a new game, it is told nothing at
 * all and stays with none, so a map without weather of its own draws none and nothing is read for it. A sky picked has
 * its config asked for, once, and the renderer is told the sky once it arrives, and again whenever it is read afresh.
 * @param {SkyTarget} target The view's renderer, which starts with no sky.
 * @param {WindowClock} clock The window's clock, holding the hour, the season and the sky picked.
 * @param {SkySource} modules The window's modules.
 * @returns {() => void} Stops following.
 */
const followSky = (target: SkyTarget, clock: WindowClock, modules: SkySource): (() => void) =>
{
  let offer: SkyOffer | null = null;
  let stopReading: () => void = () => undefined;
  let told: SkyWeather | null = null;

  /**
   * Works out what the sky is doing now, asking for its config when a sky is picked, and tells the renderer when that
   * differs from what it was told last.
   */
  const update = (): void =>
  {
    const pick = clock.sky();
    if (offer !== null && pick !== null)
    {
      offer.config.request();
    }

    const sky = offer === null
      ? null
      : offer.readingAt(pick, clock.time(), clock.season()).weather;
    if (isSameSky(sky, told))
    {
      return;
    }

    told = sky;
    target.setWeatherSky(sky);
  };

  /**
   * Follows the sky the modules offer now, its config's reads included, and works the sky out afresh.
   */
  const follow = (): void =>
  {
    const next = modules.skyOffer();
    if (next !== offer)
    {
      stopReading();
      offer = next;
      stopReading = next === null ? () => undefined : next.config.subscribe(update);
    }

    update();
  };

  follow();
  const stops = [ clock.subscribe(update), modules.subscribe(follow) ];
  return () =>
  {
    stops.forEach(stop => stop());
    stopReading();
  };
};

export { followSky, isSameSky };
export type { SkySource, SkyTarget };

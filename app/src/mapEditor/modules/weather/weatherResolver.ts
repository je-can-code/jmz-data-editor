import type { SkyWeather } from '../../core/renderer/weatherLayer.ts';
import { climateIntensity, NO_CLIMATES, type ClimateTables } from './climateCurves.ts';
import type { WeatherDeclaration } from './weatherTags.ts';

/**
 * The weather a map is drawn with: a look by name, and how hard it is coming down.
 */
type ResolvedWeather = {
  readonly preset: string;
  readonly intensity: string;
};

/**
 * The rungs of every look's intensity ladder, as WeatherPresets.Intensities names them.
 */
const INTENSITIES = {
  light: 'light',
  moderate: 'moderate',
  heavy: 'heavy',
} as const;

/**
 * The strength a look a map names runs at where the sky cannot be seen, or where nothing drives a sky at all
 * (MapWeatherResolver.ShelteredIntensity): its middle rung.
 */
const SHELTERED_INTENSITY = INTENSITIES.moderate;

/**
 * How strongly a look a map names runs, as MapWeatherResolver#intensityFor decides with J-Weather-Time's climates bent
 * into it: under open sky it rises and falls with the sky's own strength, as the map's climate, if it names one the
 * config knows, answers it; under a roof, or with no sky driven at all, it sits at its middle rung.
 * @param {WeatherDeclaration} declaration What the map's note says.
 * @param {SkyWeather | null} sky What the sky is doing, or null when nothing drives one.
 * @param {ClimateTables} climates The climates J-Weather's config holds; none unless given.
 * @returns {string} The intensity.
 */
const intensityFor = (declaration: WeatherDeclaration, sky: SkyWeather | null, climates: ClimateTables = NO_CLIMATES): string =>
{
  const skyIntensity = declaration.hasSky && sky !== null
    ? sky.intensity
    : SHELTERED_INTENSITY;
  return climateIntensity(declaration, sky, skyIntensity, climates);
};

/**
 * Decides what a map's weather is, as MapWeatherResolver#resolve does: an opt-out shows nothing whatever the sky does; a
 * look the map names shows wherever it was named, at the strength {@link intensityFor} gives; a map naming none under a
 * roof shows nothing; and a map naming none under open sky shows whatever the sky is doing, at the sky's own strength
 * whatever climate it names, which is nothing while no sky is driven, as with J-Weather on its own. Nothing carries in
 * from anywhere: a map's weather is its own.
 * @param {WeatherDeclaration} declaration What the map's note says.
 * @param {SkyWeather | null} sky What the sky is doing, or null when nothing drives one.
 * @param {ClimateTables} climates The climates J-Weather's config holds; none unless given.
 * @returns {ResolvedWeather | null} The weather to draw, or null for none.
 */
const resolveWeather = (declaration: WeatherDeclaration, sky: SkyWeather | null, climates: ClimateTables = NO_CLIMATES): ResolvedWeather | null =>
{
  // an explicit opt-out outranks everything, including a sky with opinions.
  if (declaration.suppressed)
  {
    return null;
  }

  // a look somebody typed applies wherever it was typed, sky or no sky.
  if (declaration.preset !== null)
  {
    return { preset: declaration.preset, intensity: intensityFor(declaration, sky, climates) };
  }

  // with nothing named, only the sky could have an opinion, and a roof keeps it out.
  if (declaration.hasSky === false || sky === null)
  {
    return null;
  }

  return { preset: sky.preset, intensity: sky.intensity };
};

/**
 * Reports whether two resolutions describe the same weather, by value, as WeatherDirector#isSameWeather compares them:
 * nothing and nothing are the same nothing.
 * @param {ResolvedWeather | null} left One resolution, or null for none.
 * @param {ResolvedWeather | null} right The other.
 * @returns {boolean} True when they are the same weather.
 */
const isSameWeather = (left: ResolvedWeather | null, right: ResolvedWeather | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.preset === right.preset && left.intensity === right.intensity;
};

export { intensityFor, INTENSITIES, isSameWeather, resolveWeather, SHELTERED_INTENSITY };
export type { ResolvedWeather };

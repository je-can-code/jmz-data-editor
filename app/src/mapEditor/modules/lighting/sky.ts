import type { MapDocument } from '../../core/model/MapDocument.ts';
import { hasMetaFlag } from '../../core/model/noteMeta.ts';
import type { ScreenTone } from '../../core/renderer/lightingLayer.ts';
import { hourOf } from '../../core/time/timeOfDay.ts';
import type { AmbientSource } from './ambientTags.ts';
import { UNNAMED_DARK } from './lightingComposition.ts';
import { darknessOfHour, toneOfHour, type SkyCurve } from './timeTone.ts';

/**
 * The source the sky's tone and darkness are declared under, as TimeLightingCoordinator.SOURCE_KEY names it: it ranks
 * above a map's own darkness, an event page's and the party's, and below only an event command's.
 */
const TIME_SOURCE = 'time';

/**
 * The tag that takes a map out from under the sky: an interior, a cave, anywhere the sky cannot be seen. J-Lighting-Time
 * reads it from the map's {@code meta}, case and all.
 *
 * <pre>
 * Structure:
 *  <noToneChange>
 *
 * Example:
 *  <noToneChange>
 *
 * Translation:
 *  The clock casts no colour and no darkness over this map.
 * </pre>
 */
const NO_TONE_CHANGE = 'noToneChange';

/**
 * Reports whether a map lies under the sky, as TimeLightingCoordinator#refreshMapSuppression decides: every map does
 * unless its note carries {@code <noToneChange>}, read as the engine reads a note's tags, so a bare tag counts and so
 * does one with any text after a colon.
 * @param {MapDocument} document The map.
 * @returns {boolean} True when the clock reaches it.
 */
const hasSky = (document: MapDocument): boolean =>
{
  return hasMetaFlag(document.property('note'), NO_TONE_CHANGE) === false;
};

/**
 * The sky's darkness at the clock's hour, as TimeLightingCoordinator declares it: under the time source, how much light
 * the hour takes away by the curve, and no colour of its own, since the sky knows how dark it is and has no say in what
 * colour a place's dark should be, so a teal cave keeps its teal. On a map with no sky it declares nothing at all rather
 * than nothing dark, which leaves the map's own darkness exactly as it stands. A sky taking nothing away is still
 * declared, as the plugin declares it, so the darkness composes to the very same number.
 * @param {SkyCurve} curve The day and night curve.
 * @returns {AmbientSource} The source.
 */
const skyAmbient = (curve: SkyCurve): AmbientSource =>
{
  return (document, clock) =>
  {
    if (hasSky(document) === false)
    {
      return null;
    }

    const darkness = darknessOfHour(hourOf(clock.timeOfDay), curve.darkness);
    return { darkness, color: UNNAMED_DARK, declaresColor: false, source: TIME_SOURCE };
  };
};

/**
 * The tone the sky casts over a map at a time of day, as TimeLightingCoordinator declares it and the engine's screen
 * tone shows it once the sky has arrived: the curve's tone at the hour. A map with no sky gets none. The plugin's tone
 * is the only one the editor knows of, so it is what the screen shows; the phases tinting nothing, such as Morning, cast
 * a tone of all zeroes, which the screen shows as none.
 * @param {MapDocument} document The map.
 * @param {number} timeOfDay The time of day, in minutes past midnight.
 * @param {SkyCurve} curve The day and night curve.
 * @returns {ScreenTone | null} The tone, or null for a map with no sky.
 */
const skyToneOf = (document: MapDocument, timeOfDay: number, curve: SkyCurve): ScreenTone | null =>
{
  if (hasSky(document) === false)
  {
    return null;
  }

  const [ red, green, blue, grey ] = toneOfHour(hourOf(timeOfDay), curve.tones);
  return [ red, green, blue, grey ];
};

export { hasSky, NO_TONE_CHANGE, skyAmbient, skyToneOf, TIME_SOURCE };

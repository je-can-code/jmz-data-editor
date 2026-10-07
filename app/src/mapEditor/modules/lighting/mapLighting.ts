import type { SliderControl } from '../../core/eventKinds/quickFields.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapPropertiesModel, MapPropertiesSource, MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { readMapDarkness, withDarkColor, withDarkness, type MapDarkness } from './ambientNote.ts';
import { isHexColor } from './lightTags.ts';
import { skyFollowsClock, withSkyFollowingClock } from './skyTag.ts';

/**
 * What the sky setting is called, and what it says under it.
 */
type SkyWords = {
  readonly label: string;
  readonly hint: string;
};

/**
 * The id of the section J-Lighting's module adds to Map Properties.
 */
const MAP_LIGHTING_ID = 'lighting.map';

/**
 * How a map's darkness is set: 0 to 100, dragged in whole steps or typed to two places, each end of the track named.
 */
const DARKNESS_CONTROL: SliderControl = {
  kind: 'slider',
  min: 0,
  max: 100,
  places: 2,
  track: [ 0, 100 ],
  step: 1,
  unit: '%',
  ends: [ 'Not dark', 'Pitch black' ],
  about: 'How much of the map\'s light is gone. Lights on the map shine through it.',
};

/**
 * What the colour setting says when the map names no colour for its dark.
 */
const PLAIN_BLACK_HINT = 'Plain black, since this map names no colour for its dark.';

/**
 * What the sky setting is called while J-Lighting-Time is on and J-Weather-Time is off.
 */
const SKY_LABEL = 'Sky follows the clock';

/**
 * What the sky setting says under it while J-Lighting-Time is on and J-Weather-Time is off.
 */
const SKY_HINT = 'The hour tints and darkens this map. Untick it for interiors and caves, which have no sky.';

/**
 * What the sky setting is called while J-Weather-Time is on and J-Lighting-Time is off: the sky's weather reaches only
 * a map with a sky, which J-Weather reads from the same setting.
 */
const WEATHER_SKY_LABEL = 'Sky follows the weather';

/**
 * What the sky setting says under it while J-Weather-Time is on and J-Lighting-Time is off: a map without a sky gets
 * none of the sky's weather.
 */
const WEATHER_SKY_HINT = 'The sky\'s weather reaches this map. Untick it for interiors and caves, which have no sky.';

/**
 * What the sky setting is called while J-Lighting-Time and J-Weather-Time are both on.
 */
const SKY_AND_WEATHER_LABEL = 'Sky follows the clock and the weather';

/**
 * What the sky setting says under it while J-Lighting-Time and J-Weather-Time are both on.
 */
const SKY_AND_WEATHER_HINT = 'The hour tints and darkens this map, and the sky\'s weather reaches it. Untick it for interiors '
  + 'and caves, which have no sky.';

/**
 * What the section says when the game finds the map's darkness but cannot read it, which leaves the map as dark as the
 * one the player came from.
 */
const UNREADABLE_NOTE = 'The game cannot read this map\'s darkness as written, so the map stays as dark as the one before it. '
  + 'Set a darkness here to mend it.';

/**
 * Says what the section says above its settings, when there is anything to say: that the game cannot read the map's
 * darkness, and that the note sets a darkness more than once, of which the game reads only the last.
 * @param {MapDarkness} darkness The map's darkness.
 * @returns {string | null} The line, or null when there is nothing to say.
 */
const darknessNote = (darkness: MapDarkness): string | null =>
{
  const lines = [
    ...(darkness.readable ? [] : [ UNREADABLE_NOTE ]),
    ...(darkness.tags > 1
      ? [ `This note sets a darkness ${darkness.tags} times; the game reads only the last line's, which is the one shown here.` ]
      : []),
  ];
  return lines.length === 0
    ? null
    : lines.join(' ');
};

/**
 * Says what the colour setting shows when it is not the colour the map names: plain black for a map naming none, and
 * the project's default for a colour the game cannot use.
 * @param {MapDarkness} darkness The map's darkness.
 * @returns {{ hint?: string }} The hint, or none for a colour of the map's own.
 */
const colorHint = (darkness: MapDarkness): { hint?: string } =>
{
  const { colorText } = darkness;
  if (colorText === '')
  {
    return { hint: PLAIN_BLACK_HINT };
  }

  return isHexColor(colorText)
    ? {}
    : { hint: `${colorText} is not a colour, so the project's default shows.` };
};

/**
 * Words the sky setting for the plugins a map's sky changes the map for, naming only those that are on, so unticking it
 * never takes either by surprise nor speaks of one the game does not run: the clock while J-Lighting-Time is on, the
 * weather while J-Weather-Time is, and both while both are.
 * @param {boolean} clock Whether J-Lighting-Time is on.
 * @param {boolean} weather Whether J-Weather-Time is on.
 * @returns {SkyWords | null} What the setting is called and says under it, or null while neither is on, when the tag
 * changes nothing in the game and the setting is not offered.
 */
const skyWordsFor = (clock: boolean, weather: boolean): SkyWords | null =>
{
  // with both on, the one tag decides the hour's tint and the sky's weather together.
  if (clock && weather)
  {
    return { label: SKY_AND_WEATHER_LABEL, hint: SKY_AND_WEATHER_HINT };
  }

  // the clock alone tints and darkens a map with a sky.
  if (clock)
  {
    return { label: SKY_LABEL, hint: SKY_HINT };
  }

  // the weather alone reaches a map with a sky, and with neither on, the tag changes nothing in the game.
  return weather
    ? { label: WEATHER_SKY_LABEL, hint: WEATHER_SKY_HINT }
    : null;
};

/**
 * Builds the settings of a map's lighting: how dark it is; the colour of its dark, once it is dark; and, while
 * J-Lighting-Time or J-Weather-Time is on, whether the map has a sky, which J-Lighting-Time reads to tint and darken the
 * map by the hour and J-Weather-Time's sky needs to reach it with its weather, so the setting is worded for whichever of
 * them is on. Each is read from the note as the game reads it, and each change writes the note in place, so every other
 * tag and every other word of it stays as written.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @param {boolean} clock Whether J-Lighting-Time is on, which tints and darkens a map with a sky by the hour.
 * @param {boolean} weather Whether J-Weather-Time is on, whose sky's weather reaches only a map with a sky.
 * @returns {MapPropertiesSource} The section's settings, for each map.
 */
const mapLightingSource = (defaultColor: string, clock: boolean, weather: boolean): MapPropertiesSource =>
{
  // the plugins reading the sky tag are the same for every map, so the setting is worded once.
  const skyWords = skyWordsFor(clock, weather);

  return (map: MapDocument): MapPropertiesModel =>
  {
    const note = map.property('note');
    const darkness = readMapDarkness(note, defaultColor);
    const fields: MapPropertyField[] = [
      {
        key: 'lighting.darkness',
        label: 'Darkness',
        control: DARKNESS_CONTROL,
        value: darkness.percent,
        step: 'Change darkness',
        write: value => ({ note: withDarkness(note, value as number, defaultColor) }),
      },
    ];

    // the colour belongs to the dark, so a map that is not dark has none to set.
    if (darkness.readable && darkness.percent > 0)
    {
      fields.push({
        key: 'lighting.darkColor',
        label: 'Colour of the dark',
        control: darkness.colorText === '' ? { kind: 'color' } : { kind: 'color', clear: 'Plain black' },
        value: darkness.color,
        step: 'Change darkness colour',
        ...colorHint(darkness),
        write: value => ({ note: withDarkColor(note, value as string, defaultColor) }),
      });
    }

    // a map has a sky to set only while some plugin the game runs reads the tag.
    if (skyWords !== null)
    {
      fields.push({
        key: 'lighting.sky',
        label: skyWords.label,
        control: { kind: 'check' },
        value: skyFollowsClock(note),
        step: 'Change sky',
        hint: skyWords.hint,
        write: value => ({ note: withSkyFollowingClock(note, value as boolean) }),
      });
    }

    return { note: darknessNote(darkness), fields };
  };
};

export { DARKNESS_CONTROL, MAP_LIGHTING_ID, mapLightingSource, PLAIN_BLACK_HINT, SKY_HINT };

import type { SliderControl } from '../../core/eventKinds/quickFields.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapPropertiesModel, MapPropertiesSource, MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { readMapDarkness, withDarkColor, withDarkness, type MapDarkness } from './ambientNote.ts';
import { isHexColor } from './lightTags.ts';
import { skyFollowsClock, withSkyFollowingClock } from './skyTag.ts';

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
 * What the sky setting is called while J-Weather is off.
 */
const SKY_LABEL = 'Sky follows the clock';

/**
 * What the sky setting says under it while J-Weather is off.
 */
const SKY_HINT = 'The hour tints and darkens this map. Untick it for interiors and caves, which have no sky.';

/**
 * What the sky setting is called while J-Weather is on, which reads the same setting to know a map is under a roof.
 */
const SKY_AND_WEATHER_LABEL = 'Sky follows the clock and the weather';

/**
 * What the sky setting says under it while J-Weather is on: a map without a sky gets none of the sky's weather.
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
 * Builds the settings of a map's lighting: how dark it is; the colour of its dark, once it is dark; and, while
 * J-Lighting-Time is on, whether its sky follows the clock, which while J-Weather is on says it decides the weather too,
 * since J-Weather reads the same tag to know a map is under a roof. Each is read from the note as the game reads it, and
 * each change writes the note in place, so every other tag and every other word of it stays as written.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @param {boolean} sky Whether J-Lighting-Time is on, which is what gives a map a sky.
 * @param {boolean} weather Whether J-Weather is on, which keeps the sky's weather off a map without a sky.
 * @returns {MapPropertiesSource} The section's settings, for each map.
 */
const mapLightingSource = (defaultColor: string, sky: boolean, weather: boolean): MapPropertiesSource =>
{
  // the sky setting names the weather too while J-Weather reads it, so unticking it never takes the weather by surprise.
  const skyWords = weather
    ? { label: SKY_AND_WEATHER_LABEL, hint: SKY_AND_WEATHER_HINT }
    : { label: SKY_LABEL, hint: SKY_HINT };

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

    if (sky)
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

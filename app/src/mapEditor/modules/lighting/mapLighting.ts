import type { SliderControl } from '../../core/eventKinds/quickFields.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapPropertiesModel, MapPropertiesSource, MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { readMapDarkness, withDarkColor, withDarkness, type MapDarkness } from './ambientNote.ts';
import { isHexColor } from './lightTags.ts';
import { skyFollowsClock, withSkyFollowingClock } from './skyTag.ts';

/**
 * J-Lighting-Time's file name, as js/plugins.js lists it: the plugin that makes a map's sky follow the clock.
 */
const LIGHTING_TIME_PLUGIN = 'J-Lighting-Time';

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
 * What the sky setting says under it.
 */
const SKY_HINT = 'The hour tints and darkens this map. Untick it for interiors and caves, which have no sky.';

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
 * J-Lighting-Time is on, whether its sky follows the clock. Each is read from the note as the game reads it, and each
 * change writes the note in place, so every other tag and every other word of it stays as written.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @param {boolean} sky Whether J-Lighting-Time is on, which is what gives a map a sky.
 * @returns {MapPropertiesSource} The section's settings, for each map.
 */
const mapLightingSource = (defaultColor: string, sky: boolean): MapPropertiesSource =>
{
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
        label: 'Sky follows the clock',
        control: { kind: 'check' },
        value: skyFollowsClock(note),
        step: 'Change sky',
        hint: SKY_HINT,
        write: value => ({ note: withSkyFollowingClock(note, value as boolean) }),
      });
    }

    return { note: darknessNote(darkness), fields };
  };
};

export { DARKNESS_CONTROL, LIGHTING_TIME_PLUGIN, MAP_LIGHTING_ID, mapLightingSource, PLAIN_BLACK_HINT, SKY_HINT };

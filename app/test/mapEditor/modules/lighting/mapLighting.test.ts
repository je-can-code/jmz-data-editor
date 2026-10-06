import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { MapPropertyField } from '../../../../src/mapEditor/core/properties/moduleProperties.ts';
import { DARKNESS_CONTROL, mapLightingSource, PLAIN_BLACK_HINT, SKY_HINT } from '../../../../src/mapEditor/modules/lighting/mapLighting.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map's lighting settings, as Map Properties shows them while J-Lighting is on: how dark the map is, always; the
 * colour of its dark, only once it is dark, since the colour belongs to the dark; and whether its sky follows the clock,
 * only while J-Lighting-Time is on, since that is what gives a map a sky. Each shows what the game reads from the note,
 * and each writes the note in place. J-Weather reads the same sky setting to keep the sky's weather off a map under a
 * roof, so while it is on the setting says so in its name and under it, and still writes the same tag.
 *
 * The colour shows the colour the map names; plain black, and says so, when it names none; and the project's default,
 * saying why, for one the game cannot use. A colour the map names can be taken off again, back to plain black. Above the
 * settings the section says when the game cannot read the map's darkness, which leaves the map as dark as the one before
 * it, and when the note sets a darkness more than once, of which only the last line's counts.
 */

/**
 * The project's colour of the dark in these tests, for a colour the game cannot use.
 */
const DEFAULT = '#102030';

/**
 * A map whose note is the given text.
 * @param {string} note The note.
 * @returns {MapDocument} The map.
 */
const mapNoted = (note: string): MapDocument =>
{
  return MapDocument.fromJson('map:4', { ...buildMapJson(), note });
};

/**
 * Reads a setting as the section shows it, leaving out how it writes.
 * @param {MapPropertyField} field The setting.
 * @returns {Omit<MapPropertyField, 'write'>} What it shows.
 */
const shown = (field: MapPropertyField): Omit<MapPropertyField, 'write'> =>
{
  const { write: _write, ...rest } = field;
  return rest;
};

describe('mapLighting', () =>
{
  describe('mapLightingSource', () =>
  {
    it('offers a map that is not dark its darkness and its sky, and nothing to say about it', () =>
    {
      // Arrange.
      const field = mapNoted('<weather:rain>');

      // Act.
      const model = mapLightingSource(DEFAULT, true, false)(field);

      // Assert.
      expect([ model.note, model.fields.map(shown) ])
        .toStrictEqual([
          null,
          [
            { key: 'lighting.darkness', label: 'Darkness', control: DARKNESS_CONTROL, value: 0, step: 'Change darkness' },
            { key: 'lighting.sky', label: 'Sky follows the clock', control: { kind: 'check' }, value: true, step: 'Change sky', hint: SKY_HINT },
          ],
        ]);
    });

    it('offers a dark map the colour of its dark, plain black and saying so when it names none', () =>
    {
      // Arrange.
      const cave = mapNoted('<noToneChange>\n<ambient:[85]>');

      // Act.
      const model = mapLightingSource(DEFAULT, true, false)(cave);

      // Assert.
      expect(model.fields.map(shown))
        .toStrictEqual([
          { key: 'lighting.darkness', label: 'Darkness', control: DARKNESS_CONTROL, value: 85, step: 'Change darkness' },
          {
            key: 'lighting.darkColor',
            label: 'Colour of the dark',
            control: { kind: 'color' },
            value: '#000000',
            step: 'Change darkness colour',
            hint: PLAIN_BLACK_HINT,
          },
          { key: 'lighting.sky', label: 'Sky follows the clock', control: { kind: 'check' }, value: false, step: 'Change sky', hint: SKY_HINT },
        ]);
    });

    it('shows the colour a map names, and offers to take it off again', () =>
    {
      // Arrange.
      const grotto = mapNoted('<ambient:[85, #0A2A2A]>');

      // Act.
      const [ , color ] = mapLightingSource(DEFAULT, true, false)(grotto).fields;

      // Assert.
      expect(shown(color))
        .toStrictEqual({
          key: 'lighting.darkColor',
          label: 'Colour of the dark',
          control: { kind: 'color', clear: 'Plain black' },
          value: '#0a2a2a',
          step: 'Change darkness colour',
        });
    });

    it('shows the project\'s colour in place of one the game cannot use, saying why', () =>
    {
      // Arrange.
      const map = mapNoted('<ambient:[60, teal]>');

      // Act.
      const [ , color ] = mapLightingSource(DEFAULT, true, false)(map).fields;

      // Assert.
      expect([ color.value, color.hint, color.control ])
        .toStrictEqual([ '#102030', 'teal is not a colour, so the project\'s default shows.', { kind: 'color', clear: 'Plain black' } ]);
    });

    it('says the sky decides the weather too while J-Weather is on, writing the same tag', () =>
    {
      // Arrange: a cave with no sky, its settings with J-Weather off and on.
      const cave = mapNoted('<noToneChange>\n<ambient:[85]>');
      const sources = [ mapLightingSource(DEFAULT, true, false), mapLightingSource(DEFAULT, true, true) ];

      // Act.
      const skies = sources.map(source => source(cave).fields.find(field => field.key === 'lighting.sky') as MapPropertyField);

      // Assert: the cave given its sky back loses the same tag whichever way the setting is worded.
      expect(skies.map(sky => [ sky.label, sky.hint, sky.value, sky.write(true) ]))
        .toStrictEqual([
          [ 'Sky follows the clock', SKY_HINT, false, { note: '<ambient:[85]>' } ],
          [
            'Sky follows the clock and the weather',
            'The hour tints and darkens this map, and the sky\'s weather reaches it. Untick it for interiors and caves, which have no sky.',
            false,
            { note: '<ambient:[85]>' },
          ],
        ]);
    });

    it('offers no sky while J-Lighting-Time is off', () =>
    {
      // Arrange.
      const cave = mapNoted('<noToneChange>\n<ambient:[85]>');

      // Act.
      const model = mapLightingSource(DEFAULT, false, false)(cave);

      // Assert.
      expect(model.fields.map(field => field.key))
        .toStrictEqual([ 'lighting.darkness', 'lighting.darkColor' ]);
    });

    it('says when the game cannot read the map\'s darkness, offering no colour until it can', () =>
    {
      // Arrange.
      const map = mapNoted('<ambient:[50, #0a2a2a, 5]>');

      // Act.
      const model = mapLightingSource(DEFAULT, false, false)(map);

      // Assert.
      expect([ model.note, model.fields.map(field => [ field.key, field.value ]) ])
        .toStrictEqual([
          'The game cannot read this map\'s darkness as written, so the map stays as dark as the one before it. Set a darkness here to mend it.',
          [ [ 'lighting.darkness', 0 ] ],
        ]);
    });

    it('says when the note sets a darkness more than once, and that the last line\'s is the one shown', () =>
    {
      // Arrange.
      const map = mapNoted('<ambient:[30]>\n<ambient:[70]>');

      // Act.
      const model = mapLightingSource(DEFAULT, false, false)(map);

      // Assert.
      expect([ model.note, model.fields[0].value ])
        .toStrictEqual([ 'This note sets a darkness 2 times; the game reads only the last line\'s, which is the one shown here.', 70 ]);
    });

    it('says both, when the darkness the game reads is one it cannot read among several', () =>
    {
      // Arrange.
      const map = mapNoted('<ambient:[30]>\n<ambient:[..]>');

      // Act.
      const model = mapLightingSource(DEFAULT, false, false)(map);

      // Assert.
      expect(model.note)
        .toBe('The game cannot read this map\'s darkness as written, so the map stays as dark as the one before it. Set a darkness '
          + 'here to mend it. This note sets a darkness 2 times; the game reads only the last line\'s, which is the one shown here.');
    });

    it('writes each setting into the note in place', () =>
    {
      // Arrange.
      const cave = mapNoted('<noWeather>\n<noToneChange>\n<ambient:[85]>');
      const [ darkness, color, sky ] = mapLightingSource(DEFAULT, true, false)(cave).fields;

      // Act.
      const written = [ darkness.write(60), color.write('#0a2a2a'), sky.write(true) ];

      // Assert.
      expect(written)
        .toStrictEqual([
          { note: '<noWeather>\n<noToneChange>\n<ambient:[60]>' },
          { note: '<noWeather>\n<noToneChange>\n<ambient:[85, #0a2a2a]>' },
          { note: '<noWeather>\n<ambient:[85]>' },
        ]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { ConfigRead, OnDemandConfig, SkyReader } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { editModuleProperty, type MapPropertyField } from '../../../../src/mapEditor/core/properties/moduleProperties.ts';
import { CLOCK_SKY } from '../../../../src/mapEditor/modules/lighting/mapLighting.ts';
import { WEATHER_SKY, weatherLooksIn, weatherSettingsSource } from '../../../../src/mapEditor/modules/weather/weatherSettings.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map's weather settings, as Map Properties shows them while J-Weather is on: the look the map shows, and whether it
 * opts out of weather altogether, each read from the note exactly as J-Weather reads it on arrival and each written back
 * into the note in place (the note writer's own tests hold how). The settings show what the game will do: a note opting
 * out and naming a look shows both, and says under the look that it never shows, since the opt-out outranks it.
 *
 * The looks are listed from config.weather.json, in the order it holds them and named exactly as J-Weather finds them,
 * case and all, beside a choice naming none. The config's own notes, such as _comment_faces, are never listed, nor is any
 * name a map's tag could not spell. A look the note names that the config lacks shows as itself, saying the game shows
 * nothing for it, and is written back untouched until somebody picks another; before the config is read, the look the
 * note names shows as itself and nothing is said of it; a config J-Weather could not start from lists no looks and says
 * so. A note naming a look more than once says so above the settings, showing the one the game reads.
 *
 * The section shows the map's sky setting too while J-Weather is the first plugin the active modules say reads the sky,
 * and otherwise leaves it to that plugin's section, so it shows once. Each change is one step in the map's history.
 */
describe('weatherSettings', () =>
{
  /**
   * J-Weather's config as the server serves it: one motion, and looks named every way a config might name them, notes
   * and names no tag can spell among them.
   */
  const CONFIG = {
    motions: { fall: { edge: 'top' } },
    presets: {
      rain: { stops: { moderate: [] } },
      _comment_faces: [ 'These are what clear wears in a season.' ],
      Snow: { stops: { moderate: [] } },
      '1st-frost': { stops: { moderate: [] } },
      'heavy rain': { stops: { moderate: [] } },
      fog: { stops: { moderate: [] } },
    },
  } as unknown as JsonValue;

  /**
   * The config as read, holding the looks above.
   */
  const READ: ConfigRead = { content: CONFIG, problem: null };

  /**
   * The plugins reading the sky while none does.
   * @returns {readonly SkyReader[]} None.
   */
  const noReaders = (): readonly SkyReader[] => [];

  /**
   * J-Weather's config as the window holds it, as given: read, or undefined while unread.
   * @param {ConfigRead | undefined} read The config as read.
   * @returns {OnDemandConfig} The config.
   */
  const held = (read: ConfigRead | undefined): OnDemandConfig => ({
    current: () => read,
    request: () => undefined,
    subscribe: () => () => undefined,
  });

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

  /**
   * The opt-out as the section shows it.
   * @param {boolean} value Whether the map opts out.
   * @returns {Omit<MapPropertyField, 'write'>} The setting.
   */
  const optOut = (value: boolean): Omit<MapPropertyField, 'write'> => ({
    key: 'weather.none',
    label: 'No weather',
    control: { kind: 'check' },
    value,
    step: 'Change weather',
    hint: 'Keeps all weather off this map, its own and the sky\'s.',
  });

  /**
   * The look's choices: none of its own, then the given names, each named as itself.
   * @param {string[]} names The looks.
   * @returns {{ kind: 'select', options: { value: string, label: string }[] }} The control.
   */
  const looks = (...names: string[]) => ({
    kind: 'select',
    options: [ { value: '', label: 'None of its own' }, ...names.map(name => ({ value: name, label: name })) ],
  });

  describe('weatherLooksIn', () =>
  {
    it('lists the looks in the config\'s order, named as written, leaving out its notes and every name no tag can spell', () =>
    {
      // Arrange: the config above.

      // Act.
      const names = weatherLooksIn(READ);

      // Assert.
      expect(names)
        .toStrictEqual([ 'rain', 'Snow', 'fog' ]);
    });

    it('lists nothing for a config that could not be read, or one J-Weather could not start from', () =>
    {
      // Arrange: a file the server could not give, and one holding looks but no motions.
      const reads: ConfigRead[] = [ { content: null, problem: 'no such file' }, { content: { presets: { rain: {} } }, problem: null } ];

      // Act.
      const names = reads.map(weatherLooksIn);

      // Assert.
      expect(names)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('weatherSettingsSource', () =>
  {
    it('offers a map naming no look none of its own and the opt-out, listing nothing more before the config is read', () =>
    {
      // Arrange.
      const map = mapNoted('<noToneChange>\n');

      // Act.
      const model = weatherSettingsSource(held(undefined), noReaders)(map);

      // Assert.
      expect([ model.note, model.fields.map(shown) ])
        .toStrictEqual([
          null,
          [
            { key: 'weather.look', label: 'Look', control: looks(), value: '', step: 'Change weather' },
            optOut(false),
          ],
        ]);
    });

    it('lists every look once the config is read, showing the one the note names', () =>
    {
      // Arrange.
      const map = mapNoted('<weather:fog>');

      // Act.
      const [ look ] = weatherSettingsSource(held(READ), noReaders)(map).fields;

      // Assert.
      expect(shown(look))
        .toStrictEqual({ key: 'weather.look', label: 'Look', control: looks('rain', 'Snow', 'fog'), value: 'fog', step: 'Change weather' });
    });

    it('shows a look the config lacks as itself, saying the game shows nothing for it, and writes it back untouched', () =>
    {
      // Arrange: a look named in small letters, which the config holds only in capitals.
      const map = mapNoted('<weather:snow>\n');
      const [ look ] = weatherSettingsSource(held(READ), noReaders)(map).fields;

      // Act.
      const written = look.write('snow');

      // Assert.
      expect([ shown(look), written ])
        .toStrictEqual([
          {
            key: 'weather.look',
            label: 'Look',
            control: looks('rain', 'Snow', 'fog', 'snow'),
            value: 'snow',
            step: 'Change weather',
            hint: 'The project has no look named snow, so nothing shows here.',
          },
          { note: '<weather:snow>\n' },
        ]);
    });

    it('shows the look the note names as itself before the config is read, saying nothing of it', () =>
    {
      // Arrange.
      const map = mapNoted('<weather:snow>');

      // Act.
      const [ look ] = weatherSettingsSource(held(undefined), noReaders)(map).fields;

      // Assert.
      expect(shown(look))
        .toStrictEqual({ key: 'weather.look', label: 'Look', control: looks('snow'), value: 'snow', step: 'Change weather' });
    });

    it('shows a note opting out and naming a look as the game reads it, saying the look never shows', () =>
    {
      // Arrange.
      const map = mapNoted('<weather:rain>\n<noWeather>');

      // Act.
      const model = weatherSettingsSource(held(READ), noReaders)(map);

      // Assert.
      expect(model.fields.map(shown))
        .toStrictEqual([
          {
            key: 'weather.look',
            label: 'Look',
            control: looks('rain', 'Snow', 'fog'),
            value: 'rain',
            step: 'Change weather',
            hint: 'No weather is ticked, so this never shows.',
          },
          optOut(true),
        ]);
    });

    it('says nothing under the look of a map opting out and naming none', () =>
    {
      // Arrange.
      const map = mapNoted('<noWeather>');

      // Act.
      const model = weatherSettingsSource(held(READ), noReaders)(map);

      // Assert.
      expect(model.fields.map(shown))
        .toStrictEqual([
          { key: 'weather.look', label: 'Look', control: looks('rain', 'Snow', 'fog'), value: '', step: 'Change weather' },
          optOut(true),
        ]);
    });

    it('lists no looks while the config is one J-Weather could not start from, and says so', () =>
    {
      // Arrange.
      const map = mapNoted('<weather:rain>');
      const unread: ConfigRead = { content: null, problem: 'no such file' };

      // Act.
      const [ look ] = weatherSettingsSource(held(unread), noReaders)(map).fields;

      // Assert.
      expect([ look.control, look.value, look.hint ])
        .toStrictEqual([ looks('rain'), 'rain', 'No looks are listed until data/config.weather.json is fixed.' ]);
    });

    it('says when the note names a look more than once, showing the one the game reads', () =>
    {
      // Arrange: two lines naming a look; the game reads the last.
      const map = mapNoted('<weather:rain>\n<weather:fog>');

      // Act.
      const model = weatherSettingsSource(held(READ), noReaders)(map);

      // Assert.
      expect([ model.note, model.fields[0].value ])
        .toStrictEqual([ 'This note names a look 2 times; the game reads only the one shown here.', 'fog' ]);
    });

    it('writes the look, no look, and the opt-out into the note in place', () =>
    {
      // Arrange.
      const map = mapNoted('<noToneChange>\n<weather:rain>\n');
      const [ look, none ] = weatherSettingsSource(held(READ), noReaders)(map).fields;

      // Act.
      const written = [ look.write('fog'), look.write(''), none.write(true) ];

      // Assert.
      expect(written)
        .toStrictEqual([
          { note: '<noToneChange>\n<weather:fog>\n' },
          { note: '<noToneChange>\n' },
          { note: '<noToneChange>\n<weather:rain>\n<noWeather>\n' },
        ]);
    });

    it('shows the sky setting while J-Weather reads the sky first, and leaves it to the first reader\'s section otherwise', () =>
    {
      // Arrange: a cave, its settings while J-Weather alone reads the sky, and while J-Lighting-Time reads it first.
      const cave = mapNoted('<noToneChange>\n<weather:motes>');
      const sources = [ weatherSettingsSource(held(READ), () => [ WEATHER_SKY ]), weatherSettingsSource(held(READ), () => [ CLOCK_SKY, WEATHER_SKY ]) ];

      // Act.
      const [ alone, after ] = sources.map(source => source(cave).fields);

      // Assert: the cave given its sky back loses the tag and keeps its look.
      expect([ shown(alone[2]), alone[2].write(true), after.map(field => field.key) ])
        .toStrictEqual([
          {
            key: 'weather.sky',
            label: 'Sky follows the weather',
            control: { kind: 'check' },
            value: false,
            step: 'Change sky',
            hint: 'The sky\'s weather reaches this map. Untick it for interiors and caves, which have no sky.',
          },
          { note: '<weather:motes>' },
          [ 'weather.look', 'weather.none' ],
        ]);
    });

    it('makes each change one step in the map\'s history, which undo takes back', () =>
    {
      // Arrange: a cave held in the window's documents.
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('map:1', { ...buildMapJson(), note: '<noToneChange>' } as unknown as JsonValue);
      const source = weatherSettingsSource(held(READ), noReaders);
      const noteIn = () => hub.map('map:1').property('note');

      // Act: a look, then the opt-out, then both undone.
      const steps = [ editModuleProperty(hub, 1, source, 'weather.look', 'rain'), editModuleProperty(hub, 1, source, 'weather.none', true) ];
      const changed = noteIn();
      hub.undo(mapHistoryKey(1));
      const once = noteIn();
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ steps.map(step => step?.label), changed, once, noteIn() ])
        .toStrictEqual([
          [ 'Change weather', 'Change weather' ],
          '<noToneChange>\n<weather:rain>\n<noWeather>',
          '<noToneChange>\n<weather:rain>',
          '<noToneChange>',
        ]);
    });
  });
});

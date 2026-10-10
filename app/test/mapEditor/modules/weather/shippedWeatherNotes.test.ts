import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { ConfigRead } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapPropertyField } from '../../../../src/mapEditor/core/properties/moduleProperties.ts';
import { keepsOtherMeta } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { CLOCK_SKY } from '../../../../src/mapEditor/modules/lighting/mapLighting.ts';
import { skyFollowsClock } from '../../../../src/mapEditor/modules/lighting/skyTag.ts';
import { readMapWeather } from '../../../../src/mapEditor/modules/weather/weatherNote.ts';
import { WEATHER_SKY, weatherLooksIn, weatherSettingsSource } from '../../../../src/mapEditor/modules/weather/weatherSettings.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { addedWrongly, cutWrongly } from '../../support/noteShapes.ts';

/*
 * A map's weather settings, held against every map the game ships.
 *
 * Writing a note in place is only worth anything if it is right on the notes people actually wrote: a look alone, a look
 * after the tag saying a map has no sky, a look after a darkness, an opt-out beside both, notes ending on a line break
 * and notes that do not. So this reads every shipped map's note, and the project's own config.weather.json for the
 * looks, straight from the game's files, never writing to them, and holds three promises over each note.
 *
 * Writing either setting back with the value it shows leaves the note exactly as it was, so opening Map Properties never
 * changes a map by itself.
 *
 * Every change reads back, as J-Weather reads it, as exactly the value written, with the other setting and the map's sky
 * as they were, and the engine reads every other tag in the note as it did; every other character of the note stays
 * exactly as written. A look written over changes only its name, a tag added is a line of its own after the note's last
 * line, with one line break before it and nothing else new, and a tag taken out goes with its line and one line break
 * and nothing else.
 *
 * And every change round-trips: writing the old value back puts back the note byte for byte, except where the change
 * took a tag out, when it comes back on a line of its own at the end, reading as it did.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One shipped map's note, and which map it is.
 */
type ShippedNote = {
  readonly where: string;
  readonly note: string;
};

/**
 * Reads every shipped map's note.
 * @param {string} root The project root.
 * @returns {ShippedNote[]} The notes, in map order.
 */
const readShippedNotes = (root: string): ShippedNote[] =>
{
  return listMapFiles(root).map(file => ({ where: file.replace('.json', ''), note: (readDataFile(root, file) as RmmzMap).note }));
};

const shipped: ShippedNote[] = project === null
  ? []
  : readShippedNotes(project);

/**
 * The game's weather config, as the server would serve it.
 */
const READ: ConfigRead = { content: project === null ? null : readDataFile(project, 'config.weather.json') as JsonValue, problem: null };

/**
 * The looks the game's config lists.
 */
const LOOKS = weatherLooksIn(READ) ?? [];

/**
 * The settings, as they show with J-Lighting-Time and J-Weather on, each reading the sky, which is how the game ships.
 */
const source = weatherSettingsSource({ current: () => READ, request: () => undefined, subscribe: () => () => undefined }, () => [ CLOCK_SKY, WEATHER_SKY ]);

/**
 * A weather tag alone on its line, as every shipped map writes one.
 */
const WEATHER_LINE = /^<weather: ?[a-zA-Z][a-zA-Z0-9_-]*>$/iu;

/**
 * The opt-out, as every shipped map writes it.
 */
const NO_WEATHER_LINE = '<noWeather>';

/**
 * Reads a note's settings as the section shows them, by key.
 * @param {string} note The note.
 * @returns {Map<string, MapPropertyField>} The settings.
 */
const fieldsOf = (note: string): Map<string, MapPropertyField> =>
{
  const map = MapDocument.fromJson('map:1', { ...buildMapJson(), note });
  return new Map(source(map).fields.map(field => [ field.key, field ]));
};

/**
 * Writes one setting of a note, as the section writes it.
 * @param {string} note The note.
 * @param {string} key The setting.
 * @param {JsonValue} value Its new value.
 * @returns {string} The note as written.
 */
const written = (note: string, key: string, value: JsonValue): string =>
{
  return (fieldsOf(note).get(key) as MapPropertyField).write(value).note as string;
};

/**
 * Finds a note's weather tag line, which every shipped map writes alone on its line, if it has one.
 * @param {string} note The note.
 * @returns {string | null} The line, or null when the note has none.
 */
const weatherLineOf = (note: string): string | null =>
{
  return note.split(/\r\n|\n|\r/u).find(line => WEATHER_LINE.test(line)) ?? null;
};

/**
 * Checks every change to a map's look: another look, and none where it names one.
 * @param {ShippedNote} map The map.
 * @returns {{ checked: number, problems: string[] }} How many changes were checked, and what went wrong.
 */
const lookProblems = (map: ShippedNote): { checked: number; problems: string[] } =>
{
  const { where, note } = map;
  const was = readMapWeather(note);
  const line = weatherLineOf(note);
  const other = LOOKS.find(look => look !== was.preset) as string;
  const values = was.preset === null ? [ other ] : [ other, '' ];
  const problems = values.flatMap(value =>
  {
    const label = `${where} look ${JSON.stringify(value)}`;
    const after = written(note, 'weather.look', value);
    const now = readMapWeather(after);
    const back = written(after, 'weather.look', was.preset ?? '');
    const reads = now.preset === (value === '' ? null : value)
      && now.suppressed === was.suppressed
      && skyFollowsClock(after) === skyFollowsClock(note)
      && keepsOtherMeta(note, after, key => key.toLowerCase() === 'weather');

    // a look's name alone is written over, a tag added sits on a line of its own at the end, and one taken out goes whole.
    let shape: string | null = null;
    if (line !== null && value !== '')
    {
      shape = after === note.replace(line, `${line.slice(0, line.length - 1 - (was.preset as string).length)}${value}>`) ? null : `${note} became ${after}`;
    }
    else if (line !== null)
    {
      shape = cutWrongly(note, after, line);
    }
    else
    {
      shape = addedWrongly(note, after, `<weather:${value}>`);
    }

    // writing the old look back puts back the bytes, unless the tag went, when it comes back reading as it did.
    const roundTrip = line !== null && value === ''
      ? readMapWeather(back).preset === was.preset && addedWrongly(after, back, `<weather:${was.preset as string}>`) === null
      : back === note;
    return [
      ...(reads ? [] : [ `${label}: reads back as ${JSON.stringify(now)}` ]),
      ...(shape === null ? [] : [ `${label}: ${shape}` ]),
      ...(roundTrip ? [] : [ `${label}: written back as ${JSON.stringify(back)}` ]),
    ];
  });

  return { checked: values.length, problems };
};

/**
 * Checks the change to whether a map opts out of weather.
 * @param {ShippedNote} map The map.
 * @returns {{ checked: number, problems: string[] }} How many changes were checked, and what went wrong.
 */
const optOutProblems = (map: ShippedNote): { checked: number; problems: string[] } =>
{
  const { where, note } = map;
  const was = readMapWeather(note);
  const label = `${where} no weather ${was.suppressed === false}`;
  const after = written(note, 'weather.none', was.suppressed === false);
  const now = readMapWeather(after);
  const back = written(after, 'weather.none', was.suppressed);
  const reads = now.suppressed === (was.suppressed === false)
    && now.preset === was.preset
    && skyFollowsClock(after) === skyFollowsClock(note)
    && keepsOtherMeta(note, after, key => key.toLowerCase() === 'noweather');

  // opting out adds the tag at the end; opting back in takes it out whole.
  const shape = was.suppressed
    ? cutWrongly(note, after, NO_WEATHER_LINE)
    : addedWrongly(note, after, NO_WEATHER_LINE);

  // opting out and back in puts back the bytes; opting back in and out again puts the tag last.
  const roundTrip = was.suppressed
    ? readMapWeather(back).suppressed && addedWrongly(after, back, NO_WEATHER_LINE) === null
    : back === note;
  return {
    checked: 1,
    problems: [
      ...(reads ? [] : [ `${label}: reads back as ${JSON.stringify(now)}` ]),
      ...(shape === null ? [] : [ `${label}: ${shape}` ]),
      ...(roundTrip ? [] : [ `${label}: written back as ${JSON.stringify(back)}` ]),
    ],
  };
};

describe.skipIf(project === null)('every shipped map\'s weather', () =>
{
  it('leaves every note exactly as it was when each weather setting is written back with the value it shows', () =>
  {
    // Arrange: every map, with its settings.
    const maps = shipped.map(map => ({ ...map, weather: readMapWeather(map.note), fields: [ ...fieldsOf(map.note).values() ] }));

    // Act.
    const changed = maps.flatMap(({ where, note, fields }) => fields
      .filter(field => field.write(field.value).note !== note)
      .map(field => `${where} ${field.key}`));

    // Assert: hundreds of maps, dozens naming a look and dozens opting out, a config listing several looks, and not one
    // note changed.
    expect([
      maps.length > 380,
      maps.filter(({ weather }) => weather.preset !== null).length > 75,
      maps.filter(({ weather }) => weather.suppressed).length > 30,
      LOOKS.length > 5,
      changed,
    ])
      .toStrictEqual([ true, true, true, true, [] ]);
  });

  it('writes every change in place, reads it back as written with every other tag as it was, and round-trips it', () =>
  {
    // Arrange: every map, and each of its two settings.
    const checks = [ lookProblems, optOutProblems ];

    // Act.
    const results = shipped.flatMap(map => checks.map(check => check(map)));
    const checked = results.reduce((sum, result) => sum + result.checked, 0);
    const problems = results.flatMap(result => result.problems);

    // Assert: well over eight hundred changes, every one right.
    expect([ checked > 800, problems ])
      .toStrictEqual([ true, [] ]);
  });
});

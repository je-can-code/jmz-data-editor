import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapPropertyField } from '../../../../src/mapEditor/core/properties/moduleProperties.ts';
import { readMapDarkness, type MapDarkness } from '../../../../src/mapEditor/modules/lighting/ambientNote.ts';
import { ambientColorFrom } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';
import { CLOCK_SKY, mapLightingSource } from '../../../../src/mapEditor/modules/lighting/mapLighting.ts';
import { skyFollowsClock } from '../../../../src/mapEditor/modules/lighting/skyTag.ts';
import { WEATHER_SKY } from '../../../../src/mapEditor/modules/weather/weatherSettings.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map's lighting settings, held against every map the game ships, darkness, colour and sky alike.
 *
 * Writing a note in place is only worth anything if it is right on the notes people actually wrote: the bare sky tag,
 * the sky tag beside weather tags, a darkness with a colour and without, a darkness before other tags and after them,
 * notes ending on a line break and notes that do not. So this reads every shipped map's note and holds three promises
 * over each of them.
 *
 * Writing any setting back with the value it shows leaves the note exactly as it was, so opening Map Properties never
 * changes a map by itself.
 *
 * Every change reads back, as the game reads it, as exactly the value written, with the map's other two settings as they
 * were; and every other character of the note stays exactly as written. A value written over is the only text that
 * changes, a tag added is a line of its own after the note's last line, with one line break before it and nothing else
 * new, and a tag taken out goes with its line and one line break and nothing else.
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
 * The colour the game's config gives a dark whose colour it cannot use.
 */
const DEFAULT = ambientColorFrom(project === null ? null : readDataFile(project, 'config.lighting.json') as JsonValue);

/**
 * The settings, as they show with J-Lighting-Time and J-Weather on, each reading the sky, which is how the game ships.
 */
const source = mapLightingSource(DEFAULT, () => [ CLOCK_SKY, WEATHER_SKY ]);

/**
 * The sky tag, as every shipped map writes it.
 */
const NO_SKY_LINE = '<noToneChange>';

/**
 * A darkness tag alone on its line, as every shipped map writes one.
 */
const AMBIENT_LINE = /^<ambient:\[[^\]]*\]>$/iu;

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
 * Finds a note's darkness tag line, which every shipped map writes alone on its line, if it has one.
 * @param {string} note The note.
 * @returns {string | null} The line, or null when the note has none.
 */
const ambientLineOf = (note: string): string | null =>
{
  return note.split(/\r\n|\n|\r/u).find(line => AMBIENT_LINE.test(line)) ?? null;
};

/**
 * Takes a line out of a note by hand, the way a tag is taken out: the line and the break after it, or, on the note's
 * last line, the break before it.
 * @param {string} note The note.
 * @param {string} line The line, which the note holds alone on a line.
 * @returns {string} The note without it.
 */
const lineCut = (note: string, line: string): string =>
{
  const at = note.indexOf(line);
  const after = note.slice(at + line.length);
  if (after.startsWith('\n'))
  {
    return `${note.slice(0, at)}${after.slice(1)}`;
  }

  return `${note.slice(0, Math.max(at - 1, 0))}${after}`;
};

/**
 * Says what is wrong with a line added to a note, if anything: it must sit after every line of text the note had, with
 * only line breaks after it, and taking it out with the one line break it brought, the one before it or, first in the
 * note, the one after it, must leave the note exactly as it was.
 * @param {string} before The note before.
 * @param {string} after The note after.
 * @param {string} line The line added.
 * @returns {string | null} What is wrong, or null when nothing is.
 */
const addedWrongly = (before: string, after: string, line: string): string | null =>
{
  const at = after.lastIndexOf(line);
  const rest = after.slice(at + line.length);
  const head = after.slice(0, at);
  let restored = `${head}${rest.startsWith('\n') ? rest.slice(1) : rest}`;
  if (head.endsWith('\n'))
  {
    restored = `${head.slice(0, -1)}${rest}`;
  }

  if (at === -1 || /^[\r\n]*$/u.test(rest) === false || restored !== before)
  {
    return `${JSON.stringify(before)} became ${JSON.stringify(after)}`;
  }

  return null;
};

/**
 * Says what is wrong with a line taken out of a note, if anything: the note must be exactly what taking the line out by
 * hand leaves.
 * @param {string} before The note before.
 * @param {string} after The note after.
 * @param {string} line The line taken out.
 * @returns {string | null} What is wrong, or null when nothing is.
 */
const cutWrongly = (before: string, after: string, line: string): string | null =>
{
  return after === lineCut(before, line)
    ? null
    : `${JSON.stringify(before)} became ${JSON.stringify(after)}`;
};

/**
 * Reads what a note's settings come to: how dark, the colour as written, and whether the sky follows the clock.
 * @param {string} note The note.
 * @returns {{ darkness: MapDarkness, sky: boolean }} The settings.
 */
const readingOf = (note: string): { darkness: MapDarkness; sky: boolean } =>
{
  return { darkness: readMapDarkness(note, DEFAULT), sky: skyFollowsClock(note) };
};

/**
 * Checks every change to a map's darkness: each other darkness, and none.
 * @param {ShippedNote} map The map.
 * @returns {{ checked: number, problems: string[] }} How many changes were checked, and what went wrong.
 */
const darknessProblems = (map: ShippedNote): { checked: number; problems: string[] } =>
{
  const { where, note } = map;
  const was = readingOf(note);
  const line = ambientLineOf(note);
  const values = [ 0, 1, 37.5, 60, 100 ].filter(value => value !== was.darkness.percent);
  const problems = values.flatMap(value =>
  {
    const label = `${where} darkness ${value}`;
    const after = written(note, 'lighting.darkness', value);
    const now = readingOf(after);
    const back = written(after, 'lighting.darkness', was.darkness.percent);
    const reads = now.darkness.percent === value
      && now.sky === was.sky
      && (value === 0 || line === null || now.darkness.colorText === was.darkness.colorText);

    // the darkness alone is written over, a tag added sits on a line of its own at the end, and one taken out goes whole.
    let shape: string | null = null;
    if (line !== null && value > 0)
    {
      shape = after === note.replace(line, line.replace(/\[[\d.]+/u, `[${value}`)) ? null : `${note} became ${after}`;
    }
    else if (line !== null)
    {
      shape = cutWrongly(note, after, line);
    }
    else
    {
      shape = addedWrongly(note, after, `<ambient:[${value}]>`);
    }

    // writing the old darkness back puts back the bytes, unless the tag went, when it comes back reading as it did.
    const roundTrip = line !== null && value === 0
      ? readingOf(back).darkness.percent === was.darkness.percent && addedWrongly(after, back, ambientLineOf(back) as string) === null
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
 * Checks every change to a dark map's colour: another colour, and none where it names one.
 * @param {ShippedNote} map The map.
 * @returns {{ checked: number, problems: string[] }} How many changes were checked, and what went wrong.
 */
const colorProblems = (map: ShippedNote): { checked: number; problems: string[] } =>
{
  const { where, note } = map;
  const was = readingOf(note);
  const line = ambientLineOf(note);
  if (line === null)
  {
    return { checked: 0, problems: fieldsOf(note).has('lighting.darkColor') ? [ `${where}: a colour for a map that is not dark` ] : [] };
  }

  const named = was.darkness.colorText;
  const other = named.toLowerCase() === '#123456' ? '#654321' : '#123456';
  const values = named === '' ? [ other ] : [ other, '' ];
  const problems = values.flatMap(value =>
  {
    const label = `${where} colour ${JSON.stringify(value)}`;
    const after = written(note, 'lighting.darkColor', value);
    const now = readingOf(after);
    const back = written(after, 'lighting.darkColor', named);
    const reads = now.darkness.colorText === value && now.darkness.percent === was.darkness.percent && now.sky === was.sky;

    // the colour alone is written over, put in after the darkness, or taken off with the separator before it.
    let meantLine = line.replace(/, ?#[0-9a-f]+/iu, '');
    if (value !== '')
    {
      meantLine = named === '' ? line.replace(']>', `, ${value}]>`) : line.replace(/#[0-9a-f]+/iu, value);
    }

    return [
      ...(reads ? [] : [ `${label}: reads back as ${JSON.stringify(now)}` ]),
      ...(after === note.replace(line, meantLine) ? [] : [ `${label}: ${note} became ${after}` ]),
      ...(back === note ? [] : [ `${label}: written back as ${JSON.stringify(back)}` ]),
    ];
  });

  return { checked: values.length, problems };
};

/**
 * Checks the change to a map's sky.
 * @param {ShippedNote} map The map.
 * @returns {{ checked: number, problems: string[] }} How many changes were checked, and what went wrong.
 */
const skyProblems = (map: ShippedNote): { checked: number; problems: string[] } =>
{
  const { where, note } = map;
  const was = readingOf(note);
  const label = `${where} sky ${was.sky === false}`;
  const after = written(note, 'lighting.sky', was.sky === false);
  const now = readingOf(after);
  const back = written(after, 'lighting.sky', was.sky);
  const reads = now.sky === (was.sky === false)
    && now.darkness.percent === was.darkness.percent
    && now.darkness.colorText === was.darkness.colorText;

  // a sky stilled gains the tag at the end; a sky following the clock again loses its tag whole.
  const shape = was.sky
    ? addedWrongly(note, after, NO_SKY_LINE)
    : cutWrongly(note, after, NO_SKY_LINE);

  // stilling it and letting it go again puts back the bytes; letting it go and stilling it again puts the tag last.
  const roundTrip = was.sky
    ? back === note
    : skyFollowsClock(back) === false && addedWrongly(after, back, NO_SKY_LINE) === null;
  return {
    checked: 1,
    problems: [
      ...(reads ? [] : [ `${label}: reads back as ${JSON.stringify(now)}` ]),
      ...(shape === null ? [] : [ `${label}: ${shape}` ]),
      ...(roundTrip ? [] : [ `${label}: written back as ${JSON.stringify(back)}` ]),
    ],
  };
};

describe.skipIf(project === null)('every shipped map\'s lighting', () =>
{
  it('leaves every note exactly as it was when each setting is written back with the value it shows', () =>
  {
    // Arrange: every map, with its settings.
    const maps = shipped.map(map => ({ ...map, fields: [ ...fieldsOf(map.note).values() ] }));

    // Act.
    const changed = maps.flatMap(({ where, note, fields }) => fields
      .filter(field => field.write(field.value).note !== note)
      .map(field => `${where} ${field.key}`));

    // Assert: hundreds of maps, dozens of them dark, hundreds with no sky, and not one note changed.
    expect([
      maps.length > 380,
      maps.filter(({ fields }) => fields.length === 3).length > 25,
      maps.filter(({ note }) => skyFollowsClock(note) === false).length > 150,
      changed,
    ])
      .toStrictEqual([ true, true, true, [] ]);
  });

  it('writes every change in place, reads it back as written, and round-trips it', () =>
  {
    // Arrange: every map, and each of its three settings.
    const checks = [ darknessProblems, colorProblems, skyProblems ];

    // Act.
    const results = shipped.flatMap(map => checks.map(check => check(map)));
    const checked = results.reduce((sum, result) => sum + result.checked, 0);
    const problems = results.flatMap(result => result.problems);

    // Assert: well over a thousand changes, every one right.
    expect([ checked > 1500, problems ])
      .toStrictEqual([ true, [] ]);
  });
});

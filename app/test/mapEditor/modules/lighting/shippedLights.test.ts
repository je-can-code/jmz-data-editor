import { describe, expect, it } from 'vitest';
import type { EventEdit, QuickField } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { cloneJson, jsonEquals, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { lightDefaultsFrom } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';
import { lightQuickModel } from '../../../../src/mapEditor/modules/lighting/lightPanel.ts';
import {
  firstLitPage,
  isEffect,
  isLight,
  normalizeHex,
  readLightLine,
  readValue,
  type LightDeclaration,
  type LightEffect,
} from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { lightTagParts } from '../../../../src/mapEditor/modules/lighting/lightTagWriter.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { applyEdits } from '../../support/eventKindFixtures.ts';

/*
 * The light panel, held against every light the game ships.
 *
 * Rewriting a tag in place is only worth anything if it is right on the tags people actually wrote, in every shape
 * they wrote them: on a comment's first line or a later one, two to a page, lit on a later page, with three values or
 * four. So this reads every light on every shipped map, on the page its panel shows, and holds two promises over all
 * of them. Writing any setting back with the value it shows leaves the event exactly as it was, so opening a quick
 * panel never changes a map by itself. And changing any one setting (the reach, the colour, the intensity, or the
 * effect, each other effect in turn, steady included) is one change to that light's own line and nothing else on the
 * event, reads back as the same light with only that part changed, and leaves the line as it was written around it:
 * the tag's name and everything before its list, everything after it, and every value of the other parts.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One shipped light and where it lives.
 */
type ShippedLight = {
  readonly where: string;
  readonly event: RmmzMapEvent;
};

/**
 * Reads every light on every shipped map.
 * @param {string} root The project root.
 * @returns {ShippedLight[]} The lights, in map and id order.
 */
const readShippedLights = (root: string): ShippedLight[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event => (event !== null && isLight(event)
      ? [ { where: `${file.replace('.json', '')}#${event.id}`, event } ]
      : []));
  });
};

const shipped: ShippedLight[] = project === null
  ? []
  : readShippedLights(project);

/**
 * What the game's lights fall back to, from its own config.
 */
const DEFAULTS = lightDefaultsFrom(project === null ? null : readDataFile(project, 'config.lighting.json') as JsonValue);

/**
 * The panel's settings for a light.
 * @param {RmmzMapEvent} event The light.
 * @returns {readonly QuickField[]} The settings.
 */
const fieldsOf = (event: RmmzMapEvent): readonly QuickField[] =>
{
  return lightQuickModel(DEFAULTS, firstLitPage)(event, { events: [], names: null }).fields;
};

/**
 * The effects, in the order the panel numbers them.
 */
const EFFECTS: readonly LightEffect[] = [ 'steady', 'flicker', 'pulse', 'glitch' ];

/**
 * The part of a light a setting changes, by the last word of its key.
 */
type Part = 'radius' | 'color' | 'intensity' | 'effect';

/**
 * Picks the new values to try for a setting, from the value it shows: one other reach, colour and intensity, and every
 * other effect.
 * @param {Part} part The part.
 * @param {JsonValue} shown The value the setting shows.
 * @returns {JsonValue[]} The values.
 */
const newValuesFor = (part: Part, shown: JsonValue): JsonValue[] =>
{
  switch (part)
  {
    case 'radius':
      return [ (shown as number) + 0.5 ];
    case 'color':
      return [ shown === '#123456' ? '#654321' : '#123456' ];
    case 'intensity':
      return [ ((shown as number) + 7) % 101 ];
    case 'effect':
      return EFFECTS.map((_, index) => index).filter(index => index !== shown);
  }
};

/**
 * Works out the light a line should read as once a part changed.
 * @param {Part} part The part.
 * @param {LightDeclaration} light The light as it was.
 * @param {JsonValue} value The part's new value, as the panel hands it on.
 * @returns {LightDeclaration} The light it should be.
 */
const meantLight = (part: Part, light: LightDeclaration, value: JsonValue): LightDeclaration =>
{
  switch (part)
  {
    case 'radius':
      return { ...light, radius: value as number };
    case 'color':
      return { ...light, color: value as string };
    case 'intensity':
      return { ...light, intensity: (value as number) / 100 };
    case 'effect':
      return { ...light, effect: EFFECTS[value as number] };
  }
};

/**
 * Reads what a line writes around the part being changed: everything before its list and after it, and every other
 * value in order, each with the separator written before it. The part's value is left out, or for a light made steady
 * every effect named, since steady takes them all off.
 * @param {string} line The line.
 * @param {Part} part The part being changed.
 * @param {boolean} steadied Whether the change makes the light steady.
 * @returns {string[]} What the line writes, apart from that part.
 */
const frameAround = (line: string, part: Part, steadied: boolean): string[] =>
{
  const parts = lightTagParts(line);
  const { values } = parts;
  const changing: Record<Part, (index: number) => boolean> = {
    radius: index => index === 0,
    color: index => index === parts.color,
    intensity: index => index === parts.intensity,
    effect: index => (steadied ? isEffect(readValue(values[index].text)) : index === parts.effect),
  };
  return [
    line.slice(0, values[0].start),
    line.slice(values[values.length - 1].end),
    ...values.filter((_, index) => changing[part](index) === false).map(value => `${value.separator}${value.text}`),
  ];
};

/**
 * Checks one change to one light, and says what went wrong with it, if anything.
 * @param {ShippedLight} light The light.
 * @param {QuickField} field The setting changed.
 * @param {JsonValue} value Its new value.
 * @returns {string[]} What went wrong; none when the change is right.
 */
const problemsWith = (light: ShippedLight, field: QuickField, value: JsonValue): string[] =>
{
  const { where, event } = light;
  const part = field.key.split('.').at(-1) as Part;
  const label = `${where} ${field.key} ${JSON.stringify(value)}`;
  let edits: EventEdit[];
  try
  {
    edits = field.write(value);
  }
  catch (error)
  {
    return [ `${label}: ${(error as Error).message}` ];
  }

  const [ edit ] = edits;
  if (edits.length !== 1 || edit.kind !== 'set')
  {
    return [ `${label}: ${edits.length} edits` ];
  }

  // the edit lands on one light's own line; put the old line back and the event must be as it was.
  const [ , pageIndex, , listIndex ] = edit.path as [ string, number, string, number ];
  const before = event.pages[pageIndex].list[listIndex].parameters[0] as string;
  const after = edit.value as string;
  const restored = cloneJson(applyEdits(event, edits));
  restored.pages[pageIndex].list[listIndex].parameters[0] = before;
  const read = readLightLine(after, DEFAULTS);
  const meant = meantLight(part, readLightLine(before, DEFAULTS) as LightDeclaration, value);
  const sameLight = read !== null
    && read.radius === meant.radius
    && normalizeHex(read.color) === normalizeHex(meant.color)
    && read.intensity === meant.intensity
    && read.effect === meant.effect;

  const steadied = part === 'effect' && value === 0;
  return [
    ...(jsonEquals(restored, event) ? [] : [ `${label}: changed more than its line` ]),
    ...(sameLight ? [] : [ `${label}: reads back as ${JSON.stringify(read)}` ]),
    ...(jsonEquals(frameAround(after, part, steadied), frameAround(before, part, steadied)) ? [] : [ `${label}: ${before} became ${after}` ]),
  ];
};

describe.skipIf(project === null)('every shipped light', () =>
{
  it('leaves every light exactly as it was when each of its settings is written back with its own value', () =>
  {
    // Arrange: every light on every map, with its settings.
    const lights = shipped.map(each => ({ ...each, fields: fieldsOf(each.event) }));

    // Act.
    const changed = lights.flatMap(({ where, event, fields }) => fields
      .filter(field => jsonEquals(applyEdits(event, field.write(field.value)), event) === false)
      .map(field => `${where} ${field.key}`));

    // Assert: hundreds of lights, every one with four settings a light, and none changed.
    expect([ lights.length > 700, lights.every(({ fields }) => fields.length >= 4 && fields.length % 4 === 0), changed ])
      .toStrictEqual([ true, true, [] ]);
  });

  it('changes only the part asked for, on that light\'s own line, leaving the rest of the line as it was written', () =>
  {
    // Arrange: every light on every map, every setting of each, and the values each setting is changed to.
    const changes = shipped.flatMap(light => fieldsOf(light.event).flatMap(field =>
    {
      const part = field.key.split('.').at(-1) as Part;
      return newValuesFor(part, field.value).map(value => ({ light, field, value }));
    }));

    // Act.
    const problems = changes.flatMap(({ light, field, value }) => problemsWith(light, field, value));

    // Assert.
    expect([ changes.length > 3000, problems ])
      .toStrictEqual([ true, [] ]);
  });
});

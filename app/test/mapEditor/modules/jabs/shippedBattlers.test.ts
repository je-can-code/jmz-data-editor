import { describe, expect, it } from 'vitest';
import {
  addExactly,
  eventFields,
  tagFieldKey,
  tagLinesOf,
  type Field,
  type PageTagLine,
  type TagField,
} from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { withBlueprintLink, type BlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { planCopyChange, type CopyChange } from '../../../../src/mapEditor/core/blueprints/copyChanges.ts';
import { rewireGroupReferences } from '../../../../src/mapEditor/core/events/eventReferences.ts';
import { jsonEquals, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { AI_ROLES, AI_TRAITS, BATTLER_SETTINGS, battlerTagFields } from '../../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { isBattler } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { lightTagFields } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * J-ABS's tags and the field model held against every battler the game ships: every event with a page whose comments
 * name the enemy it fights as, each read from the game's map files and held in memory only, a mirror nothing writes back
 * to. The tags are read as the game's own plugins run them: J-ABS's, the level J-LevelMaster reads, and J-Lighting's
 * light; every other tag line is one choice holding the whole line.
 *
 * Every field of every tag line on every page of every battler reads and writes back. Writing the value a field reads
 * leaves its line byte for byte, and writing another value the field can hold changes that field alone: every other field
 * of the page reads as it did, the line still reads as the same line, and no other command moves.
 *
 * Every battler, taken for its own blueprint's event and changed in a few fields (on the page naming its enemy: the
 * enemy, its move speed, sight, level and first motion, where it has each, and the page's trigger), plans its copies so
 * that nothing outside those fields moves. A copy in line comes out as the changed blueprint, byte for byte but for its
 * id, where it stands and its note. A copy whose move speed and first motion were tuned by hand keeps its motion, keeps
 * its speed 1 above the blueprint's, holding that in its link, and follows everything else.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * The tags the game's plugins read from a battler's comments: J-ABS's, the level J-LevelMaster reads, and J-Lighting's
 * light, read with the plugin's own defaults.
 */
const TAGS = [ lightTagFields(PLUGIN_DEFAULTS), ...battlerTagFields(true) ];

/**
 * How far from the original each copy's id sits.
 */
const ID_GAP = 1000;

/**
 * One shipped battler, and the map it is on.
 */
type ShippedBattler = {
  readonly mapId: number;
  readonly event: RmmzMapEvent;
};

/**
 * Reads every battler on every map the game ships, in map and id order.
 * @returns {ShippedBattler[]} The battlers.
 */
const shippedBattlers = (): ShippedBattler[] =>
{
  return listMapFiles(project as string).flatMap(file =>
  {
    const map = readDataFile(project as string, file) as RmmzMap;
    const mapId = Number(file.slice(3, -5));
    return map.events.flatMap(event => (event !== null && isBattler(event) ? [ { mapId, event } ] : []));
  });
};

/**
 * Builds what a copy holds of an event, as placing it rewires it: under the copy's id, standing elsewhere, its commands
 * naming it by id naming the copy, its note as given.
 * @param {RmmzMapEvent} source The event, under the blueprint's id.
 * @param {RmmzMapEvent} noted The event holding the note the copy holds.
 * @returns {RmmzMapEvent} The copy's event.
 */
const placed = (source: RmmzMapEvent, noted: RmmzMapEvent): RmmzMapEvent =>
{
  const id = source.id + ID_GAP;
  return { ...rewireGroupReferences(noted, new Map([ [ source.id, id ] ])), id, x: source.x + 1, y: source.y + 1 };
};

/**
 * Builds a copy of an event as placing it from a blueprint would, its note holding its link.
 * @param {RmmzMapEvent} source The event as the copy holds it, its own differences already made, under the blueprint's id.
 * @returns {RmmzMapEvent} The copy.
 */
const copyOf = (source: RmmzMapEvent): RmmzMapEvent =>
{
  const link: BlueprintLink = { blueprintId: 'k3x9q2mf', eventId: source.id, differences: [] };
  return placed(source, { ...source, note: withBlueprintLink(source.note, link) });
};

/**
 * Puts one line of a page's commands in place of what it held.
 * @param {RmmzEventPage} page The page.
 * @param {number} listIndex Where the line sits.
 * @param {string} text The line's new text.
 * @returns {RmmzEventPage} The page changed.
 */
const withLine = (page: RmmzEventPage, listIndex: number, text: string): RmmzEventPage =>
{
  return { ...page, list: page.list.map((command, index) => (index === listIndex ? { ...command, parameters: [ text ] } : command)) };
};

/**
 * Changes one page of an event.
 * @param {RmmzMapEvent} source The event.
 * @param {number} pageIndex The page, counted from 0.
 * @param {(page: RmmzEventPage) => RmmzEventPage} change What to make of the page.
 * @returns {RmmzMapEvent} The event changed.
 */
const withPage = (source: RmmzMapEvent, pageIndex: number, change: (page: RmmzEventPage) => RmmzEventPage): RmmzMapEvent =>
{
  return { ...source, pages: source.pages.map((page, index) => (index === pageIndex ? change(page) : page)) };
};

/**
 * Writes another number in place of the one a tag line ends on, to as many places as the line wrote it.
 * @param {string} text The line, such as {@code <moveSpeed:4.1>}.
 * @param {number} value The number.
 * @returns {string} The line, such as {@code <moveSpeed:5.1>}.
 */
const withNumber = (text: string, value: number): string =>
{
  const [ written ] = /[\d.]+(?=>$)/u.exec(text) as RegExpExecArray;
  const [ , fraction = '' ] = written.split('.');
  return text.replace(/[\d.]+(?=>$)/u, value.toFixed(fraction.length));
};

/**
 * Picks the word after one among some, wrapping round, which is always another word.
 * @param {readonly string[]} words The words.
 * @param {JsonValue} word The word.
 * @returns {string} The next word.
 */
const nextWord = (words: readonly string[], word: JsonValue): string =>
{
  return words[(words.indexOf(word as string) + 1) % words.length];
};

/**
 * Picks another value a choice of a tag line can hold, for each kind of line: another line of the same tag for a line no
 * module reads, the next id or word for J-ABS's, another respawn, another colour or effect for a light.
 * @param {PageTagLine} line The line.
 * @param {TagField} field The field.
 * @returns {JsonValue | null} Another value, or null for a choice that holds one value alone, as the mark ending respawns.
 */
const otherChoice = (line: PageTagLine, field: TagField): JsonValue | null =>
{
  const { value } = field;
  const others: Record<string, () => JsonValue | null> = {
    'core.tag': () => ((value as string).includes(':') ? `${(value as string).slice(0, -1)}x>` : `${(value as string).slice(0, -1)}:x>`),
    'jabs.enemyId': () => (value as number) + 1,
    'jabs.teamId': () => (value as number) + 1,
    'jabs.respawnAnimation': () => (value as number) + 1,
    'jabs.aiTrait': () => nextWord(AI_TRAITS, value),
    'jabs.aiRole': () => nextWord(AI_ROLES, value),
    'jabs.jabsConfig': () => nextWord(BATTLER_SETTINGS, value),
    'jabs.respawn': () => [ 'seconds', jsonEquals(value, [ 'seconds', 5 ]) ? 6 : 5 ],
    'jabs.noRespawn': () => null,
    'lighting.light': () => (field.name === 'color' ? nextWord([ '#123456', '#654321' ], value) : nextWord([ 'pulse', 'flicker' ], value)),
  };
  return others[line.tag.id]();
};

/**
 * Picks another value a field of a tag line can hold: a number 1 further within its range, or another choice.
 * @param {PageTagLine} line The line.
 * @param {TagField} field The field.
 * @returns {JsonValue | null} Another value, or null for a choice that holds one value alone.
 */
const otherValue = (line: PageTagLine, field: TagField): JsonValue | null =>
{
  if (field.kind.kind === 'choice')
  {
    return otherChoice(line, field);
  }

  const value = field.value as number;
  return value + 1 <= field.kind.max
    ? value + 1
    : value - 1;
};

/**
 * Says what is wrong when one field of one tag line is written: writing the value it reads must leave the line as it is,
 * and writing another value must change that field alone, every other field of the page reading as it did.
 * @param {RmmzMapEvent} battler The battler, its page alone.
 * @param {PageTagLine} line The line.
 * @param {TagField} field The field.
 * @returns {string[]} What is wrong; none when nothing is.
 */
const wrongWrite = (battler: RmmzMapEvent, line: PageTagLine, field: TagField): string[] =>
{
  const [ page ] = battler.pages;
  const text = page.list[line.listIndex].parameters[0] as string;
  const where = `event ${battler.id}, ${line.key}${field.name === '' ? '' : `.${field.name}`}`;
  if (line.tag.write(text, field.name, field.value) !== text)
  {
    return [ `${where}: writing what it reads moved the line` ];
  }

  const other = otherValue(line, field);
  if (other === null)
  {
    return [];
  }

  // the page as it reads, and as it reads once the one field holds another value.
  const written = withLine(page, line.listIndex, line.tag.write(text, field.name, other));
  const key = tagFieldKey(0, line.key, field.name);
  const expected = eventFields(battler, TAGS).map((each: Field) => (each.key === key ? { ...each, value: other } : each));
  return jsonEquals(eventFields({ ...battler, pages: [ written ] }, TAGS), expected)
    ? []
    : [ `${where}: writing ${JSON.stringify(other)} moved something else` ];
};

/**
 * Finds the first line of a tag on a page, under the key it has when it is the page's first of that tag.
 * @param {readonly PageTagLine[]} lines The page's tag lines.
 * @param {string} tagId The tag's id.
 * @param {string} key The line's key.
 * @returns {PageTagLine | undefined} The line, or undefined when the page has none.
 */
const lineOf = (lines: readonly PageTagLine[], tagId: string, key: string): PageTagLine | undefined =>
{
  return lines.find(line => line.tag.id === tagId && line.key === key);
};

/**
 * A battler taken for its blueprint's event, the change made to it, and what a copy tuned by hand must come to.
 */
type BattlerCase = {
  readonly shipped: ShippedBattler;
  readonly after: RmmzMapEvent;
  readonly tuned: RmmzMapEvent;
  readonly tunedAfter: RmmzMapEvent;
};

/**
 * Builds a battler's case: on the page naming its enemy, the blueprint's change turns the enemy to the next one, speeds
 * it up by 1, widens its sight by 1, raises its level by 2 and changes its first motion, where it has each, and moves the
 * page's trigger on; a copy of it tuned by hand moves 1 faster than it and holds a motion of its own, and must come to
 * the changed blueprint, but for moving 1 faster than it still and holding its own motion, its link holding the speed.
 * @param {ShippedBattler} shipped The battler.
 * @param {number} pageIndex The page naming its enemy.
 * @returns {BattlerCase} The case.
 */
const battlerCase = (shipped: ShippedBattler, pageIndex: number): BattlerCase =>
{
  const { event } = shipped;
  const page = event.pages[pageIndex];
  const lines = tagLinesOf(page, TAGS);
  const textAt = (line: PageTagLine): string => page.list[line.listIndex].parameters[0] as string;
  const valueAt = (line: PageTagLine): number => line.fields[0].value as number;
  const [ enemy, speed, sight, level, motion ] = [
    lineOf(lines, 'jabs.enemyId', 'enemyId'),
    lineOf(lines, 'jabs.moveSpeed', 'moveSpeed'),
    lineOf(lines, 'jabs.sight', 'sight'),
    lineOf(lines, 'jabs.level', 'level'),
    lineOf(lines, 'core.tag', '<motion>'),
  ];

  // the blueprint's change, each field moved where the page has it.
  const motions = [ '<motion:[breathe]>', '<motion:[stretch]>', '<motion:[ghost]>', '<motion:[float]>' ].filter(each => motion === undefined || each !== textAt(motion));
  const changes: [ PageTagLine | undefined, (line: PageTagLine) => string ][] = [
    [ enemy, line => withNumber(textAt(line), valueAt(line) + 1) ],
    [ speed, line => withNumber(textAt(line), addExactly(valueAt(line), 1)) ],
    [ sight, line => withNumber(textAt(line), valueAt(line) + 1) ],
    [ level, line => withNumber(textAt(line), valueAt(line) + 2) ],
    [ motion, () => motions[0] ],
  ];
  const changedPage = changes.reduce((each, [ line, text ]) => (line === undefined ? each : withLine(each, line.listIndex, text(line))), page);
  const after = withPage(event, pageIndex, () => ({ ...changedPage, trigger: (page.trigger + 1) % 5 }));

  // the copy tuned by hand, and what it must come to.
  const tunedSpeed = (from: RmmzEventPage, by: number): RmmzEventPage => (speed === undefined ? from : withLine(from, speed.listIndex, withNumber(textAt(speed), addExactly(valueAt(speed), by))));
  const tunedMotion = (from: RmmzEventPage): RmmzEventPage => (motion === undefined ? from : withLine(from, motion.listIndex, motions[1]));
  const tuned = withPage(event, pageIndex, each => tunedMotion(tunedSpeed(each, 1)));
  const differences = speed === undefined ? [] : [ `p${pageIndex + 1}.moveSpeed+1` ];
  const link: BlueprintLink = { blueprintId: 'k3x9q2mf', eventId: event.id, differences };
  const tunedAfter = withPage({ ...after, note: withBlueprintLink(after.note, link) }, pageIndex, each => tunedMotion(tunedSpeed(each, 2)));
  return { shipped, after, tuned, tunedAfter };
};

/**
 * Says what is wrong with a plan, if anything: it must change the copy into exactly the event given, byte for byte.
 * @param {ShippedBattler} shipped The battler and its map.
 * @param {CopyChange} outcome The plan.
 * @param {RmmzMapEvent} expected The copy it must come to.
 * @returns {string[]} What is wrong; none when nothing is.
 */
const wrongPlan = (shipped: ShippedBattler, outcome: CopyChange, expected: RmmzMapEvent): string[] =>
{
  if (outcome.kind !== 'changes' || JSON.stringify(outcome.event) !== JSON.stringify(expected))
  {
    return [ `Map${shipped.mapId} event ${shipped.event.id}: ${outcome.kind}` ];
  }

  return [];
};

describe.skipIf(project === null)('J-ABS\'s tags on the shipped battlers', () =>
{
  const battlers = project === null ? [] : shippedBattlers();

  it('reads every field of every tag line on every battler\'s pages, and writes each back moving nothing else', () =>
  {
    // Arrange: every page of every battler, each read as a battler of that page alone, with its tag lines.
    const pages = battlers.flatMap(({ event }) => event.pages.map(page => ({ battler: { ...event, pages: [ page ] }, lines: tagLinesOf(page, TAGS) })));

    // Act: every field written with the value it reads, and with another.
    const wrong = pages.flatMap(({ battler, lines }) => lines.flatMap(line => line.fields.flatMap(field => wrongWrite(battler, line, field))));

    // Assert: thousands of battlers, tens of thousands of fields, and every kind of J-ABS tag line among them.
    const fields = pages.flatMap(({ lines }) => lines.flatMap(line => line.fields.map(() => line.tag.id)));
    const kinds = new Set(fields);
    expect([ battlers.length > 4000, fields.length > 20000, [ 'jabs.enemyId', 'jabs.moveSpeed', 'jabs.level', 'jabs.aiRole', 'jabs.respawn', 'core.tag' ].every(id => kinds.has(id)), wrong ])
      .toStrictEqual([ true, true, true, [] ]);
  });

  it('plans every battler\'s copies, each taken for its own blueprint changed in a few fields, moving nothing outside them', () =>
  {
    // Arrange: every battler with a page naming its enemy in a line J-ABS reads, its change, and its copies.
    const cases = battlers.flatMap(shipped =>
    {
      const pageIndex = shipped.event.pages.findIndex(page => tagLinesOf(page, TAGS).some(line => line.tag.id === 'jabs.enemyId'));
      return pageIndex === -1 ? [] : [ battlerCase(shipped, pageIndex) ];
    });

    // Act.
    const wrong = cases.flatMap(({ shipped, after, tuned, tunedAfter }) =>
    {
      const inLine = copyOf(shipped.event);
      const tunedCopy = copyOf(tuned);
      const change = { before: shipped.event, after };
      return [
        ...wrongPlan(shipped, planCopyChange(change, inLine, { tags: TAGS }), placed(after, { ...after, note: inLine.note })),
        ...wrongPlan(shipped, planCopyChange(change, tunedCopy, { tags: TAGS }), placed(tunedAfter, tunedAfter)),
      ];
    });

    // Assert: every battler but none at all, and not one copy moved otherwise.
    expect([ battlers.length - cases.length, cases.length > 4000, wrong ])
      .toStrictEqual([ 0, true, [] ]);
  });
});

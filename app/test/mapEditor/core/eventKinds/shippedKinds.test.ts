import { describe, expect, it } from 'vitest';
import { CORE_EVENT_KINDS, type CoreEventKind } from '../../../../src/mapEditor/core/eventKinds/coreKinds.ts';
import { jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { applyEdits } from '../../support/eventKindFixtures.ts';

/*
 * The core's kinds, held against every event the game ships.
 *
 * Detection is only worth anything if it is right on the real maps, so this counts what each kind finds across all
 * of them and pins the counts: a change to a detector shows up here as a number that moved. It also holds the
 * promises that matter more than the counts: no event is ever two kinds; no event carrying a J-ABS battler's or a
 * light's tags is ever claimed, since those are the plugin modules' kinds; the near misses the game holds stay
 * unclaimed (the bomb wall is a battler until it breaks, one chest gives nothing, and the urn has no sound and no
 * open picture); and every setting a claimed event offers, written back with its own value, leaves the event
 * exactly as it was, so opening a quick panel can never change a map by itself.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One shipped event, where it lives, and the events of its map.
 */
type ShippedEvent = {
  readonly where: string;
  readonly event: RmmzMapEvent;
  readonly events: readonly (RmmzMapEvent | null)[];
};

/**
 * Reads every event on every shipped map.
 * @param {string} root The project root.
 * @returns {ShippedEvent[]} The events, in map and id order.
 */
const readShippedEvents = (root: string): ShippedEvent[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event => (event === null
      ? []
      : [ { where: `${file.replace('.json', '')}#${event.id}`, event, events: map.events } ]));
  });
};

const shipped: ShippedEvent[] = project === null
  ? []
  : readShippedEvents(project);

/**
 * Lists the kinds that recognise an event.
 * @param {RmmzMapEvent} event The event.
 * @returns {CoreEventKind[]} The kinds.
 */
const kindsOf = (event: RmmzMapEvent): CoreEventKind[] => CORE_EVENT_KINDS.filter(kind => kind.detect(event));

/**
 * Finds a shipped event by where it lives.
 * @param {string} where Such as {@code Map098#45}.
 * @returns {ShippedEvent} The event.
 */
const shippedEvent = (where: string): ShippedEvent =>
{
  const found = shipped.find(each => each.where === where);
  if (found === undefined)
  {
    throw new Error(`${where} is not in the game`);
  }

  return found;
};

describe.skipIf(project === null)('every shipped event, by kind', () =>
{
  it('finds 11 chests, 825 transfers, 59 dialogues and 886 decor, and leaves the rest unclaimed', () =>
  {
    // Arrange: every event on every map.

    // Act.
    const counts: Record<string, number> = {};
    shipped.forEach(({ event }) =>
    {
      const id = kindsOf(event)[0]?.id ?? 'unclaimed';
      counts[id] = (counts[id] ?? 0) + 1;
    });

    // Assert.
    expect(counts)
      .toStrictEqual({ 'core.chest': 11, 'core.transfer': 825, 'core.dialogue': 59, 'core.decor': 886, 'unclaimed': 6189 });
  });

  it('never calls one event two kinds', () =>
  {
    // Arrange: every event on every map.

    // Act.
    const doubles = shipped.filter(({ event }) => kindsOf(event).length > 1).map(({ where }) => where);

    // Assert.
    expect(doubles)
      .toStrictEqual([]);
  });

  it('never claims an event carrying a battler\'s or a light\'s tags, which belong to the plugin modules', () =>
  {
    // Arrange: the events whose comments name an enemy or a light.
    const tagged = shipped.filter(({ event }) => event.pages.some(eachPage => eachPage.list.some(command =>
      (command.code === 108 || command.code === 408) && /<(enemyId|light)\b/iu.test(String(command.parameters[0])))));

    // Act.
    const claimed = tagged.filter(({ event }) => kindsOf(event).length > 0).map(({ where }) => where);

    // Assert: thousands of them, none claimed.
    expect([ tagged.length > 5000, claimed ])
      .toStrictEqual([ true, [] ]);
  });

  it('recognises the game\'s known chest, transfer, sign and waterfall, and leaves its near misses alone', () =>
  {
    // Arrange.
    const places = [ 'Map098#45', 'Map001#50', 'Map014#64', 'Map001#17', 'Map001#29', 'Map103#15', 'Map322#9' ];

    // Act.
    const kinds = places.map(where => kindsOf(shippedEvent(where).event).map(kind => kind.id));

    // Assert: chest-ore, a transfer, a sign, a waterfall; then the bomb wall, the chest giving nothing and the urn.
    expect(kinds)
      .toStrictEqual([ [ 'core.chest' ], [ 'core.transfer' ], [ 'core.dialogue' ], [ 'core.decor' ], [], [], [] ]);
  });

  it('leaves every claimed event exactly as it was when each of its settings is written back with its own value', () =>
  {
    // Arrange: every claimed event, with what its kind offers.
    const claimed = shipped.flatMap(each =>
    {
      const [ kind ] = kindsOf(each.event);
      return kind === undefined ? [] : [ { ...each, model: kind.quick(each.event, { events: each.events, names: null }) } ];
    });

    // Act.
    const changed = claimed.flatMap(({ where, event, model }) => model.fields
      .filter(field => jsonEquals(applyEdits(event, field.write(field.value)), event) === false)
      .map(field => `${where} ${field.key}`));

    // Assert.
    expect([ claimed.length, claimed.every(({ model }) => model.fields.length > 0), changed ])
      .toStrictEqual([ 1781, true, [] ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { RmmzMap, RmmzMapEvent, RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { NO_PICKS, pairPlanOf, type PairLooks, type PairMap, type PairPicks } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import { locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The pairs the editor places, held field by field against the pairs Jeremy placed by hand in Chef Adventure, placed from
 * the same tiles with the same picture and sounds, so every difference left is one the editor means:
 *
 * - the Comfy Bear Inn (Map020's door, Map028's way out), the model Jeremy named: the editor names both ends after the
 *   map each leads to, where the inn's are "door to inn" and "exit"; it lands the player one tile north of the way out,
 *   where the inn's slot runs two tiles deep and lands them on 8, 13 above it; it fades to black on the way out, where the
 *   inn's fades to white; and it plays nothing after the transfer, where the inn's way out locks the crafting categories
 *   (a J-JAFTING command of the inn's own);
 * - the inn's bathroom (Map028's door, Map358's way out), whose way out sits right at the foot of its slot: the way out is
 *   the bathroom's own, to the byte, and the door differs in its name alone;
 * - the salt mines' bottom and top strips (Map350's event 28 and Map349's event 28): both the shipped events, to the byte.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * Reads one event of a shipped map.
 * @param {string} root The project root.
 * @param {number} mapId The map.
 * @param {number} eventId The event.
 * @returns {RmmzMapEvent} The event.
 */
const shippedEvent = (root: string, mapId: number, eventId: number): RmmzMapEvent =>
{
  const map = readDataFile(root, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
  return map.events[eventId] as RmmzMapEvent;
};

/**
 * Reads a shipped map as a plan reads it: its id, its name in the map tree, and its size.
 * @param {string} root The project root.
 * @param {number} mapId The map.
 * @returns {PairMap} The map.
 */
const shippedMap = (root: string, mapId: number): PairMap =>
{
  const map = readDataFile(root, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
  const infos = readDataFile(root, 'MapInfos.json') as (RmmzMapInfo | null)[];
  return { mapId, name: (infos[mapId] as RmmzMapInfo).name, size: { width: map.width, height: map.height } };
};

/**
 * Lists the fields where two events differ, by path, each with the editor's value then the shipped one.
 * @param {unknown} made What the editor made.
 * @param {unknown} shipped What the game ships.
 * @param {string} path Where in the event this is.
 * @returns {string[]} The differences.
 */
const differences = (made: unknown, shipped: unknown, path = ''): string[] =>
{
  if (typeof made !== 'object' || made === null || typeof shipped !== 'object' || shipped === null)
  {
    return JSON.stringify(made) === JSON.stringify(shipped) ? [] : [ `${path}: ${JSON.stringify(made)} / ${JSON.stringify(shipped)}` ];
  }

  const keys = [ ...new Set([ ...Object.keys(made), ...Object.keys(shipped) ]) ];
  return keys.flatMap(key => differences((made as Record<string, unknown>)[key], (shipped as Record<string, unknown>)[key], `${path}/${key}`));
};

/**
 * The sounds every shipped door and edge plays: the creak, Open1, and the sound of passing through, Move1.
 */
const SHIPPED_SOUNDS = { door: 'Open1', movement: 'Move1' };

describe.skipIf(project === null)('pairs placed as the shipped ones were', () =>
{
  const root = project as string;

  it('makes the inn\'s door and way out but for their names, the landing one tile nearer the way out, its fade and its lock', () =>
  {
    // Arrange: the inn's door picture and tiles.
    const looks: PairLooks = { door: { characterName: '!doors', characterIndex: 0, direction: 2, pattern: 1 }, sounds: SHIPPED_SOUNDS };
    const picks: PairPicks = { ...NO_PICKS, kind: 'door', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } };
    const plan = pairPlanOf(picks, shippedMap(root, 20), shippedMap(root, 28), looks);

    // Act.
    const [ door, exit ] = plan?.ends.map((end, index) => end.eventFor([ 1, 2 ][index])) ?? [];

    // Assert.
    expect([ differences(door, shippedEvent(root, 20, 1)), differences(exit, shippedEvent(root, 28, 2)) ])
      .toStrictEqual([
        [ '/name: "Transfer (Entrance)" / "door to inn"', '/pages/0/list/11/parameters/3: 14 / 13' ],
        [
          '/name: "Transfer (Northeast Section)" / "exit"',
          '/pages/0/list/1/parameters/5: 0 / 1',
          '/pages/0/list/2/code: 0 / 357',
          '/pages/0/list/2/parameters/0: undefined / "j/jafting/J-JAFTING"',
          '/pages/0/list/2/parameters/1: undefined / "Lock All Categories"',
          '/pages/0/list/2/parameters/2: undefined / "Lock all crafting categories"',
          '/pages/0/list/2/parameters/3: undefined / {}',
          '/pages/0/list/3: undefined / {"code":0,"indent":0,"parameters":[]}',
        ],
      ]);
  });

  it('makes the inn bathroom\'s way out to the byte, and its door but for its name', () =>
  {
    // Arrange: the bathroom's door picture and tiles.
    const looks: PairLooks = { door: { characterName: '!EX_Dungeon_Doors', characterIndex: 3, direction: 2, pattern: 0 }, sounds: SHIPPED_SOUNDS };
    const picks: PairPicks = { ...NO_PICKS, kind: 'door', door: { x: 15, y: 7 }, exit: { x: 14, y: 9 } };
    const plan = pairPlanOf(picks, shippedMap(root, 28), shippedMap(root, 358), looks);

    // Act.
    const [ door, exit ] = plan?.ends.map((end, index) => end.eventFor([ 18, 2 ][index])) ?? [];

    // Assert.
    expect([ differences(door, shippedEvent(root, 28, 18)), JSON.stringify(exit) === JSON.stringify(shippedEvent(root, 358, 2)) ])
      .toStrictEqual([ [ '/name: "Transfer (Bathroom)" / "Door (Bathroom)"' ], true ]);
  });

  it('makes the salt mines\' bottom and top strips to the byte', () =>
  {
    // Arrange: three tiles along Map350's bottom from 30, and the other strip moved to 30 on Map349's top.
    const looks: PairLooks = { door: { characterName: '', characterIndex: 0, direction: 2, pattern: 0 }, sounds: SHIPPED_SOUNDS };
    const picks: PairPicks = { ...NO_PICKS, kind: 'edge', strip: { edge: 'bottom', start: 30, length: 3 }, partner: { edge: 'top', start: 30, length: 3 } };
    const plan = pairPlanOf(picks, shippedMap(root, 350), shippedMap(root, 349), looks);

    // Act.
    const strips = plan?.ends.map(end => JSON.stringify(end.eventFor(28))) ?? [];

    // Assert.
    expect(strips)
      .toStrictEqual([ JSON.stringify(shippedEvent(root, 350, 28)), JSON.stringify(shippedEvent(root, 349, 28)) ]);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { TRANSFER_KIND_ID } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import { freshSavePages, landingGroundOf, landingProblem, type LandingGround } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { ActivePages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { passageReaderOf } from '../../../../src/mapEditor/render/engine/walkPassage.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import { SHIPPED_MODULES } from '../../../../src/mapEditor/services/pluginModules.ts';
import { readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The landing check, held against every transfer the game ships.
 *
 * Every Transfer Player naming its map and tile directly, on any page of any event of any map, nested in a branch or
 * not, is judged as the editor judges it: by the tiles, by the events a fresh save shows at the game's starting time, and
 * by every rule the game's own js/plugins.js switches on, J-RegionEffects' among them. A read-only survey of the shipped
 * maps found two landings that fail, and the check finds exactly those: Map001's debug guide sends the player to 16, 12
 * of Map002, outside its 10 by 15 tiles, and Map188's "teleport to previous" sets the player down on a wall at 23, 7 of
 * Map181. The eight landings on stairs and ladders, open only up and down, are landings the player stands on, and pass.
 *
 * Only the second of the two is an event the transfer kind claims, so only it is marked on its map and has a panel to
 * say why; the first is a debug guide that talks before it transfers.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One shipped landing: where its transfer is, and where it sends the player.
 */
type ShippedLanding = {
  readonly where: string;
  readonly event: RmmzMapEvent;
  readonly mapId: number;
  readonly to: { readonly mapId: number; readonly x: number; readonly y: number };
};

/**
 * Lists every Transfer Player naming its place directly, on every page of every event of every shipped map.
 * @param {string} root The project root.
 * @returns {ShippedLanding[]} The landings, in map, event, page and command order.
 */
const readShippedLandings = (root: string): ShippedLanding[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    const mapId = Number.parseInt(file.slice('Map'.length), 10);
    return map.events.flatMap(event => (event === null ? [] : event.pages.flatMap(page => page.list
      .filter(command => command.code === 201 && command.parameters[0] === 0)
      .map(command =>
      {
        const [ , target, x, y ] = command.parameters as number[];
        return { where: `${file.replace('.json', '')}#${event.id}`, event, mapId, to: { mapId: target, x, y } };
      }))));
  });
};

/**
 * Builds the window's kinds and modules as the game's own js/plugins.js switches them on, with the quest config the game
 * ships.
 * @param {string} root The project root.
 * @returns {PluginModuleRegistry} The registry.
 */
const gameRegistry = (root: string): PluginModuleRegistry =>
{
  const plugins = readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8'));
  const registry = new PluginModuleRegistry(new CommandCatalog());
  registerCoreEventKinds(registry);
  registry.activate(SHIPPED_MODULES, plugins, new Map([ [ 'quest', readDataFile(root, 'config.quest.json') as JsonValue ] ]));
  return registry;
};

/**
 * Builds the pages a fresh save shows at the game's starting time, by the game's party and the modules' conditions.
 * @param {string} root The project root.
 * @param {PluginModuleRegistry} registry The game's modules.
 * @returns {() => ActivePages} A reader for each map judged.
 */
const freshSave = (root: string, registry: PluginModuleRegistry): (() => ActivePages) =>
{
  const system = readDataFile(root, 'System.json') as { partyMembers: number[] };
  const actors = readDataFile(root, 'Actors.json') as (object | null)[];
  const party = system.partyMembers.filter(actorId => actors[actorId] !== null && actors[actorId] !== undefined);
  const startsAt = registry.clockOffer()?.startsAt ?? 0;
  return () => freshSavePages({ save: { party }, conditions: registry.pageConditions() }, startsAt, null);
};

const registry = project === null ? null : gameRegistry(project);

const landings: ShippedLanding[] = project === null ? [] : readShippedLandings(project);

/**
 * Judges every shipped landing as the editor does, each map it lands on made ready once.
 * @param {string} root The project root.
 * @param {PluginModuleRegistry} modules The game's modules.
 * @returns {object[]} Each landing, why it fails or null, and the map it lands on, ready to judge, or null when there is
 * none.
 */
const judgeAll = (root: string, modules: PluginModuleRegistry) =>
{
  const tilesets = readDataFile(root, 'Tilesets.json') as (RmmzTileset | null)[];
  const pages = freshSave(root, modules);
  const grounds = new Map<number, LandingGround | null>();
  const groundOf = (mapId: number): LandingGround | null =>
  {
    if (grounds.has(mapId) === false)
    {
      const file = `Map${String(mapId).padStart(3, '0')}.json`;
      const map = existsSync(`${root}/data/${file}`)
        ? MapDocument.fromJson(`map:${mapId}`, readDataFile(root, file) as RmmzMap)
        : null;
      grounds.set(mapId, map === null ? null : landingGroundOf(map, tilesets[map.tilesetId] as RmmzTileset, modules.passabilityRules(), pages()));
    }

    return grounds.get(mapId) as LandingGround | null;
  };

  return landings.map(landing =>
  {
    const ground = groundOf(landing.to.mapId);
    return { landing, problem: landingProblem(ground, landing.to), ground };
  });
};

describe.skipIf(project === null)('every shipped landing', () =>
{
  const judged = project === null || registry === null ? [] : judgeAll(project, registry);

  it('finds 939 transfers in 883 events, judged with J-RegionEffects\' rule on', () =>
  {
    // Arrange: every landing, judged above.

    // Act.
    const events = new Set(judged.map(({ landing }) => landing.where));

    // Assert.
    expect([ judged.length, events.size, (registry as PluginModuleRegistry).passabilityRules().map(rule => rule.id) ])
      .toStrictEqual([ 939, 883, [ 'regions.passage' ] ]);
  });

  it('fails exactly the two landings the survey found, for the reasons it found', () =>
  {
    // Arrange: every landing, judged above.

    // Act.
    const failing = judged
      .filter(({ problem }) => problem !== null)
      .map(({ landing, problem }) => [ landing.where, `Map${landing.to.mapId} ${landing.to.x},${landing.to.y}`, problem ]);

    // Assert.
    expect(failing)
      .toStrictEqual([
        [ 'Map001#1', 'Map2 16,12', { kind: 'off-map', width: 10, height: 15 } ],
        [ 'Map188#18', 'Map181 23,7', { kind: 'blocked' } ],
      ]);
  });

  it('passes the eight landings on stairs and ladders, open only some ways', () =>
  {
    // Arrange: the passing landings whose own tile stops some way out.
    const tilesets = readDataFile(project as string, 'Tilesets.json') as (RmmzTileset | null)[];

    // Act.
    const partial = judged.filter(({ problem, ground, landing }) =>
    {
      if (problem !== null || ground === null)
      {
        return false;
      }

      const passage = passageReaderOf(ground.map, tilesets[ground.map.tilesetId] as RmmzTileset, []);
      return passage(landing.to.x, landing.to.y).blocked !== 0;
    }).map(({ landing }) => landing.where);

    // Assert.
    expect(partial)
      .toStrictEqual([ 'Map009#10', 'Map046#25', 'Map111#23', 'Map134#8', 'Map135#1', 'Map195#2', 'Map248#2', 'Map282#2' ]);
  });

  it('marks only the failing landing the transfer kind claims, since the other is a guide who talks first', () =>
  {
    // Arrange: the failing landings.
    const failing = judged.filter(({ problem }) => problem !== null);

    // Act.
    const claimed = failing
      .filter(({ landing }) => (registry as PluginModuleRegistry).kindOf(landing.event, landing.mapId)?.id === TRANSFER_KIND_ID)
      .map(({ landing }) => landing.where);

    // Assert.
    expect(claimed)
      .toStrictEqual([ 'Map188#18' ]);
  });
});

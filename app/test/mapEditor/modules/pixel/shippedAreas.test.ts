import { readFileSync } from 'node:fs';
import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { footprintReaderFor } from '../../../../src/mapEditor/core/eventKinds/eventFootprints.ts';
import { TRANSFER_KIND_ID } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import { areaLines, areaOnMap } from '../../../../src/mapEditor/core/events/eventAreas.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { ShownPages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { EventLayer } from '../../../../src/mapEditor/render/scene/EventLayer.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import { SHIPPED_MODULES } from '../../../../src/mapEditor/services/pluginModules.ts';
import { readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * J-Pixelistics' areas, held against every map the game ships. A read-only survey counted 471 area events on 187 maps,
 * nearly all of them map-edge exits, each declaring its area on its first page.
 *
 * Each map is drawn as a map view draws it, with every module the game's own js/plugins.js switches on and the page a
 * fresh save shows at the game's starting time, and every event's footprint is held against where J-Pixelistics would put
 * it, worked out here straight from the plugin's own reading: J-Base offers a plugin only the comment lines that are one
 * whole tag (J.BASE.RegExp.ParsableComment), J.PIXEL.RegExp.AreaEvent matches the area in them, and the last one on the
 * page counts. The area runs right and down from the event's tile, and the map's edge cuts it. An event no page holds for
 * is drawn faded from its first page, and its footprint with it: three are, on a fresh save. The 436 the transfer kind
 * claims are drawn as exit strips, each pointing the way it sends the player; the other 35 as plain bands.
 *
 * The exits survey found four exits whose areas run past the map's edge: Map229's event 3, Map233's event 4, Map251's
 * event 2 and Map268's event 1. Every area is checked here, not only the exits', and two more turn up: Map240's event 15,
 * a chatter whose 2 by 20 area runs 19 rows off the bottom, and Map072's event 38, a quest scene whose 40 by 3 area runs 4
 * columns off the right, which no page shows on a fresh save, so it is drawn faded. All six are cut and marked in red, no
 * other footprint is, and each exit's quick panel says how far its area runs off.
 *
 * A click in the middle of any tile of a footprint picks its event, wherever no other event stands on the tile and no
 * other footprint covers it; on a tile one does, the click picks one of them.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * What a comment line must be before J-Base offers it to any plugin, copied from J.BASE.RegExp.ParsableComment.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * J-Pixelistics' area tag, copied from J.PIXEL.RegExp.AreaEvent.
 */
const PLUGIN_AREA_TAG = /<areaEvent:[ ]?(\[[ ]?[1-9]\d*[ ]?,[ ]?[1-9]\d*[ ]?])>/i;

/**
 * Reads a page's area as J-Pixelistics' Game_Event#refreshAreaEvent does: the comment lines J-Base offers, joined as a
 * note and split back into lines, the last matching the tag winning, its capture parsed as JSON.
 * @param {RmmzEventPage | undefined} page The page, or undefined for an event with none.
 * @returns {number[] | null} The width and height, or null when the page declares none.
 */
const pluginAreaOf = (page: RmmzEventPage | undefined): number[] | null =>
{
  if (page === undefined)
  {
    return null;
  }

  const note = page.list
    .filter(command => (command.code === 108 || command.code === 408) && PARSABLE_COMMENT.test(String(command.parameters[0])))
    .map(command => String(command.parameters[0]))
    .join('\n');
  const last = note.split(/[\r\n]+/u)
    .map(line => PLUGIN_AREA_TAG.exec(line))
    .findLast(match => match !== null);
  return last === undefined || last === null
    ? null
    : JSON.parse(last[1]) as number[];
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
 * Builds the pages a fresh save shows at the game's starting time, by the game's party and the modules' conditions, for
 * one map.
 * @param {string} root The project root.
 * @param {PluginModuleRegistry} registry The game's modules.
 * @returns {() => ShownPages} A reader for each map drawn.
 */
const freshSave = (root: string, registry: PluginModuleRegistry): (() => ShownPages) =>
{
  const system = readDataFile(root, 'System.json') as { partyMembers: number[] };
  const actors = readDataFile(root, 'Actors.json') as (object | null)[];
  const party = system.partyMembers.filter(actorId => actors[actorId] !== null && actors[actorId] !== undefined);
  const startsAt = registry.clockOffer()?.startsAt ?? 0;
  return () => new ShownPages({ save: { party }, conditions: registry.pageConditions() }, startsAt, GamePreview.FRESH);
};

/**
 * One area event as the game holds it and as the editor draws it: where it is, the area J-Pixelistics gives the page a
 * fresh save shows it with (its first while none holds), where that lies on the map, what the editor drew, and what each
 * click inside picked.
 */
type DrawnArea = {
  readonly where: string;
  readonly event: RmmzMapEvent;
  readonly mapId: number;
  readonly faded: boolean;

  /**
   * The way the footprint drawn points as an exit strip, or null for one drawn as no exit, or none drawn.
   */
  readonly exit: number | null;
  readonly declared: number[] | null;
  readonly expected: { x: number; y: number; width: number; height: number } | null;
  readonly runsOff: boolean;
  readonly drawn: { x: number; y: number; width: number; height: number } | null;

  /**
   * Whether the footprint drawn strokes anything in the red a cut is marked in.
   */
  readonly marked: boolean;
  readonly uncontested: { tile: number[]; picked: number | null }[];
  readonly contested: { tile: number[]; picked: number | null; candidates: number[] }[];
};

/**
 * The red the cut of a footprint is marked in, the red every failing landing is marked in.
 */
const CUT_RED = 0xe53935;

/**
 * Reports whether an event's footprint, as drawn, strokes anything in the red a cut is marked in.
 * @param {EventLayer} layer The layer the map is drawn on.
 * @param {number} eventId The event.
 * @returns {boolean} True when it does; false for a footprint marking nothing, or none.
 */
const isMarked = (layer: EventLayer, eventId: number): boolean =>
{
  const drawing = layer.footprints.children.find(child => (child as Graphics & { eventId?: number }).eventId === eventId) as Graphics | undefined;
  return drawing !== undefined && drawing.context.instructions.some(instruction => instruction.action === 'stroke' && instruction.data.style.color === CUT_RED);
};

/**
 * Draws one map as a map view does, and reads back every event with an area on any page.
 * @param {MapDocument} map The map.
 * @param {PluginModuleRegistry} registry The game's modules.
 * @param {ShownPages} pages The pages a fresh save shows.
 * @returns {DrawnArea[]} The map's area events, in id order.
 */
const drawMap = (map: MapDocument, registry: PluginModuleRegistry, pages: ShownPages): DrawnArea[] =>
{
  const layer = new EventLayer(() => undefined, () => 255);
  const footprints = footprintReaderFor(registry);
  layer.setFootprintReader(footprints);
  layer.setContext({ document: map, flags: [], sheets: [], images: null, tileSize: 48, pages });
  const events = map.eventIds().map(id => map.event(id) as RmmzMapEvent);

  // each tile of the map, with the events standing on it and the footprints covering it, as J-Pixelistics puts them.
  const expectedOf = (event: RmmzMapEvent) =>
  {
    const shown = pages.shownPage(event);
    const declared = pluginAreaOf(event.pages[shown.index]);
    if (declared === null || (declared[0] === 1 && declared[1] === 1))
    {
      return { shown, declared, expected: null, runsOff: false };
    }

    const [ width, height ] = declared;
    const onMap = { x: event.x, y: event.y, width: Math.min(width, map.width - event.x), height: Math.min(height, map.height - event.y) };
    return { shown, declared, expected: onMap, runsOff: event.x + width > map.width || event.y + height > map.height };
  };
  const read = events.map(event => ({ event, ...expectedOf(event) }));
  const standing = (column: number, row: number) => events.filter(event => event.x === column && event.y === row).map(event => event.id);
  const covering = (column: number, row: number) => read
    .filter(({ expected }) => expected !== null && column >= expected.x && column < expected.x + expected.width && row >= expected.y && row < expected.y + expected.height)
    .map(({ event }) => event.id);

  return read
    .filter(({ event }) => event.pages.some(each => pluginAreaOf(each) !== null))
    .map(({ event, shown, declared, expected, runsOff }) =>
    {
      const tiles: number[][] = [];
      for (let row = expected?.y ?? 0; expected !== null && row < expected.y + expected.height; row++)
      {
        for (let column = expected.x; column < expected.x + expected.width; column++)
        {
          tiles.push([ column, row ]);
        }
      }

      const clicked = tiles.map(([ column, row ]) =>
      {
        const others = [ ...standing(column, row), ...covering(column, row) ].filter(id => id !== event.id);
        const own = column === event.x && row === event.y ? [ event.id ] : [];
        return { tile: [ column, row ], picked: layer.eventAt(column * 48 + 24, row * 48 + 24, 1), candidates: [ ...new Set([ ...own, ...others, event.id ]) ], contested: others.length > 0 };
      });
      const page = event.pages[shown.index];
      return {
        where: `Map${String(map.mapId).padStart(3, '0')}#${event.id}`,
        event,
        mapId: map.mapId,
        faded: shown.faded,
        exit: page === undefined ? null : footprints(event, map.mapId, page)?.exit ?? null,
        declared,
        expected,
        runsOff,
        drawn: layer.footprintOf(event.id),
        marked: isMarked(layer, event.id),
        uncontested: clicked.filter(each => each.contested === false).map(({ tile, picked }) => ({ tile, picked })),
        contested: clicked.filter(each => each.contested).map(({ tile, picked, candidates }) => ({ tile, picked, candidates })),
      };
    });
};

/**
 * Draws every shipped map and gathers its area events.
 * @param {string} root The project root.
 * @returns {{ registry: PluginModuleRegistry, areas: DrawnArea[] }} The game's modules, and every area event.
 */
const drawAll = (root: string) =>
{
  const registry = gameRegistry(root);
  const pages = freshSave(root, registry);
  const areas = listMapFiles(root).flatMap(file =>
  {
    const mapId = Number.parseInt(file.slice('Map'.length), 10);
    const map = MapDocument.fromJson(`map:${mapId}`, readDataFile(root, file) as RmmzMap);
    return drawMap(map, registry, pages());
  });
  return { registry, areas };
};

describe.skipIf(project === null)('every shipped area', () =>
{
  const { registry, areas } = project === null ? { registry: null, areas: [] } : drawAll(project);

  it('finds the 471 area events on 187 maps the survey counted, J-Pixelistics on', () =>
  {
    // Arrange: every map, drawn above.

    // Act.
    const maps = new Set(areas.map(area => area.mapId));

    // Assert.
    expect([ areas.length, maps.size, (registry as PluginModuleRegistry).isActive('pixel') ])
      .toStrictEqual([ 471, 187, true ]);
  });

  it('draws every footprint where J-Pixelistics puts the area of the page a fresh save shows', () =>
  {
    // Arrange: every area event, drawn above.

    // Act: those drawn anywhere else, or not drawn, or drawn where none belongs.
    const misplaced = areas
      .filter(({ expected, drawn }) => JSON.stringify(expected) !== JSON.stringify(drawn))
      .map(({ where, expected, drawn }) => [ where, expected, drawn ]);
    const drawn = areas.filter(area => area.drawn !== null).length;

    // Assert: none misplaced, and every one of them drawn.
    expect([ misplaced, drawn ])
      .toStrictEqual([ [], 471 ]);
  });

  it('draws the exits the transfer kind claims as exit strips, pointing the ways they send the player', () =>
  {
    // Arrange: every area event, drawn above.

    // Act: how many strips point each way, and how many areas drawn are no exit.
    const ways = areas.reduce<Record<string, number>>((counts, area) =>
    {
      const key = area.drawn === null ? 'undrawn' : String(area.exit);
      return { ...counts, [key]: (counts[key] ?? 0) + 1 };
    }, {});
    const claimed = areas.filter(area => (registry as PluginModuleRegistry).kindOf(area.event, area.mapId)?.id === TRANSFER_KIND_ID).length;

    // Assert: every one of the 436 exits a strip pointing down, left, right or up; the 35 other areas drawn as no exit.
    expect([ claimed, ways ])
      .toStrictEqual([ 436, { 2: 126, 4: 99, 6: 95, 8: 116, null: 35 } ]);
  });

  it('draws faded the areas of the three events no page shows on a fresh save', () =>
  {
    // Arrange: every area event, drawn above.

    // Act.
    const faded = areas.filter(area => area.faded).map(area => area.where);

    // Assert.
    expect(faded)
      .toStrictEqual([ 'Map072#38', 'Map116#5', 'Map240#22' ]);
  });

  it('cuts and marks the four exits the survey found running off the map, and the two other areas that do', () =>
  {
    // Arrange: every area event, drawn above.

    // Act: those running off, and those marked as cut.
    const runningOff = areas
      .filter(area => area.runsOff)
      .map(({ where, event, mapId, faded, declared }) => [ where, declared, faded, (registry as PluginModuleRegistry).kindOf(event, mapId)?.id ?? null ]);
    const marked = areas.filter(area => area.marked).map(area => area.where);

    // Assert.
    expect([ runningOff, marked ])
      .toStrictEqual([
        [
          [ 'Map072#38', [ 40, 3 ], true, null ],
          [ 'Map229#3', [ 15, 1 ], false, TRANSFER_KIND_ID ],
          [ 'Map233#4', [ 20, 1 ], false, TRANSFER_KIND_ID ],
          [ 'Map240#15', [ 2, 20 ], false, null ],
          [ 'Map251#2', [ 18, 1 ], false, TRANSFER_KIND_ID ],
          [ 'Map268#1', [ 1, 3 ], false, TRANSFER_KIND_ID ],
        ],
        [ 'Map072#38', 'Map229#3', 'Map233#4', 'Map240#15', 'Map251#2', 'Map268#1' ],
      ]);
  });

  it('says in each quick panel how far the four exits\' areas run off the map', () =>
  {
    // Arrange: the four exits, as their panels read them.
    const exits = areas.filter(area => [ 'Map229#3', 'Map233#4', 'Map251#2', 'Map268#1' ].includes(area.where));

    // Act.
    const said = exits.map(({ where, event, mapId }) =>
    {
      const map = MapDocument.fromJson(`map:${mapId}`, readDataFile(project as string, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap);
      const area = (registry as PluginModuleRegistry).areaOf(event.pages[0]);
      const onMap = area === null ? null : areaOnMap(event.x, event.y, area, map.width, map.height);
      return [ where, areaLines([ { id: event.id, name: event.name, onMap } ]).map(line => line.text) ];
    });

    // Assert.
    const words = (runs: string) => [ `The trigger area runs ${runs} of the map, where the player can never go.` ];
    expect(said)
      .toStrictEqual([
        [ 'Map229#3', words('9 tiles past the right edge') ],
        [ 'Map233#4', words('1 tile past the right edge') ],
        [ 'Map251#2', words('17 tiles past the right edge') ],
        [ 'Map268#1', words('2 tiles past the bottom edge') ],
      ]);
  });

  it('picks the area\'s event by a click on any tile of its footprint nothing else stands on or covers', () =>
  {
    // Arrange: every tile of every footprint, clicked above.
    const clicked = areas.flatMap(area => area.uncontested.map(click => ({ where: area.where, id: area.event.id, ...click })));

    // Act.
    const wrong = clicked.filter(click => click.picked !== click.id).map(({ where, tile, picked }) => [ where, tile, picked ]);

    // Assert: well over a thousand tiles, every one picking its event.
    expect([ wrong, clicked.length > 1000 ])
      .toStrictEqual([ [], true ]);
  });

  it('picks one of the events on a footprint\'s tile another event stands on or another footprint covers', () =>
  {
    // Arrange: the tiles of footprints that other events stand on, or other footprints cover.
    const clicked = areas.flatMap(area => area.contested.map(click => ({ where: area.where, ...click })));

    // Act.
    const wrong = clicked.filter(click => click.picked === null || click.candidates.includes(click.picked) === false);

    // Assert.
    expect([ wrong, clicked.length > 0 ])
      .toStrictEqual([ [], true ]);
  });
});

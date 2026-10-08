import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BlueprintCopyCounter, copiesInNotes, type EventNote } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { blueprintLinkOf, withBlueprintLink, withoutBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { linkGateFor, placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { CellRect } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { captureAreaStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { placeStamp, planStamp, type StampPlacement } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { activatePluginModules } from '../../../../src/mapEditor/services/pluginModules.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { drawsFor, holdBlueprints } from '../../support/blueprintFixtures.ts';

/*
 * Blueprint links held against every map the game ships, read from the game's files and only ever held in memory, a
 * mirror nothing writes back to.
 *
 * A link goes into an event's note and comes out again, and the map must not move by a byte anywhere else: so every event
 * on every map has a link appended to its note and taken away again, the map read back after each as the very text it
 * was, but for the notes. The game's notes are nearly all empty (one held text when this was written), so every event is
 * also given each of several notes holding text first, words, a tag, line breaks of both kinds and both mixed, and its
 * link added and taken out of each: every one comes back byte for byte.
 *
 * Placing a blueprint, saved from a real map, onto other real maps changes nothing but the tiles it paints, with the
 * edges around them reshaped, and the events it adds, each linked, as the file a save writes shows; and one undo brings
 * each map back to the very text it was. A blueprint is never placed on the action map that J-ABS's module names from the
 * game's own plugins.js. And the copies counted across every map are none before any is placed, and exactly those placed
 * once they are.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * The link every event is given in the round trip.
 */
const LINK_ID = 'k3x9q2mf';

/**
 * Notes holding text, every event given each in turn: words, a tag, two lines ending on a break, Windows' pairs, a newline
 * then a pair, spaces around words, and a tag before two blank lines.
 */
const NOTES_WITH_TEXT = [ 'Guard captain', '<moveSpeed:6.0>', 'two\nlines\n', 'a\r\nb\r\n', 'a\nb\r\n', '  spaced  ', '<weather:fog>\n\n' ];

/**
 * Reads one of the game's maps.
 * @param {number} mapId The map.
 * @returns {RmmzMap} Its file.
 */
const readMap = (mapId: number): RmmzMap =>
{
  return readDataFile(project as string, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
};

/**
 * Lists the ids of every map the game ships, in id order.
 * @returns {number[]} The ids.
 */
const shippedMapIds = (): number[] =>
{
  return listMapFiles(project as string).map(file => Number(file.slice(3, -5)));
};

/**
 * Writes a held map as its file's text, in the file's own order of fields.
 * @param {DocumentHub} hub The hub.
 * @param {number} mapId The map.
 * @returns {string} The text.
 */
const textOf = (hub: DocumentHub, mapId: number): string =>
{
  return JSON.stringify(hub.document(mapDocumentKey(mapId)).toJson());
};

/**
 * Lists a map's events in id order.
 * @param {MapDocument} map The map.
 * @returns {RmmzMapEvent[]} The events.
 */
const eventsOf = (map: MapDocument): RmmzMapEvent[] =>
{
  return map.eventIds().map(id => map.event(id) as RmmzMapEvent);
};

/**
 * Rewrites every event's note on a held map as one step, as a change to each note through the history would.
 * @param {DocumentHub} hub The hub.
 * @param {number} mapId The map.
 * @param {(event: RmmzMapEvent) => string} note The new note for each event.
 */
const rewriteNotes = (hub: DocumentHub, mapId: number, note: (event: RmmzMapEvent) => string): void =>
{
  const key = mapDocumentKey(mapId);
  const events = eventsOf(hub.map(key));
  hub.edit('Rewrite notes', [ mapHistoryKey(mapId) ], tx => events.forEach(event => tx.set(key, [ 'events', event.id, 'note' ], note(event))));
};

/**
 * Reads the game's file with every event's note replaced as given, which is what the map must read as once only the
 * notes changed.
 * @param {RmmzMap} file The file.
 * @param {(event: RmmzMapEvent) => string} note The note for each event.
 * @returns {string} The text.
 */
const textWithNotes = (file: RmmzMap, note: (event: RmmzMapEvent) => string): string =>
{
  return JSON.stringify({ ...file, events: file.events.map(event => (event === null ? null : { ...event, note: note(event as RmmzMapEvent) })) });
};

/**
 * Builds a window holding some of the game's maps, whose saves are kept rather than written.
 * @param {readonly number[]} mapIds The maps.
 * @returns {{ hub: DocumentHub, saved: Map<DocumentKey, JsonValue> }} The window, and what each save would have written.
 */
const windowHolding = (mapIds: readonly number[]): { hub: DocumentHub; saved: Map<DocumentKey, JsonValue> } =>
{
  const saved = new Map<DocumentKey, JsonValue>();
  const hub = new DocumentHub({
    clientId: 'window-a',
    store: {
      load: async () => null,
      save: async (key, content) =>
      {
        saved.set(key, content);
      },
    },
  });
  mapIds.forEach(mapId => hub.adopt(mapDocumentKey(mapId), readMap(mapId) as unknown as JsonValue));
  holdBlueprints(hub);
  return { hub, saved };
};

/**
 * Finds the piece holding a map's first event and the events beside it, two tiles around them, at most 12 by 10.
 * @param {MapDocument} map The map.
 * @returns {CellRect} The piece.
 */
const pieceOf = (map: MapDocument): CellRect =>
{
  const [ first ] = eventsOf(map);
  const x = Math.max(0, first.x - 2);
  const y = Math.max(0, first.y - 2);
  return { x, y, width: Math.min(12, map.width - x), height: Math.min(10, map.height - y) };
};

/**
 * Finds where a stamp goes down on a map with every event landing and nothing in their way, other than where it came
 * from: the first such cell, row by row.
 * @param {MapDocument} map The map.
 * @param {Stamp} stamp The stamp.
 * @returns {{ x: number, y: number }} The cell for its corner.
 */
const roomFor = (map: MapDocument, stamp: Stamp): { x: number; y: number } =>
{
  for (let y = 0; y + stamp.height <= map.height; y++)
  {
    for (let x = 0; x + stamp.width <= map.width; x++)
    {
      const plan = planStamp(map, stamp, { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, null);
      if (plan.ok && plan.eventsLeftOut === 0 && (x !== stamp.origin.x || y !== stamp.origin.y || stamp.mapId !== map.mapId))
      {
        return { x, y };
      }
    }
  }

  throw new Error(`no room for the stamp on map ${map.mapId}`);
};

/**
 * Says what a blueprint's placement changed in a map's file other than what it was meant to, held against its stamp
 * placed plain at the same spot on the same map: any field but the tiles and the events; any tile other than those the
 * plain stamp paints, the autotiles it reshapes around them included; any event that stood there already; and any event
 * it added other than the stamp's own, as the plain stamp adds it but for a link to the blueprint in its note.
 * @param {RmmzMap} before The file before.
 * @param {RmmzMap} after The file after the blueprint's placement.
 * @param {RmmzMap} plain The file after its stamp's placement, plain.
 * @returns {string[]} What changed that should not have; none when nothing did.
 */
const strayChanges = (before: RmmzMap, after: RmmzMap, plain: RmmzMap): string[] =>
{
  const { data: beforeData, events: beforeEvents, ...beforeFields } = before;
  const { data: afterData, events: afterEvents, ...afterFields } = after;
  const strays: string[] = [];
  if (JSON.stringify(beforeFields) !== JSON.stringify(afterFields))
  {
    strays.push('a field other than the tiles and the events');
  }

  // the tiles are those the stamp paints, and nothing else moved.
  afterData.forEach((value, index) =>
  {
    if (value !== plain.data[index])
    {
      strays.push(`tile ${index}, which placing the stamp leaves ${beforeData[index]} and placing the blueprint makes ${value}`);
    }
  });

  beforeEvents.forEach((event, id) =>
  {
    if (JSON.stringify(event) !== JSON.stringify(afterEvents[id]))
    {
      strays.push(`event ${id}, which stood there already`);
    }
  });

  // every event added is the stamp's own, its note given the link to the blueprint and nothing else.
  afterEvents.slice(beforeEvents.length).forEach((event, offset) =>
  {
    const copy = event as RmmzMapEvent;
    const twin = plain.events[beforeEvents.length + offset] as RmmzMapEvent;
    const link = blueprintLinkOf(copy.note);
    const linked = link !== null && link.blueprintId === LINK_ID && copy.note === withBlueprintLink(twin.note, link);
    if (linked === false || JSON.stringify({ ...copy, note: twin.note }) !== JSON.stringify(twin))
    {
      strays.push(`event ${copy.id}, placed otherwise than the stamp places it, or without its link`);
    }
  });

  return strays;
};

describe.skipIf(project === null)('blueprints on the shipped maps', () =>
{
  it('adds a link to every event\'s note on every map and takes it out again, the map unmoved by a byte but for the notes', () =>
  {
    // Arrange: every map, one at a time.
    const mapIds = shippedMapIds();
    const problems: string[] = [];
    let events = 0;

    // Act.
    mapIds.forEach(mapId =>
    {
      const file = readMap(mapId);
      const text = JSON.stringify(file);
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt(mapDocumentKey(mapId), file as unknown as JsonValue);
      const linked = (event: RmmzMapEvent) => withBlueprintLink(event.note, { blueprintId: LINK_ID, eventId: event.id, differences: [] });
      const expected = textWithNotes(file, linked);
      rewriteNotes(hub, mapId, linked);
      const withLinks = textOf(hub, mapId);
      const read = eventsOf(hub.map(mapDocumentKey(mapId))).every(event => blueprintLinkOf(event.note)?.eventId === event.id);
      rewriteNotes(hub, mapId, event => withoutBlueprintLink(event.note));
      events += hub.map(mapDocumentKey(mapId)).eventIds().length;
      if (withLinks !== expected || read === false || textOf(hub, mapId) !== text)
      {
        problems.push(`Map${mapId}`);
      }
    });

    // Assert: hundreds of maps and thousands of events, and not one byte moved anywhere else.
    expect([ mapIds.length > 380, events > 7000, problems ])
      .toStrictEqual([ true, true, [] ]);
  });

  it('adds a link to every event\'s note when the note already holds text, of every shape, and takes it out byte for byte', () =>
  {
    // Arrange: every event on every map, with each note holding text.
    const notes = shippedMapIds().flatMap(mapId => readMap(mapId).events.flatMap(event => (event === null ? [] : [ event as RmmzMapEvent ])))
      .flatMap(event => [ event.note, ...NOTES_WITH_TEXT ].map(note => ({ event, note })));

    // Act.
    const wrong = notes.filter(({ event, note }) =>
    {
      const linked = withBlueprintLink(note, { blueprintId: LINK_ID, eventId: event.id, differences: [] });
      return linked.startsWith(note.replace(/[\r\n]*$/u, '')) === false || withoutBlueprintLink(linked) !== note;
    });

    // Assert.
    expect([ notes.length > 60000, notes.filter(({ note }) => note !== '').length > 50000, wrong.length ])
      .toStrictEqual([ true, true, 0 ]);
  });

  it.each([
    [ 16, 17, true ],
    [ 94, 102, true ],
    [ 16, 102, false ],
  ])('places a blueprint saved off Map%i on Map%i (tiles too: %s) and on its own map, saving only the tiles and linked events it adds, each undone to the very text', async (sourceId, otherId, tilesThere) =>
  {
    // Arrange: the piece around the source's first events, saved as a blueprint; and a twin window, where its stamp goes
    // down plain at the same spots.
    const { hub, saved } = windowHolding([ sourceId, otherId ]);
    const twin = windowHolding([ sourceId, otherId ]);
    const source = hub.map(mapDocumentKey(sourceId));
    const stamp = captureAreaStamp(source, pieceOf(source), 'auto', TilesetMode.area, 'window-a:1') as Stamp;
    const blueprint = saveBlueprint(hub, stamp, 'Real piece', drawsFor([ LINK_ID ]));

    // Act: placed on each map where it has room, and saved, beside the plain stamp; then undone.
    const results = [];
    for (const mapId of [ otherId, sourceId ])
    {
      const key = mapDocumentKey(mapId);
      const before = readMap(mapId);
      const placement: StampPlacement = { at: roomFor(hub.map(key), stamp), shaping: 'auto', mode: TilesetMode.area, linkRefusal: null };
      const outcome = placeBlueprint(hub, mapId, LINK_ID, placement);
      placeStamp(twin.hub, mapId, stamp, placement, 'Stamp');
      await Promise.all([ hub.save(key), twin.hub.save(key) ]);
      const strays = strayChanges(before, saved.get(key) as unknown as RmmzMap, twin.saved.get(key) as unknown as RmmzMap);
      const changedTiles = (saved.get(key) as unknown as RmmzMap).data.filter((value, index) => value !== before.data[index]).length;
      hub.undo(mapHistoryKey(mapId));
      results.push({
        placed: outcome.ok && outcome.eventIds.length === stamp.events.length,
        tiles: changedTiles > 0,
        strays,
        back: textOf(hub, mapId) === JSON.stringify(before),
      });
    }

    // Assert: on a map of another tileset the events go down alone.
    expect([ blueprint.ok, stamp.events.length > 0, results ])
      .toStrictEqual([
        true,
        true,
        [ { placed: true, tiles: tilesThere, strays: [], back: true }, { placed: true, tiles: true, strays: [], back: true } ],
      ]);
  });

  it('never places a blueprint on the action map J-ABS\'s module names from the game\'s plugins.js, saying why', async () =>
  {
    // Arrange: the window's modules switched on from the game's own plugin list, and a blueprint of one of Map017's events.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    await activatePluginModules({ loadPluginList: async () => readFileSync(`${project as string}/js/plugins.js`, 'utf8') }, registry);
    const gate = linkGateFor(registry);
    const { hub } = windowHolding([ 2, 17 ]);
    const source = hub.map(mapDocumentKey(17));
    const [ first ] = eventsOf(source);
    const stamp = captureAreaStamp(source, { x: first.x, y: first.y, width: 1, height: 1 }, 'auto', TilesetMode.area, 'window-a:1') as Stamp;
    saveBlueprint(hub, stamp, 'Lone event', drawsFor([ LINK_ID ]));
    const actionMap = textOf(hub, 2);

    // Act.
    const outcome = placeBlueprint(hub, 2, LINK_ID, { at: { x: 0, y: 0 }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: gate(2) });

    // Assert: refused there, with nothing changed, and every other map open to links.
    expect([ outcome, textOf(hub, 2) === actionMap, gate(17) ])
      .toStrictEqual([
        { ok: false, message: 'Blueprints can\'t be placed here: this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it.' },
        true,
        null,
      ]);
  });

  it('counts no copies across every map before any is placed, and exactly the copies placed once they are', async () =>
  {
    // Arrange: every map's notes as the server would read them, and a window holding Map016 and Map017.
    const disk: EventNote[] = shippedMapIds().flatMap(mapId => readMap(mapId).events.flatMap(event =>
    {
      const held = event as RmmzMapEvent | null;
      return held === null || held.note === '' ? [] : [ { mapId, eventId: held.id, note: held.note } ];
    }));
    const { hub } = windowHolding([ 16, 17 ]);
    const counter = new BlueprintCopyCounter({ hub, readNotes: async () => disk });
    counter.subscribe(() => undefined);
    await counter.settled();
    const before = counter.countOf(LINK_ID);
    const source = hub.map(mapDocumentKey(16));
    const stamp = captureAreaStamp(source, pieceOf(source), 'auto', TilesetMode.area, 'window-a:1') as Stamp;
    saveBlueprint(hub, stamp, 'Real piece', drawsFor([ LINK_ID ]));

    // Act: placed twice on Map017.
    [ 0, 1 ].forEach(() =>
    {
      const map = hub.map(mapDocumentKey(17));
      placeBlueprint(hub, 17, LINK_ID, { at: roomFor(map, stamp), shaping: 'auto', mode: TilesetMode.area, linkRefusal: null });
    });

    // Assert: the game holds no link at all yet; then every event of both placements counts, all on Map017.
    expect([ copiesInNotes(disk).size, before, counter.countOf(LINK_ID) ])
      .toStrictEqual([ 0, { total: 0, maps: [] }, { total: stamp.events.length * 2, maps: [ { mapId: 17, copies: stamp.events.length * 2 } ] } ]);
  });
});

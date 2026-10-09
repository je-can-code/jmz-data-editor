import { MapEditorApiError } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintCopyCounter, type EventNote } from '../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { withBlueprintLink } from '../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { holdBlueprintMap } from '../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { blueprintPropagationCheck } from '../../../src/mapEditor/core/blueprints/blueprintPropagation.ts';
import { blueprintShapeCheck } from '../../../src/mapEditor/core/blueprints/blueprintShape.ts';
import type { PlacedSpot } from '../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { CopyMaps } from '../../../src/mapEditor/core/blueprints/copyMaps.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintMapKey, mapDocumentKey, type DocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../src/mapEditor/core/model/EditorDocument.ts';
import { createEventPage, createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../src/mapEditor/core/stamps/stamp.ts';
import { cellIndex } from '../../../src/mapEditor/core/tiles/tileGrid.ts';
import { TileId } from '../../../src/mapEditor/core/tiles/tileIds.ts';
import { holdBlueprints, holdBlueprintUses } from './blueprintFixtures.ts';
import { mapWithEvents } from './eventFixtures.ts';
import { stampOf } from './stampFixtures.ts';

/**
 * The blueprint every propagation test changes.
 */
const BLUEPRINT = 'k3x9q2mf';

/**
 * The size of every map in these tests.
 */
const MAP_WIDTH = 12;
const MAP_HEIGHT = 10;

/**
 * The map holding J-ABS's action templates, which a stray link and a stray record name, and which nothing ever touches.
 */
const TEMPLATE_MAP = 9;

/**
 * One of the A5 sheet's tiles, which have no shapes.
 * @param {number} index Its place on the sheet.
 * @returns {number} The tile id.
 */
const a5 = (index: number): number => TileId.A5 + index;

/**
 * A guard's page at a speed.
 * @param {number} speed Its speed.
 * @returns {RmmzEventPage} The page.
 */
const guardPage = (speed: number): RmmzEventPage => ({ ...createEventPage(), moveSpeed: speed });

/**
 * The blueprint's stamp: 2 by 2 on layer 1 alone, A5 tiles 1 to 4, a guard (event 1, speed 3) at its corner and a post
 * (event 2) opposite.
 * @returns {Stamp} The stamp.
 */
const campStamp = (): Stamp => stampOf({
  width: 2,
  height: 2,
  tiles: { layers: [ 0 ], values: [ a5(1), a5(2), a5(3), a5(4) ], calledFor: [ -1, -1, -1, -1 ] },
  events: [
    { ...createMapEvent(1, 0, 0), name: 'Guard', pages: [ guardPage(3) ] },
    { ...createMapEvent(2, 1, 1), name: 'Post' },
  ],
});

/**
 * A map holding one placement of the blueprint, its corner at (1, 1), with its guard as event 5 and its post as event 6,
 * linked by their notes, and a plain event 7 standing apart.
 * @returns {RmmzMap} The map's file.
 */
const campMap = (): RmmzMap =>
{
  const file = mapWithEvents(MAP_WIDTH, MAP_HEIGHT, [ null, null, null, null, null, [ 1, 1 ], [ 2, 2 ], [ 6, 6 ] ]);
  [ a5(1), a5(2), a5(3), a5(4) ].forEach((value, index) =>
  {
    file.data[cellIndex(MAP_WIDTH, MAP_HEIGHT, 1 + (index % 2), 1 + Math.floor(index / 2), 0)] = value;
  });

  const guard = file.events[5] as RmmzMapEvent;
  const post = file.events[6] as RmmzMapEvent;
  file.events[5] = { ...guard, name: 'Guard', pages: [ guardPage(3) ], note: withBlueprintLink('', { blueprintId: BLUEPRINT, eventId: 1, differences: [] }) };
  file.events[6] = { ...post, name: 'Post', note: withBlueprintLink('', { blueprintId: BLUEPRINT, eventId: 2, differences: [] }) };
  return { ...file, tilesetId: 4 };
};

/**
 * Reads a map's ground cell.
 * @param {RmmzMap | MapDocument} map The map, or its file.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number} The tile.
 */
const groundOf = (map: RmmzMap | MapDocument, x: number, y: number): number =>
{
  const index = cellIndex(MAP_WIDTH, MAP_HEIGHT, x, y, 0);
  return 'cells' in map ? map.cells[index] : map.data[index];
};

/**
 * Reads an event of a map, or of its file.
 * @param {RmmzMap | MapDocument} map The map.
 * @param {number} eventId The event.
 * @returns {RmmzMapEvent} The event.
 */
const eventOf = (map: RmmzMap | MapDocument, eventId: number): RmmzMapEvent => map.events[eventId] as RmmzMapEvent;

/**
 * Reads the notes every map file on a disk holds, as the server hands them out.
 * @param {ReadonlyMap<number, RmmzMap>} disk The files, by map id.
 * @returns {EventNote[]} The notes.
 */
const notesOn = (disk: ReadonlyMap<number, RmmzMap>): EventNote[] =>
{
  return [ ...disk ].flatMap(([ mapId, file ]) => file.events.flatMap(event => (event === null || event.note === '' ? [] : [ { mapId, eventId: event.id, note: event.note } ])));
};

/**
 * One window with the blueprint open as a map, propagating every change of it, over a disk of map files.
 */
type PropagationWindow = {
  readonly hub: DocumentHub;
  readonly maps: CopyMaps;
  readonly counter: BlueprintCopyCounter;
  readonly disk: Map<number, RmmzMap>;
  readonly blueprintMap: MapDocument;
  readonly blueprintKey: DocumentKey;
  readonly reads: number[];
  readonly opened: DocumentKey[];
  readonly releaseReads: () => void;
};

/**
 * What a propagation window is built with.
 */
type PropagationSetUp = {
  /**
   * The maps the window holds, by id, from the disk.
   */
  readonly held?: readonly number[];

  /**
   * The maps another window holds, by id.
   */
  readonly heldElsewhere?: readonly number[];

  /**
   * The placements the record holds; by default the blueprint at (1, 1) on maps 1, 2, 3 and the template map.
   */
  readonly spots?: readonly PlacedSpot[];

  /**
   * The maps whose file reads wait until the window's releaseReads is called.
   */
  readonly pausedReads?: readonly number[];

  /**
   * Whether to wait for every read to land before handing the window over; true unless said.
   */
  readonly settled?: boolean;
};

/**
 * Waits for every read on its way to land, as many rounds as reads lead to more.
 * @returns {Promise<void>} Settles then.
 */
const settle = async (): Promise<void> =>
{
  for (let round = 0; round < 8; round++)
  {
    await new Promise(resolve =>
    {
      setTimeout(resolve, 0);
    });
  }
};

/**
 * Builds a window holding the blueprints, the record, the maps asked for, and the blueprint opened as a map, with the
 * checks a real window runs, over a disk of maps 1, 2 and 3, each a camp map, and the template map holding a stray copy.
 * The plugins are read, map 9 being J-ABS's action map, and every read has landed.
 * @param {PropagationSetUp} setUp Which maps the window holds, which another window holds, and the record's placements.
 * @returns {Promise<PropagationWindow>} The window.
 */
const propagationWindow = async (setUp: PropagationSetUp = {}): Promise<PropagationWindow> =>
{
  const { held = [ 1, 2 ], heldElsewhere = [], spots, pausedReads = [], settled = true } = setUp;
  let releaseReads = () => undefined as void;
  const gate = new Promise<void>(resolve =>
  {
    releaseReads = resolve;
  });
  const disk = new Map<number, RmmzMap>([ [ 1, campMap() ], [ 2, campMap() ], [ 3, campMap() ], [ TEMPLATE_MAP, campMap() ] ]);
  const hub = new DocumentHub({ clientId: 'window-a' });
  hub.addCommitCheck(blueprintShapeCheck(hub));
  holdBlueprints(hub, { [BLUEPRINT]: { name: 'Camp', stamp: campStamp() } });
  holdBlueprintUses(hub, spots ?? [ 1, 2, 3, TEMPLATE_MAP ].map(mapId => ({ blueprintId: BLUEPRINT, mapId, x: 1, y: 1 })));
  held.forEach(mapId => hub.adopt(mapDocumentKey(mapId), structuredClone(disk.get(mapId)) as unknown as JsonValue));

  const reads: number[] = [];
  const opened: DocumentKey[] = [];
  const counter = new BlueprintCopyCounter({ hub, readNotes: async () => notesOn(disk) });
  const maps = new CopyMaps({
    hub,
    copies: counter,
    holders: key => (heldElsewhere.some(mapId => mapDocumentKey(mapId) === key) && hub.has(key) === false ? [ 'window-b' ] : []),
    onHoldingChange: () => () => undefined,
    openDocument: (key: DocumentKey): Promise<EditorDocument> =>
    {
      opened.push(key);
      return hub.has(key) ? Promise.resolve(hub.document(key)) : Promise.reject(new Error(`${key} is not to be opened here`));
    },
    readMap: async mapId =>
    {
      reads.push(mapId);
      if (pausedReads.includes(mapId))
      {
        await gate;
      }

      const file = disk.get(mapId);
      if (file === undefined)
      {
        throw new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);
      }

      return structuredClone(file);
    },
    templates: { revision: 1, listProblem: null, templateMapOf: mapId => (mapId === TEMPLATE_MAP ? { owner: 'J-ABS', holds: 'action templates' } : null) },
  });
  maps.start();
  hub.addCommitCheck(blueprintPropagationCheck({ hub, maps, tags: () => [] }));
  const blueprintMap = holdBlueprintMap(hub, BLUEPRINT);
  if (settled)
  {
    await settle();
  }

  return { hub, maps, counter, disk, blueprintMap, blueprintKey: blueprintMapKey(BLUEPRINT), reads, opened, releaseReads };
};

export {
  a5,
  BLUEPRINT,
  campMap,
  campStamp,
  eventOf,
  groundOf,
  guardPage,
  MAP_HEIGHT,
  MAP_WIDTH,
  notesOn,
  propagationWindow,
  settle,
  TEMPLATE_MAP,
};
export type { PropagationSetUp, PropagationWindow };

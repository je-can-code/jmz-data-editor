import { BLUEPRINTS_DOCUMENT, savedBlueprintOf } from '../../../src/mapEditor/core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, mapEntryOf, type PlacedSpot } from '../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import type { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonObject, JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { Stamp } from '../../../src/mapEditor/core/stamps/stamp.ts';

/**
 * A blueprint as a test writes it into the document: its name and its stamp, keyed by its id.
 */
type BlueprintSeed = Readonly<Record<string, { readonly name: string; readonly stamp: Stamp }>>;

/**
 * Builds the stored form of a blueprints document holding the blueprints given, as the editor-data route serves it.
 * @param {BlueprintSeed} blueprints The blueprints, by id.
 * @returns {JsonObject} The document, version and all.
 */
const storedBlueprints = (blueprints: BlueprintSeed = {}): JsonObject =>
{
  const entries = Object.entries(blueprints).map(([ id, { name, stamp } ]) => [ id, savedBlueprintOf(name, stamp) ]);
  return { schemaVersion: 1, data: { blueprints: Object.fromEntries(entries) as JsonObject } };
};

/**
 * Has a window hold the blueprints document, holding the blueprints given, as a file on disk would hand it over.
 * @param {DocumentHub} hub The window's documents.
 * @param {BlueprintSeed} blueprints The blueprints, by id.
 */
const holdBlueprints = (hub: DocumentHub, blueprints: BlueprintSeed = {}): void =>
{
  hub.adopt(BLUEPRINTS_DOCUMENT, storedBlueprints(blueprints) as JsonValue);
};

/**
 * Builds the stored form of a record of where blueprints are placed, holding the placements given, each map's written
 * as the editor writes it, as the editor-data route serves it.
 * @param {readonly PlacedSpot[]} spots The placements.
 * @returns {JsonObject} The record, version and all.
 */
const storedUses = (spots: readonly PlacedSpot[] = []): JsonObject =>
{
  const mapIds = [ ...new Set(spots.map(spot => spot.mapId)) ];
  const maps = Object.fromEntries(mapIds.map(mapId => [ String(mapId), mapEntryOf(spots.filter(spot => spot.mapId === mapId)) as JsonObject ]));
  return { schemaVersion: 1, data: { maps } };
};

/**
 * Has a window hold the record of where blueprints are placed, holding the placements given, as a file on disk would hand
 * it over.
 * @param {DocumentHub} hub The window's documents.
 * @param {readonly PlacedSpot[]} spots The placements.
 */
const holdBlueprintUses = (hub: DocumentHub, spots: readonly PlacedSpot[] = []): void =>
{
  hub.adopt(BLUEPRINT_USES_DOCUMENT, storedUses(spots) as JsonValue);
};

/**
 * Draws the same characters for every new blueprint id, in turn from a list of draws, so a test knows the id a save
 * makes: each draw is the index of a character in the id alphabet (a to z, then 0 to 9), over 36.
 * @param {readonly string[]} ids The ids to make, in order, each eight characters long.
 * @returns {() => number} The draws.
 */
const drawsFor = (ids: readonly string[]): (() => number) =>
{
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const draws = ids.flatMap(id => [ ...id ].map(character => (alphabet.indexOf(character) + 0.5) / alphabet.length));
  let next = 0;
  return () =>
  {
    const draw = draws[next % draws.length];
    next += 1;
    return draw;
  };
};

export { drawsFor, holdBlueprints, holdBlueprintUses, storedBlueprints, storedUses };
export type { BlueprintSeed };

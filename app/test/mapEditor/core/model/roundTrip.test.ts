import { describe, expect, it } from 'vitest';
import { mapDocumentKey, MAP_INFOS_KEY, TILESETS_KEY } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createDocument } from '../../../../src/mapEditor/core/model/createDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../support/gameProject.ts';

/*
 * Nothing is lost.
 *
 * Every save the map editor ever makes is a document turned back into a file, so the documents owe their callers
 * one thing before anything else: a file that goes in comes back out with every field it had, and nothing it
 * did not. That covers the rare shapes as much as the common ones. Two maps and 490 events persist a `meta`
 * copy of their note tags, 15 commands carry `collapsed` because somebody folded a branch in MZ, 96 map tree
 * rows carry `quick`, and 54 maps end their event list in empty slots. A model that wrote `meta: null` where a
 * file had no key, or trimmed a trailing slot, would change the file on its first save and nobody would see it
 * happen, so the assertions are strict: absent must come back absent.
 *
 * The check runs over every map the game ships, not a fixture, because the point is what the game actually
 * carries rather than what a fixture author remembered to include. It skips when the game is not present.
 */
const project = locateGameProject();
const mapFiles = project === null
  ? []
  : listMapFiles(project);

describe.skipIf(project === null)('map documents lose nothing', () =>
{
  it('finds the shipped maps to check', () =>
  {
    // Arrange: the project located above.

    // Act.
    const count = mapFiles.length;

    // Assert: a wrong folder would otherwise pass by checking nothing.
    expect(count)
      .toBeGreaterThan(300);
  });

  it.each(mapFiles.length > 0 ? mapFiles : [ 'no project' ])('%s comes back exactly as it went in', (file) =>
  {
    // Arrange.
    const original = readDataFile(project as string, file) as RmmzMap;
    const mapId = Number.parseInt(file.slice('Map'.length), 10);

    // Act.
    const saved = MapDocument.fromJson(mapDocumentKey(mapId), original).toJson();

    // Assert.
    expect(saved)
      .toStrictEqual(original);
  });

  it('carries the map tree back exactly as it went in', () =>
  {
    // Arrange.
    const original = readDataFile(project as string, 'MapInfos.json') as JsonValue;

    // Act.
    const saved = createDocument(MAP_INFOS_KEY, original).toJson();

    // Assert.
    expect(saved)
      .toStrictEqual(original);
  });

  it('carries the tilesets back exactly as they went in', () =>
  {
    // Arrange.
    const original = readDataFile(project as string, 'Tilesets.json') as JsonValue;

    // Act.
    const saved = createDocument(TILESETS_KEY, original).toJson();

    // Assert.
    expect(saved)
      .toStrictEqual(original);
  });
});

import { describe, expect, it } from 'vitest';
import {
  blueprintIdOfMap,
  blueprintMapId,
  blueprintMapKey,
  documentKeyForProjectPath,
  editorDataDocumentKey,
  isBlueprintMapId,
  isEditorDataName,
  isMappableBlueprintId,
  mapDocumentKey,
  mapIdOfDocument,
  parseDocumentKey,
  projectPathForDocument,
} from '../../../../src/mapEditor/core/model/documentKeys.ts';

/*
 * A document key is how every window, every history step and every file-change event names the same piece of
 * data. Two keys for one map would split it into two live copies that drift apart; a change event mapped to the
 * wrong key would reload the wrong map. So keys are built one way, parse back to what built them, and a changed
 * file maps to exactly one key, or to none when it backs no document.
 *
 * A blueprint opened as a small map is a map document of its own, with no file behind it, and every tool names the map
 * it works on by a number. So a blueprint takes a map id below zero that spells its id: every window must work out the
 * same number for the same blueprint and read the same blueprint back out of it, two blueprints must never share one,
 * and no number a map can have may ever be read as a blueprint.
 */
describe('documentKeys', () =>
{
  describe('mapDocumentKey', () =>
  {
    it('names a map by its id', () =>
    {
      // Arrange: a map id.

      // Act.
      const key = mapDocumentKey(12);

      // Assert.
      expect(key)
        .toBe('map:12');
    });

    it('refuses an id that no map can have', () =>
    {
      // Arrange: map 0 has no file, ids are whole numbers, and -3 spells no blueprint.

      // Act.
      const attempts = [ () => mapDocumentKey(0), () => mapDocumentKey(-3), () => mapDocumentKey(1.5) ];

      // Assert.
      attempts.forEach(attempt => expect(attempt)
        .toThrow(/positive integer/u));
    });

    it('names a blueprint opened as a map by the key it is held under, from the map id it takes', () =>
    {
      // Arrange: the camp's map id beside a map's.

      // Act.
      const keys = [ mapDocumentKey(blueprintMapId('k3x9q2mf')), mapDocumentKey(5) ];

      // Assert.
      expect(keys)
        .toStrictEqual([ 'blueprint-map:k3x9q2mf', 'map:5' ]);
    });
  });

  describe('blueprintMapId', () =>
  {
    it('gives every blueprint its own id below zero, and reads the same blueprint back out of it', () =>
    {
      // Arrange: near misses by one character, by a leading 0, by length, and the longest and shortest ids a map id holds.
      const blueprintIds = [ 'k3x9q2mf', 'k3x9q2mg', '0k3x9q2m', 'k3x9q2m', 'zzzzzzzzzz', '0' ];

      // Act.
      const mapIds = blueprintIds.map(blueprintMapId);
      const readBack = mapIds.map(blueprintIdOfMap);

      // Assert.
      expect([ readBack, new Set(mapIds).size, mapIds.every(mapId => mapId < 0 && Number.isSafeInteger(mapId)) ])
        .toStrictEqual([ blueprintIds, blueprintIds.length, true ]);
    });

    it('refuses an id no map id can spell', () =>
    {
      // Arrange: one character too long, an uppercase letter, and no id at all.

      // Act.
      const attempts = [ 'k3x9q2mf123', 'K3x9q2mf', '' ].map(blueprintId => () => blueprintMapId(blueprintId));

      // Assert.
      attempts.forEach(attempt => expect(attempt)
        .toThrow(/up to ten lowercase letters and digits/u));
      expect([ isMappableBlueprintId('k3x9q2mf12'), isMappableBlueprintId('k3x9q2mf123') ])
        .toStrictEqual([ true, false ]);
    });
  });

  describe('blueprintIdOfMap', () =>
  {
    it('reads no blueprint out of a map\'s id, nor out of a number below zero that spells none', () =>
    {
      // Arrange: a map's id, zero, and below zero 1, 3 and a fraction, none spelling a 1 and then an id.

      // Act.
      const read = [ 12, 0, -1, -3, -40.5, Number.MIN_SAFE_INTEGER * 2 ].map(blueprintIdOfMap);

      // Assert.
      expect(read)
        .toStrictEqual([ null, null, null, null, null, null ]);
      expect([ isBlueprintMapId(12), isBlueprintMapId(blueprintMapId('k3x9q2mf')) ])
        .toStrictEqual([ false, true ]);
    });
  });

  describe('blueprintMapKey', () =>
  {
    it('names a blueprint opened as a map, refusing an id no map id can spell', () =>
    {
      // Arrange: the camp, and an id one character too long.

      // Act.
      const key = blueprintMapKey('k3x9q2mf');
      const tooLong = () => blueprintMapKey('k3x9q2mf123');

      // Assert.
      expect(key)
        .toBe('blueprint-map:k3x9q2mf');
      expect(tooLong)
        .toThrow(/up to ten/u);
    });
  });

  describe('mapIdOfDocument', () =>
  {
    it('reads the map id of a map and of a blueprint opened as a map, and none of anything else', () =>
    {
      // Arrange: one of each.

      // Act.
      const ids = [ mapIdOfDocument('map:12'), mapIdOfDocument('blueprint-map:k3x9q2mf'), mapIdOfDocument('editor-data:blueprints') ];

      // Assert.
      expect(ids)
        .toStrictEqual([ 12, blueprintMapId('k3x9q2mf'), null ]);
    });
  });

  describe('editorDataDocumentKey', () =>
  {
    it('names an editor-only document', () =>
    {
      // Arrange: a valid name.

      // Act.
      const key = editorDataDocumentKey('tileset-marks');

      // Assert.
      expect(key)
        .toBe('editor-data:tileset-marks');
    });

    it('refuses a name the server would refuse', () =>
    {
      // Arrange: uppercase, a slash and an empty name, each a near miss of a valid one.

      // Act.
      const verdicts = [ 'Tileset-marks', 'tileset/marks', '', 'layouts2' ].map(name => isEditorDataName(name));

      // Assert.
      expect(verdicts)
        .toStrictEqual([ false, false, false, true ]);
      expect(() => editorDataDocumentKey('Blueprints'))
        .toThrow(/lowercase/u);
    });
  });

  describe('parseDocumentKey', () =>
  {
    it('takes every kind of key apart', () =>
    {
      // Arrange: one key of each kind.

      // Act.
      const parsed = [
        parseDocumentKey('map:120'),
        parseDocumentKey('blueprint-map:k3x9q2mf'),
        parseDocumentKey('mapinfos'),
        parseDocumentKey('tilesets'),
        parseDocumentKey('common-events'),
        parseDocumentKey('system'),
        parseDocumentKey('editor-data:blueprints'),
      ];

      // Assert.
      expect(parsed)
        .toStrictEqual([
          { kind: 'map', mapId: 120 },
          { kind: 'blueprint-map', blueprintId: 'k3x9q2mf' },
          { kind: 'mapinfos' },
          { kind: 'tilesets' },
          { kind: 'common-events' },
          { kind: 'system' },
          { kind: 'editor-data', name: 'blueprints' },
        ]);
    });
  });

  describe('projectPathForDocument', () =>
  {
    it('names the file each document saves to, padding map ids the way RMMZ does', () =>
    {
      // Arrange: keys either side of the padding.

      // Act.
      const paths = [
        projectPathForDocument('map:7'),
        projectPathForDocument('map:1000'),
        projectPathForDocument('mapinfos'),
        projectPathForDocument('tilesets'),
        projectPathForDocument('common-events'),
        projectPathForDocument('system'),
        projectPathForDocument('editor-data:blueprints'),
      ];

      // Assert.
      expect(paths)
        .toStrictEqual([
          'data/Map007.json',
          'data/Map1000.json',
          'data/MapInfos.json',
          'data/Tilesets.json',
          'data/CommonEvents.json',
          'data/System.json',
          'jmz-editor/blueprints.json',
        ]);
    });

    it('names the blueprints\' file for a blueprint opened as a map, which has no file of its own', () =>
    {
      // Arrange: the camp's map.

      // Act.
      const path = projectPathForDocument('blueprint-map:k3x9q2mf');

      // Assert: the file that keeps the blueprint, which maps back to the blueprints, never to the map.
      expect([ path, documentKeyForProjectPath(path) ])
        .toStrictEqual([ 'jmz-editor/blueprints.json', 'editor-data:blueprints' ]);
    });
  });

  describe('documentKeyForProjectPath', () =>
  {
    it('maps each backing file to its document', () =>
    {
      // Arrange: every kind of file the stream can name.

      // Act.
      const keys = [
        documentKeyForProjectPath('data/Map012.json'),
        documentKeyForProjectPath('data/Map1000.json'),
        documentKeyForProjectPath('data/MapInfos.json'),
        documentKeyForProjectPath('data/Tilesets.json'),
        documentKeyForProjectPath('data/CommonEvents.json'),
        documentKeyForProjectPath('data/System.json'),
        documentKeyForProjectPath('jmz-editor/tileset-marks.json'),
      ];

      // Assert.
      expect(keys)
        .toStrictEqual([ 'map:12', 'map:1000', 'mapinfos', 'tilesets', 'common-events', 'system', 'editor-data:tileset-marks' ]);
    });

    it('maps near misses to nothing', () =>
    {
      // Arrange: files that look like backing files but back no document.

      // Act.
      const keys = [
        documentKeyForProjectPath('data/Map000.json'),
        documentKeyForProjectPath('data/Map12.json'),
        documentKeyForProjectPath('img/Map012.json'),
        documentKeyForProjectPath('data/Map012.json.bak'),
        documentKeyForProjectPath('data/Actors.json'),
        documentKeyForProjectPath('jmz-editor/Layouts.json'),
        documentKeyForProjectPath('jmz-editor/nested/layouts.json'),
        documentKeyForProjectPath('data/blueprints.json'),
      ];

      // Assert.
      expect(keys)
        .toStrictEqual([ null, null, null, null, null, null, null, null ]);
    });

    it('maps every document to a path that maps back to it', () =>
    {
      // Arrange: one key of each kind.
      const keys = [ 'map:7', 'map:1000', 'mapinfos', 'tilesets', 'common-events', 'system', 'editor-data:layouts' ] as const;

      // Act.
      const roundTripped = keys.map(key => documentKeyForProjectPath(projectPathForDocument(key)));

      // Assert.
      expect(roundTripped)
        .toStrictEqual([ ...keys ]);
    });
  });
});

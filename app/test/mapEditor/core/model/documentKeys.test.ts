import { describe, expect, it } from 'vitest';
import {
  documentKeyForProjectPath,
  editorDataDocumentKey,
  isEditorDataName,
  mapDocumentKey,
  parseDocumentKey,
  projectPathForDocument,
} from '../../../../src/mapEditor/core/model/documentKeys.ts';

/*
 * A document key is how every window, every history step and every file-change event names the same piece of
 * data. Two keys for one map would split it into two live copies that drift apart; a change event mapped to the
 * wrong key would reload the wrong map. So keys are built one way, parse back to what built them, and a changed
 * file maps to exactly one key, or to none when it backs no document.
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
      // Arrange: map 0 has no file, and ids are whole numbers.

      // Act.
      const attempts = [ () => mapDocumentKey(0), () => mapDocumentKey(-3), () => mapDocumentKey(1.5) ];

      // Assert.
      attempts.forEach(attempt => expect(attempt)
        .toThrow(/positive integer/u));
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

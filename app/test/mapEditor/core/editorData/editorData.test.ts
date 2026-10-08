import { describe, expect, it, vi } from 'vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import {
  BLUEPRINTS,
  EDITOR_DATA_DEFINITIONS,
  EditorDataClient,
  editorDataDefinition,
  LAYOUTS,
  TILESET_MARKS,
} from '../../../../src/mapEditor/core/editorData/editorData.ts';
import { isEditorDataName } from '../../../../src/mapEditor/core/model/documentKeys.ts';

/*
 * Blueprints, "goes on top" marks and saved layouts live inside the project, beside the game's data, so they are
 * versioned with it; the game never reads them. Each is stored with its shape's version, so an older editor meets
 * a newer document with a refusal instead of rewriting what it does not understand, and a project that has never
 * saved one reads the empty document, so nothing downstream has to tell "absent" from "empty".
 */
describe('editorData', () =>
{
  /**
   * An API stand-in answering one stored document.
   * @param {unknown} stored What the server holds, or null.
   * @returns {MapEditorApi} The stand-in.
   */
  const buildApi = (stored: unknown): MapEditorApi => ({
    loadEditorData: vi.fn(async () => stored),
    saveEditorData: vi.fn(async () => undefined),
  }) as unknown as MapEditorApi;

  it('names three documents, each with a key the server accepts', () =>
  {
    // Arrange: the definitions.

    // Act.
    const names = EDITOR_DATA_DEFINITIONS.map(definition => [ definition.name, isEditorDataName(definition.name) ]);

    // Assert.
    expect(names)
      .toStrictEqual([ [ 'blueprints', true ], [ 'tileset-marks', true ], [ 'layouts', true ] ]);
  });

  it('finds a definition by name, and nothing for an unknown one', () =>
  {
    // Arrange: a known name beside a near miss.

    // Act.
    const found = [ editorDataDefinition('tileset-marks'), editorDataDefinition('tileset-mark') ];

    // Assert.
    expect(found)
      .toStrictEqual([ TILESET_MARKS, null ]);
  });

  it('reads the empty document for a project that never saved one', async () =>
  {
    // Arrange.
    const client = new EditorDataClient(buildApi(null));

    // Act.
    const loaded = await client.load(LAYOUTS);

    // Assert.
    expect(loaded)
      .toStrictEqual({ schemaVersion: 1, data: { layouts: {} } });
  });

  it('reads a saved document as it is', async () =>
  {
    // Arrange.
    const stored = { schemaVersion: 1, data: { blueprints: { k3x9q2mf: { name: 'Slime camp' } } } };
    const client = new EditorDataClient(buildApi(stored));

    // Act.
    const loaded = await client.load(BLUEPRINTS);

    // Assert.
    expect(loaded)
      .toStrictEqual(stored);
  });

  it('refuses a document written by a newer editor', async () =>
  {
    // Arrange.
    const client = new EditorDataClient(buildApi({ schemaVersion: 2, data: {} }));

    // Act.
    const load = client.load(BLUEPRINTS);

    // Assert.
    await expect(load)
      .rejects.toThrow('the saved blueprints was written by a newer editor (version 2)');
  });

  it('refuses something that is not an editor-data document', async () =>
  {
    // Arrange: data without a version, and a version without data.
    const clients = [ new EditorDataClient(buildApi({ data: {} })), new EditorDataClient(buildApi({ schemaVersion: 1 })) ];

    // Act.
    const loads = clients.map(client => client.load(LAYOUTS));

    // Assert.
    await expect(loads[0])
      .rejects.toThrow('the saved layouts is not an editor-data document');
    await expect(loads[1])
      .rejects.toThrow('the saved layouts is not an editor-data document');
  });

  it('saves data stamped with its version', async () =>
  {
    // Arrange.
    const api = buildApi(null);
    const client = new EditorDataClient(api);

    // Act.
    await client.save(TILESET_MARKS, { tilesets: { 12: [ 1536 ] } });

    // Assert.
    expect(vi.mocked(api.saveEditorData).mock.calls)
      .toStrictEqual([ [ 'tileset-marks', { schemaVersion: 1, data: { tilesets: { 12: [ 1536 ] } } } ] ]);
  });

  it('names the document key each one syncs under', () =>
  {
    // Arrange: the definitions.

    // Act.
    const keys = EDITOR_DATA_DEFINITIONS.map(definition => EditorDataClient.documentKey(definition));

    // Assert.
    expect(keys)
      .toStrictEqual([ 'editor-data:blueprints', 'editor-data:tileset-marks', 'editor-data:layouts' ]);
  });
});

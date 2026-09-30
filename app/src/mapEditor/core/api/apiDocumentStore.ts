import { editorDataDefinition, emptyEditorData, requireReadable } from '../editorData/editorData.ts';
import type { DocumentStore } from '../history/DocumentHub.ts';
import { parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { RmmzCommonEvent, RmmzMap, RmmzMapInfo, RmmzTileset } from '../model/rmmzTypes.ts';
import type { MapEditorApi } from './MapEditorApi.ts';

/**
 * Finds the editor-data definition for a document, which every editor-only document must have.
 * @param {string} name The editor-data key.
 * @returns {ReturnType<typeof editorDataDefinition>} The definition.
 */
const requireDefinition = (name: string) =>
{
  const definition = editorDataDefinition(name);
  if (definition === null)
  {
    throw new Error(`the editor keeps no document called ${name}`);
  }

  return definition;
};

/**
 * Loads and saves documents through the server, routing each key to its route. Editor-only documents are held
 * in their stored form ({@code {schemaVersion, data}}), so saving one is a straight copy.
 * @param {MapEditorApi} api The server client.
 * @returns {DocumentStore} The store the document hub loads and saves with.
 */
const apiDocumentStore = (api: MapEditorApi): DocumentStore =>
{
  return {
    load: async (key: DocumentKey): Promise<JsonValue> =>
    {
      const parsed = parseDocumentKey(key);
      switch (parsed.kind)
      {
        case 'map':
          return await api.loadMap(parsed.mapId) as unknown as JsonValue;
        case 'mapinfos':
          return await api.loadMapInfos() as unknown as JsonValue;
        case 'tilesets':
          return await api.loadTilesets() as unknown as JsonValue;
        case 'common-events':
          return await api.loadCommonEvents() as unknown as JsonValue;
        case 'editor-data':
        {
          const definition = requireDefinition(parsed.name);
          const stored = await api.loadEditorData(parsed.name);
          const readable = stored === null
            ? emptyEditorData(definition)
            : requireReadable(definition, stored);
          return readable as unknown as JsonValue;
        }
      }
    },
    save: async (key: DocumentKey, content: JsonValue): Promise<void> =>
    {
      const parsed = parseDocumentKey(key);
      switch (parsed.kind)
      {
        case 'map':
          return api.saveMap(parsed.mapId, content as unknown as RmmzMap);
        case 'mapinfos':
          return api.saveMapInfos(content as unknown as (RmmzMapInfo | null)[]);
        case 'tilesets':
          return api.saveTilesets(content as unknown as (RmmzTileset | null)[]);
        case 'common-events':
          return api.saveCommonEvents(content as unknown as (RmmzCommonEvent | null)[]);
        case 'editor-data':
          requireDefinition(parsed.name);
          return api.saveEditorData(parsed.name, content);
      }
    },
  };
};

export { apiDocumentStore };

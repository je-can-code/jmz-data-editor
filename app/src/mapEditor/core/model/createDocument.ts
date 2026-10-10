import { parseDocumentKey, type DocumentKey, type MapDocumentKey } from './documentKeys.ts';
import type { EditorDocument } from './EditorDocument.ts';
import type { JsonValue } from './json.ts';
import { JsonDocument, MapInfosDocument, SystemDocument, TilesetsDocument } from './JsonDocument.ts';
import { MapDocument } from './MapDocument.ts';
import type { RmmzMap } from './rmmzTypes.ts';

/**
 * Builds the right kind of document for a key from its file content: a {@link MapDocument} for a map, and for a
 * blueprint opened as a map, whose content is a map file built from its stamp; and a JSON document for everything else.
 * @param {DocumentKey} key The document key.
 * @param {JsonValue} content The file's content.
 * @returns {EditorDocument} The document.
 */
const createDocument = (key: DocumentKey, content: JsonValue): EditorDocument =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
    case 'blueprint-map':
      return MapDocument.fromJson(key as MapDocumentKey, content as unknown as RmmzMap);
    case 'mapinfos':
      return new MapInfosDocument(key, content);
    case 'tilesets':
      return new TilesetsDocument(key, content);
    case 'system':
      return new SystemDocument(key, content);
    case 'common-events':
    case 'editor-data':
      return new JsonDocument(key, content);
  }
};

export { createDocument };

import { mapDocumentKey } from '../core/model/documentKeys.ts';
import type { TilesetsDocument } from '../core/model/JsonDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import { lookAtDocument } from '../core/sync/lookAtDocument.ts';
import type { PlacementSources } from '../core/transferPairs/pairPlacement.ts';
import type { MapEditorServices } from './MapEditorServices.ts';

/**
 * Builds what placing transfers reads from one window: its documents, the other windows holding maps, the server's map
 * files, maps looked at without holding them, and its landings, which judge each map with the tileset the window reads
 * from the tilesets given.
 * @param {Pick<MapEditorServices, 'hub' | 'sync' | 'api' | 'landings' | 'openDocument'>} services The window.
 * @param {TilesetsDocument} tilesets The project's tilesets, as the window holds them or looked at them.
 * @param {(mapId: number) => string} mapName Names a map for the author.
 * @returns {PlacementSources} The sources.
 */
const placementSourcesOf = (
  services: Pick<MapEditorServices, 'hub' | 'sync' | 'api' | 'landings' | 'openDocument'>,
  tilesets: TilesetsDocument,
  mapName: (mapId: number) => string,
): PlacementSources =>
{
  const { hub, sync, api, landings } = services;
  return {
    hub,
    holders: key => sync.holders(key),
    bring: key => services.openDocument(key),
    readMap: api === null ? null : mapId => api.loadMap(mapId),
    look: async mapId => await lookAtDocument({ hub, sync }, mapDocumentKey(mapId)) as MapDocument,
    groundOf: map =>
    {
      const tileset = tilesets.tileset(map.tilesetId);
      return tileset === null ? null : landings.groundFor(map, tileset);
    },
    mapName,
  };
};

export { placementSourcesOf };

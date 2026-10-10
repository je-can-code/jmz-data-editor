import React, { useState } from 'react';
import { isBlueprintMapId } from '../../core/model/documentKeys.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { TransferPairDialog } from './TransferPairDialog.tsx';

/**
 * A map view's transfer placer: how its menu opens it from a tile, which a map taking no new events, such as a blueprint,
 * or a window with no server to read the other map from, does not offer; and the placer itself while it is open.
 */
type TransferPlacer = {
  readonly open: ((cell: MapCell) => void) | undefined;
  readonly dialog: React.ReactNode;
};

/**
 * Keeps a map view's transfer placer: closed until its menu opens it from a tile, and closed again once it ends, the
 * view's notices hearing what was placed.
 * @param {number} mapId The map the view shows.
 * @param {(text: string) => void} notify Tells the author what was placed.
 * @returns {TransferPlacer} The placer.
 */
const useTransferPlacer = (mapId: number, notify: (text: string) => void): TransferPlacer =>
{
  const { api } = useMapEditorServices();
  const [ from, setFrom ] = useState<MapCell | null>(null);
  const offered = isBlueprintMapId(mapId) === false && api !== null;
  const dialog = from === null
    ? null
    : (
      <TransferPairDialog
        mapId={mapId}
        start={from}
        onClose={placed =>
        {
          setFrom(null);
          if (placed !== null)
          {
            notify(placed);
          }
        }}
      />
    );

  return { open: offered ? setFrom : undefined, dialog };
};

export { useTransferPlacer };
export type { TransferPlacer };

import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { PreviewMapRenderer } from '../renderer/PreviewMapRenderer.ts';
import { usePanelWindow } from '../windowScope.tsx';

/**
 * What a map panel hands whatever draws its map.
 */
type MapSurfaceProps = {
  /**
   * The map, held for as long as the panel shows it.
   */
  readonly document: MapDocument;

  /**
   * The event to pick out, such as the one the data editor asked to see, or null.
   */
  readonly focusEventId: number | null;
};

/**
 * Draws one map inside a map panel. This is the single place the map renderer plugs into the workspace: the panel
 * gives it a host element, the document and the event to pick out, and the renderer draws on its own loop, never
 * through React. The real renderer (the renderer package's MapView) replaces the body of this component; until it
 * lands, a simplified preview built on the same renderer contract stands in.
 *
 * Tearing the panel out or putting it back moves it to another window, whose frames and size the renderer must
 * follow, so the renderer starts afresh in the new window.
 * @param {MapSurfaceProps} props The map and the event to pick out.
 * @returns {React.JSX.Element} The surface.
 */
const MapSurface = (props: MapSurfaceProps) =>
{
  const { document, focusEventId } = props;
  const host = useRef<HTMLDivElement | null>(null);
  const renderer = useRef<PreviewMapRenderer | null>(null);
  const panelWindow = usePanelWindow();

  useEffect(() =>
  {
    const element = host.current;
    if (element === null)
    {
      return undefined;
    }

    const created = new PreviewMapRenderer();
    created.mount(element);
    created.setDocument(document);
    renderer.current = created;
    return () =>
    {
      created.destroy();
      renderer.current = null;
    };
  }, [ document, panelWindow ]);

  useEffect(() =>
  {
    renderer.current?.highlightEvent(focusEventId);
  }, [ focusEventId, document, panelWindow ]);

  return <Box ref={host} data-testid={'map-surface'} sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}/>;
};

export { MapSurface };
export type { MapSurfaceProps };

import React, { useEffect, useState } from 'react';
import { Alert, Stack } from '@mui/material';
import { areaLines, areaOnMap, shownAreaOf, type ShownArea } from '../../core/events/eventAreas.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { ShownPages } from '../../core/pageRule/ShownPages.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

/**
 * What the alerts are about: a map, and the events picked on it.
 */
type AreaAlertsProps = {
  readonly document: MapDocument;
  readonly eventIds: readonly number[];
};

/**
 * Re-renders whenever the window's moment moves: the clock's hour or season, the preview, or the page rule, any of which
 * can change the page an event is shown with, and so the area it shows.
 */
const useWindowMoment = (): void =>
{
  const { clock, preview, pages } = useMapEditorServices();
  const [ , setTick ] = useState(0);
  useEffect(() =>
  {
    const bump = () => setTick(current => current + 1);
    const stops = [ clock.subscribe(bump), preview.subscribe(bump), pages.subscribe(bump) ];
    return () => stops.forEach(stop => stop());
  }, [ clock, preview, pages ]);
};

/**
 * What a quick panel says about the areas of the events picked: for each event whose area runs past the map's edge, how
 * far, read from the page every map view shows it with, at the window's clock and preview, so the panel says what the
 * map marks. Nothing at all while no picked event's area runs past an edge.
 * @param {AreaAlertsProps} props The map and the picked events.
 * @returns {React.JSX.Element | null} The alerts, or nothing.
 */
const AreaAlerts = (props: AreaAlertsProps) =>
{
  const { document, eventIds } = props;
  const { modules, pages, clock, preview } = useMapEditorServices();
  useWindowMoment();

  // the page each event is shown with, as every map view picks it at the window's moment.
  const shown = new ShownPages(pages.rule(), clock.time(), preview.preview());
  shown.setSeason(clock.season());
  const events = eventIds.flatMap((eventId): ShownArea[] =>
  {
    const event = document.event(eventId);
    if (event === null)
    {
      return [];
    }

    const area = shownAreaOf(event, shown, modules.areaOf);
    const onMap = area === null ? null : areaOnMap(event.x, event.y, area, document.width, document.height);
    return [ { id: eventId, name: event.name, onMap } ];
  });
  const lines = areaLines(events);
  if (lines.length === 0)
  {
    return null;
  }

  return (
    <Stack spacing={1} sx={{ mb: 1.5 }}>
      {lines.map(line => (
        <Alert key={line.key} severity={'warning'} sx={{ py: 0 }} data-testid={'area-alert'}>
          {line.text}
        </Alert>
      ))}
    </Stack>
  );
};

export { AreaAlerts };
export type { AreaAlertsProps };

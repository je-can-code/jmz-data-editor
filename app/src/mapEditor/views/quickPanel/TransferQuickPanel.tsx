import React, { useSyncExternalStore } from 'react';
import { Alert, Stack } from '@mui/material';
import { transferQuickModel } from '../../core/eventKinds/transferKind.ts';
import { landingLines } from '../../core/locations/landingAlerts.ts';
import type { QuickPanelProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { QuickFieldsPanel } from './QuickFieldsPanel.tsx';
import { useRevision } from './quickResources.ts';

/**
 * A transfer's quick panel: each transfer's destination, facing and fade, as every kind's settings show, and above them,
 * for each transfer whose landing fails, where it lands and why the player cannot stand there. The lines follow the
 * landings as they are worked out, so one on a map still being read appears once it lands, and goes once the landing is
 * mended, from this panel or anywhere else.
 * @param {QuickPanelProps} props The map and the selected transfers.
 * @returns {React.JSX.Element} The panel.
 */
const TransferQuickPanel = (props: QuickPanelProps) =>
{
  const { documentKey, eventIds } = props;
  const { hub, landings } = useMapEditorServices();
  useSyncExternalStore(landings.subscribe, () => landings.revision);
  const map = hub.has(documentKey) ? hub.map(documentKey) : null;
  useRevision(map);

  // the events still on the map, with their transfers, as the landings read them.
  const events = map === null
    ? []
    : eventIds.flatMap(eventId =>
    {
      const event = map.event(eventId);
      return event === null ? [] : [ { id: eventId, name: event.name, transfers: landings.transfersOf(event, map.mapId) } ];
    });
  const lines = landingLines(landings, events);

  return (
    <Stack spacing={1}>
      {lines.map(line => (
        <Alert key={line.key} severity={'warning'} sx={{ py: 0 }} data-testid={'landing-alert'}>
          {line.text}
        </Alert>
      ))}
      <QuickFieldsPanel {...props} source={transferQuickModel}/>
    </Stack>
  );
};

export { TransferQuickPanel };

import React, { useSyncExternalStore } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';
import { groupSelection, type KindGroup } from '../../core/eventKinds/quickFields.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { EventKindDefinition } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { useRevision } from './quickResources.ts';

/**
 * What the quick panel shows: a map, and the events selected on it.
 */
type QuickPanelHostProps = {
  /**
   * The map the selection is on, or null while there is none.
   */
  readonly document: MapDocument | null;

  /**
   * The selected events, by id; one, several, or none.
   */
  readonly eventIds: readonly number[];
};

/**
 * A line filling the panel when there is nothing to show.
 * @param {{ line: string }} props The line.
 * @returns {React.JSX.Element} The message.
 */
const Quiet = (props: { line: string }) =>
{
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, color: 'text.secondary', bgcolor: 'background.default' }}>
      <Typography variant={'body2'} align={'center'}>
        {props.line}
      </Typography>
    </Box>
  );
};

/**
 * Says which events a kind's section stands for: one event by name and tile, or how many.
 * @param {MapDocument} document The map.
 * @param {readonly number[]} eventIds The events.
 * @returns {string} Such as "chest-ore · 68, 13" or "3 events".
 */
const whichEvents = (document: MapDocument, eventIds: readonly number[]): string =>
{
  const [ only ] = eventIds;
  const event = eventIds.length === 1 ? document.event(only) : null;
  return event === null
    ? `${eventIds.length} events`
    : `${event.name} · ${event.x}, ${event.y}`;
};

/**
 * Names a kind's section after the map and the events it stands for. Picking other events, or moving to another map,
 * gives the section a new name, so it is built afresh: a box still holding half-typed text goes with the old section,
 * and that text can never be written to events it was not typed for.
 * @param {MapDocument} document The map.
 * @param {KindGroup<EventKindDefinition>} group The kind and its events.
 * @returns {string} Such as "map:3 core.chest 4,9".
 */
const sectionKey = (document: MapDocument, group: KindGroup<EventKindDefinition>): string =>
{
  return `${document.key} ${group.kind.id} ${group.eventIds.join(',')}`;
};

/**
 * One kind's part of the panel: its name, which events it stands for, and its own quick panel.
 * @param {{ document: MapDocument, group: KindGroup<EventKindDefinition> }} props The map and the kind's events.
 * @returns {React.JSX.Element} The section.
 */
const KindSection = (props: { document: MapDocument; group: KindGroup<EventKindDefinition> }) =>
{
  const { document, group } = props;
  const { kind, eventIds } = group;
  const Panel = kind.quickPanel;
  return (
    <Box data-testid={`quick-kind-${kind.id}`}>
      <Stack direction={'row'} spacing={1} alignItems={'baseline'}>
        <Typography variant={'subtitle2'}>
          {kind.title}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} noWrap>
          {whichEvents(document, eventIds)}
        </Typography>
      </Stack>
      {Panel === undefined
        ? <Typography variant={'body2'} color={'text.secondary'}>No quick settings for this kind.</Typography>
        : <Panel documentKey={document.key} eventIds={eventIds}/>}
    </Box>
  );
};

/**
 * The quick panel: for the events selected on a map, each event's kind by its detector (a chest, a transfer, a
 * battler once J-ABS's module is on), and that kind's quick panel for them, a section per kind in the order the
 * selection first names each. Events no kind recognises are counted, and an empty selection says how to make one.
 * The map redraws as settings change, since every change is an edit to the map itself.
 * @param {QuickPanelHostProps} props The map and the selected events.
 * @returns {React.JSX.Element} The panel.
 */
const QuickPanelHost = (props: QuickPanelHostProps) =>
{
  const { document, eventIds } = props;
  const { modules } = useMapEditorServices();
  useRevision(document);

  // the plugin modules switch on once js/plugins.js is read, which can change what kind an event is.
  useSyncExternalStore(modules.subscribe, () => modules.revision);
  if (document === null || eventIds.length === 0)
  {
    return <Quiet line={'Pick an event on a map to change its settings here.'}/>;
  }

  const { groups, unclaimed } = groupSelection(document.events, eventIds, event => modules.kindOf(event, document.mapId));
  if (groups.length === 0 && unclaimed.length === 0)
  {
    return <Quiet line={'The picked event is no longer on the map.'}/>;
  }

  const [ lone ] = unclaimed;
  const loneEvent = unclaimed.length === 1 ? document.event(lone) : null;
  const others = loneEvent === null
    ? `${unclaimed.length} of the picked events have no quick settings.`
    : `${loneEvent.name} has no quick settings.`;

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', px: 1.5, py: 1, bgcolor: 'background.default' }} data-testid={'quick-panel'}>
      <Stack spacing={1.5} divider={<Divider flexItem/>}>
        {groups.map(group => <KindSection key={sectionKey(document, group)} document={document} group={group}/>)}
        {unclaimed.length > 0 && (
          <Typography variant={'body2'} color={'text.secondary'}>
            {others}
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

export { QuickPanelHost };
export type { QuickPanelHostProps };

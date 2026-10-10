import React from 'react';
import { Divider, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { eventsPhrase } from '../core/events/eventPlacement.ts';
import type { MapCell } from '../core/renderer/camera.ts';
import type { MapStampTools } from '../stamps/MapStampTools.ts';
import type { EventMenuRequest, MapEventTools } from './MapEventTools.ts';

/**
 * What the map's menu shows: where it was asked for, how many events are selected, and the tools it acts through: the
 * event tools, the stamp tools for cutting, copying and pasting, and the transfer placer, where the map takes transfers.
 */
type EventMenuProps = {
  readonly request: EventMenuRequest | null;
  readonly selectedCount: number;
  readonly tools: MapEventTools | null;
  readonly stampTools: MapStampTools | null;
  readonly onClose: () => void;

  /**
   * Opens the transfer placer from a tile, or is left out on a map that takes no new events, such as a blueprint.
   * @param {MapCell} cell The tile.
   */
  readonly onNewTransfer?: (cell: MapCell) => void;
};

/**
 * The menu a still right click opens on a map. On an event it offers to edit, cut, copy, duplicate and delete what is
 * selected (the event clicked is selected first, when it was not), a cut or a copy becoming a stamp; on the ground, to
 * place a new event there, to place a transfer from there (a door, or a strip along the edge it lies on), or to paste the
 * newest stamp with its top-left corner on that tile. Each item names the keys that do the same.
 * @param {EventMenuProps} props Where, what is selected, and the tools.
 * @returns {React.JSX.Element} The menu, closed while nothing asked for it.
 */
const EventMenu = (props: EventMenuProps) =>
{
  const { request, selectedCount, tools, stampTools, onClose, onNewTransfer } = props;

  /**
   * Builds one menu item that closes the menu and then acts.
   * @param {string} label What it says.
   * @param {() => void} act What it does.
   * @param {string} shortcut The keys that do the same, if any.
   * @returns {React.JSX.Element} The item.
   */
  const item = (label: string, act: () => void, shortcut = '') => (
    <MenuItem
      key={label}
      dense
      onClick={() =>
      {
        onClose();
        act();
      }}
    >
      <ListItemText primary={label} slotProps={{ primary: { variant: 'body2' } }}/>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ ml: 3 }}>
        {shortcut}
      </Typography>
    </MenuItem>
  );

  const run = (promise: Promise<void> | undefined) =>
  {
    promise?.catch(() => undefined);
  };

  const count = selectedCount > 1 ? ` ${eventsPhrase(selectedCount)}` : '';
  const eventId = request?.eventId ?? null;
  const cell = request?.cell ?? null;
  const items = eventId === null
    ? [
      ...(cell === null ? [] : [ item('New event', () => tools?.createAt(cell)) ]),
      ...(cell === null || onNewTransfer === undefined ? [] : [ item('New transfer…', () => onNewTransfer(cell)) ]),
      item('Paste', () => run(stampTools?.pasteFromClipboard(cell)), 'Ctrl+V'),
    ]
    : [
      item('Edit event', () => tools?.open(eventId), 'Enter'),
      <Divider key={'edit-divider'}/>,
      item(`Cut${count}`, () => run(stampTools?.cutToClipboard()), 'Ctrl+X'),
      item(`Copy${count}`, () => run(stampTools?.copyToClipboard()), 'Ctrl+C'),
      item(`Duplicate${count}`, () => tools?.duplicateSelected(), 'Ctrl+D'),
      item(`Delete${count}`, () => tools?.deleteSelected(), 'Del'),
    ];

  return (
    <Menu
      open={request !== null}
      onClose={onClose}
      anchorReference={'anchorPosition'}
      anchorPosition={request === null ? undefined : { top: request.y, left: request.x }}
    >
      {items}
    </Menu>
  );
};

export { EventMenu };
export type { EventMenuProps };

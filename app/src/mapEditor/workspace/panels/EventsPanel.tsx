import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Chip, CircularProgress, InputAdornment, Stack, TableSortLabel, TextField, Typography } from '@mui/material';
import Search from '@mui/icons-material/Search';
import { EventListSource } from '../../core/eventList/EventListSource.ts';
import {
  DEFAULT_SORT,
  eventCountLabel,
  filterEventRows,
  kindCounts,
  nextSort,
  selectRowRange,
  sortEventRows,
  steppedRowId,
  toggleRowSelection,
  type EventRow,
  type EventSort,
  type EventSortKey,
} from '../../core/eventList/eventRows.ts';
import { rowWindow, scrollToShow } from '../../core/eventList/rowWindow.ts';
import { NO_EVENTS, type SelectedEvents } from '../../core/events/EventSelection.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { SINGLE_PANEL_IDS } from '../../core/workspace/panels.ts';
import { MarkerIcon } from '../../views/MarkerIcon.tsx';
import { useEventSelection, useHeldMap, useWorkspace, useWorkspaceState } from '../workspaceHooks.tsx';

/**
 * How tall each row of the list is, in pixels.
 */
const ROW_HEIGHT = 26;

/**
 * How tall the column headings are, in pixels: they stay over the rows while the list scrolls.
 */
const HEADING_HEIGHT = 28;

/**
 * The list's columns, left to right: the id, the name with the event's marker beside it, where it stands, its kind, its
 * trigger and its pages. The name takes whatever room is left.
 */
const GRID_COLUMNS = '34px minmax(56px, 1fr) 56px 64px 84px 48px';

/**
 * The narrowest the columns squeeze, in pixels; a panel narrower still scrolls across.
 */
const GRID_MIN_WIDTH = 342;

/**
 * One column: what it sorts by, its heading, and whether it holds numbers, which line up on the right.
 */
type ListColumn = {
  readonly key: EventSortKey;
  readonly heading: string;
  readonly numeric: boolean;
};

/**
 * The columns, in the order they show.
 */
const COLUMNS: readonly ListColumn[] = [
  { key: 'id', heading: 'ID', numeric: true },
  { key: 'name', heading: 'Name', numeric: false },
  { key: 'position', heading: 'X, Y', numeric: false },
  { key: 'kind', heading: 'Kind', numeric: false },
  { key: 'trigger', heading: 'Trigger', numeric: false },
  { key: 'pages', heading: 'Pages', numeric: true },
];

/**
 * How the rows and the headings look, set once on the list rather than on every cell, so a list scrolled through
 * hundreds of events draws plain rows quickly.
 */
const LIST_STYLES = {
  '& [role="row"]': {
    display: 'grid',
    gridTemplateColumns: GRID_COLUMNS,
    alignItems: 'center',
    minWidth: GRID_MIN_WIDTH,
  },
  '& [role="gridcell"], & [role="columnheader"]': {
    px: 0.5,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-numeric="true"]': {
    textAlign: 'right',
    justifyContent: 'flex-end',
  },
  '& .event-line': {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    fontSize: 12,
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { bgcolor: 'action.hover' },
  },
  '& .event-line[aria-selected="true"]': {
    bgcolor: 'action.selected',
  },
  '& .event-name': {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
  },
  '& .event-name > span': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
} as const;

/**
 * Follows the part of the panel the rows scroll in: how tall it is and how far down it is scrolled, so only the rows
 * on show are drawn. It measures with its own window's observer, so a list torn out into a window of its own keeps
 * measuring there.
 * @returns {{ ref: React.RefObject<HTMLDivElement | null>, scrollTop: number, height: number, onScroll: (event: React.UIEvent<HTMLDivElement>) => void }}
 * The element's ref, its scroll and height (0 until measured), and its scroll listener.
 */
const useScrollViewport = () =>
{
  const ref = useRef<HTMLDivElement | null>(null);
  const [ scrollTop, setScrollTop ] = useState(0);
  const [ height, setHeight ] = useState(0);

  useEffect(() =>
  {
    const box = ref.current;
    const Observer = box?.ownerDocument.defaultView?.ResizeObserver ?? null;
    if (box === null || Observer === null)
    {
      return undefined;
    }

    setHeight(box.clientHeight);
    const observer = new Observer(() => setHeight(box.clientHeight));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /**
   * Notes how far down the rows are scrolled.
   * @param {React.UIEvent<HTMLDivElement>} event The scroll.
   */
  const onScroll = (event: React.UIEvent<HTMLDivElement>) =>
  {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return { ref, scrollTop, height, onScroll };
};

/**
 * Reads the words a column's cell shows for one event.
 * @param {EventRow} row The event's row.
 * @param {EventSortKey} key The column.
 * @returns {string} The words.
 */
const cellText = (row: EventRow, key: EventSortKey): string =>
{
  switch (key)
  {
    case 'id':
      return String(row.id);
    case 'name':
      return row.name;
    case 'position':
      return `${row.x}, ${row.y}`;
    case 'kind':
      return row.kindTitle;
    case 'trigger':
      return row.triggerLabel;
    case 'pages':
      return String(row.pageCount);
  }
};

/**
 * What one row of the list needs: the event, where it stands in the list, whether it is selected, and what a click and
 * a double-click on it do.
 */
type EventLineProps = {
  readonly row: EventRow;
  readonly index: number;
  readonly selected: boolean;
  readonly onPick: (event: React.MouseEvent, id: number) => void;
  readonly onOpen: (id: number) => void;
};

/**
 * One event's row: its id, its name beside the marker its kind or trigger shows on the map, where it stands, its kind,
 * its trigger and how many pages it has.
 * @param {EventLineProps} props The event, its place, whether it is selected, and the click handlers.
 * @returns {React.JSX.Element} The row.
 */
const EventLine = (props: EventLineProps) =>
{
  const { row, index, selected, onPick, onOpen } = props;
  return (
    <div
      role={'row'}
      className={'event-line'}
      aria-selected={selected}
      aria-rowindex={index + 2}
      data-testid={`event-row-${row.id}`}
      style={{ top: index * ROW_HEIGHT }}
      onClick={event => onPick(event, row.id)}
      onDoubleClick={() => onOpen(row.id)}
    >
      {COLUMNS.map(column => (column.key === 'name'
        ? (
          <div key={column.key} role={'gridcell'} className={'event-name'} title={row.name}>
            <MarkerIcon symbol={row.marker} size={14}/>
            <span>{row.name}</span>
          </div>
        )
        : (
          <div key={column.key} role={'gridcell'} data-numeric={column.numeric}>
            {cellText(row, column.key)}
          </div>
        )))}
    </div>
  );
};

/**
 * The column headings, each sorting the list by its column: a click on the column already sorted flips its way.
 * @param {{ sort: EventSort, onSort: (sort: EventSort) => void }} props The sort, and what to do with a new one.
 * @returns {React.JSX.Element} The headings.
 */
const Headings = (props: { readonly sort: EventSort; readonly onSort: (sort: EventSort) => void }) =>
{
  const { sort, onSort } = props;
  return (
    <Box
      role={'row'}
      aria-rowindex={1}
      sx={{ position: 'sticky', top: 0, zIndex: 1, height: HEADING_HEIGHT, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
    >
      {COLUMNS.map(column =>
      {
        const active = sort.key === column.key;
        const direction = sort.direction === 'ascending' ? 'asc' : 'desc';
        return (
          <Box
            key={column.key}
            role={'columnheader'}
            aria-sort={active ? sort.direction : 'none'}
            data-numeric={column.numeric}
            sx={{ display: 'flex', fontSize: 11, color: 'text.secondary' }}
          >
            <TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={() => onSort(nextSort(sort, column.key))}>
              {column.heading}
            </TableSortLabel>
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * What the list of one map's events needs: the map and its name, and the search and the sort, which the panel keeps
 * across maps so the same search runs on whichever map comes into focus.
 */
type EventListProps = {
  readonly map: MapDocument;
  readonly mapName: string;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly sort: EventSort;
  readonly onSort: (sort: EventSort) => void;
};

/**
 * Every event on one map, as a list: how many there are and of which kinds over it, a search, and a row per event that
 * sorts by any column. It follows the map live, rebuilding only for changes to its events, and the window's
 * selection both ways: a row clicked selects its event and centres the map on it, Shift and Ctrl add a range or one
 * more, the arrow keys step through the rows and Enter opens the event; an event picked on the map shows its row
 * highlighted, scrolled into sight.
 * @param {EventListProps} props The map, its name, and the search and sort.
 * @returns {React.JSX.Element} The list.
 */
const EventList = (props: EventListProps) =>
{
  const { map, mapName, query, onQuery, sort, onSort } = props;
  const controller = useWorkspace();
  const { modules } = controller.services;
  const source = useMemo(() => new EventListSource(map, modules), [ map, modules ]);
  useSyncExternalStore(source.subscribe, source.getVersion);
  const rows = source.rows();
  const shown = useMemo(() => sortEventRows(filterEventRows(rows, query), sort), [ rows, query, sort ]);
  const counts = useMemo(() => kindCounts(rows), [ rows ]);
  const selection = useEventSelection();
  const selectedOnMap = selection.mapId === map.mapId ? selection.eventIds : NO_EVENTS;
  const selectedSet = useMemo(() => new Set(selectedOnMap), [ selectedOnMap ]);
  const viewport = useScrollViewport();
  const [ anchor, setAnchor ] = useState<number | null>(null);
  const handledSelection = useRef<SelectedEvents | null>(null);

  // an event picked anywhere else, such as on the map, scrolls its row into sight once; a row clicked here shows
  // already, and a list rebuilt around the same selection stays where the author scrolled it.
  useEffect(() =>
  {
    const box = viewport.ref.current;
    if (box === null || handledSelection.current === selection)
    {
      return;
    }

    handledSelection.current = selection;
    const picked = selection.mapId === map.mapId ? selection.eventIds[selection.eventIds.length - 1] : undefined;
    const index = picked === undefined ? -1 : shown.findIndex(row => row.id === picked);
    const scroll = index < 0 ? null : scrollToShow(index, ROW_HEIGHT, box.scrollTop, box.clientHeight - HEADING_HEIGHT);
    if (scroll !== null)
    {
      box.scrollTop = scroll;
    }
  }, [ selection, shown, map, viewport.ref ]);

  /**
   * Selects an event and centres the map on it, remembering it as where a Shift click grows from.
   * @param {number} id The event.
   */
  const reveal = (id: number) =>
  {
    setAnchor(id);
    controller.revealEvent(map.mapId, id, SINGLE_PANEL_IDS.events);
  };

  /**
   * Answers a click on a row: alone it selects the event and centres the map on it; Shift selects every row from the
   * last one clicked; Ctrl adds the event or takes it out.
   * @param {React.MouseEvent} event The click.
   * @param {number} id The row's event.
   */
  const pick = (event: React.MouseEvent, id: number) =>
  {
    if (event.shiftKey)
    {
      controller.selection.select(map.mapId, selectRowRange(shown, anchor, id));
      return;
    }

    if (event.ctrlKey || event.metaKey)
    {
      setAnchor(id);
      controller.selection.select(map.mapId, toggleRowSelection(selectedOnMap, id));
      return;
    }

    reveal(id);
  };

  /**
   * Answers the keys while the list itself has focus, not one of its headings: the arrows step to the next or previous
   * row, selecting it and centring the map on it, and Enter opens the event picked last.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (event.target !== event.currentTarget)
    {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    {
      event.preventDefault();
      const id = steppedRowId(shown, selectedOnMap, event.key === 'ArrowDown' ? 1 : -1);
      if (id !== null)
      {
        reveal(id);
      }

      return;
    }

    const last = selectedOnMap[selectedOnMap.length - 1];
    if (event.key === 'Enter' && last !== undefined)
    {
      event.preventDefault();
      controller.openEvent(map.mapId, last);
    }
  };

  const span = rowWindow(viewport.scrollTop, viewport.height - HEADING_HEIGHT, ROW_HEIGHT, shown.length);
  const quiet = rows.length === 0
    ? 'This map has no events yet.'
    : 'No events match this search.';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }} data-testid={'events-panel'}>
      <Stack spacing={0.75} sx={{ px: 1.5, pt: 1, pb: 1 }}>
        <Stack direction={'row'} spacing={1} alignItems={'baseline'}>
          <Typography variant={'subtitle2'} noWrap sx={{ flex: 1, minWidth: 0 }}>
            {mapName}
          </Typography>
          <Typography variant={'body2'} color={'text.secondary'} noWrap data-testid={'event-count'}>
            {eventCountLabel(rows.length, shown.length)}
          </Typography>
        </Stack>
        <TextField
          fullWidth
          size={'small'}
          placeholder={'Search by name, id, kind or trigger'}
          value={query}
          onChange={event => onQuery(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search the events' },
            input: { startAdornment: <InputAdornment position={'start'}><Search fontSize={'small'}/></InputAdornment> },
          }}
        />
        {counts.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }} data-testid={'event-kind-counts'}>
            {counts.map(count => (
              <Chip
                key={count.kindId ?? 'none'}
                size={'small'}
                variant={'outlined'}
                icon={count.marker === null ? undefined : <MarkerIcon symbol={count.marker} size={14}/>}
                label={`${count.title} ${count.count}`}
              />
            ))}
          </Box>
        )}
      </Stack>
      <Box
        ref={viewport.ref}
        role={'grid'}
        aria-label={'Events'}
        aria-rowcount={shown.length + 1}
        aria-multiselectable
        tabIndex={0}
        onScroll={viewport.onScroll}
        onKeyDown={onKeyDown}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', outline: 'none', borderTop: 1, borderColor: 'divider', ...LIST_STYLES }}
      >
        <Headings sort={sort} onSort={onSort}/>
        <Box sx={{ position: 'relative', height: shown.length * ROW_HEIGHT, minWidth: GRID_MIN_WIDTH }}>
          {shown.slice(span.start, span.end).map((row, offset) => (
            <EventLine
              key={row.id}
              row={row}
              index={span.start + offset}
              selected={selectedSet.has(row.id)}
              onPick={pick}
              onOpen={id => controller.openEvent(map.mapId, id)}
            />
          ))}
        </Box>
        {shown.length === 0 && (
          <Typography variant={'body2'} color={'text.secondary'} align={'center'} sx={{ p: 2 }}>
            {quiet}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

/**
 * Every event on the map in focus (the last one focused in a panel or picked alone in the tree), listed with its id,
 * name, position, kind, trigger and page count under a count of how many there are and of which kinds, so how busy a
 * map is reads at a glance. A search narrows it and any column sorts it; a click selects an event and centres the map
 * on it, and a double-click opens its window. It follows the map live, whatever window the edits come from.
 * @returns {React.JSX.Element} The panel.
 */
const EventsPanel = () =>
{
  const mapId = useWorkspaceState(state => state.currentMapId);
  const held = useHeldMap(mapId);
  const [ query, setQuery ] = useState('');
  const [ sort, setSort ] = useState<EventSort>(DEFAULT_SORT);

  if (mapId === null || held.map === null)
  {
    const waiting = mapId !== null && held.row !== null && held.failure === null;
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, color: 'text.secondary', bgcolor: 'background.default' }}>
        {waiting
          ? <CircularProgress size={24}/>
          : <Typography variant={'body2'} align={'center'}>{held.failure ?? 'Pick a map in the tree, or open one, to list its events here.'}</Typography>}
      </Box>
    );
  }

  // a list of its own per map, so the scroll and the row a Shift click grows from start afresh on each.
  return (
    <EventList
      key={mapId}
      map={held.map}
      mapName={held.row?.name ?? ''}
      query={query}
      onQuery={setQuery}
      sort={sort}
      onSort={setSort}
    />
  );
};

export { EventsPanel };

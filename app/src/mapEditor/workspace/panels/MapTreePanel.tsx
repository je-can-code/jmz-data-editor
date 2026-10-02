import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Divider, IconButton, InputBase, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { ChevronRight, CreateNewFolderOutlined, ExpandMore } from '@mui/icons-material';
import type { IDockviewPanelProps } from 'dockview-react';
import { TREE_ROOT, type MapInfoRows } from '../../core/tree/MapTreeModel.ts';
import {
  deleteQuestion,
  draggedMaps,
  dropPlace,
  dropZoneAt,
  initiallyExpanded,
  revealMaps,
  selectionAfterCollapse,
  selectRange,
  toggleSelection,
  visibleTreeLines,
  type DropZone,
  type TreeLine,
} from '../../core/tree/treeView.ts';
import { decodeDraggedMaps, encodeDraggedMaps, MAP_DRAG_TYPE, SINGLE_PANEL_IDS } from '../../core/workspace/panels.ts';
import { appShortcutFor, type KeyTarget, type ShortcutCommand } from '../../core/workspace/shortcuts.ts';
import type { WorkspaceController } from '../WorkspaceController.ts';
import { useDocumentRevision, useMapTreeDocument, useWorkspace, useWorkspaceState } from '../workspaceHooks.tsx';

/**
 * What the tree panel keeps in the saved layout: which branches are open.
 */
type MapTreeParams = {
  readonly expanded?: readonly number[];
};

/**
 * What every row hands back to the panel. One object for all rows, so a row redraws only when its own line does.
 */
type RowHandlers = {
  readonly click: (event: React.MouseEvent, mapId: number) => void;
  readonly open: (mapId: number) => void;
  readonly menu: (event: React.MouseEvent, mapId: number | null) => void;
  readonly toggle: (mapId: number) => void;
  readonly dragStart: (event: React.DragEvent, mapId: number) => void;
  readonly dragOver: (event: React.DragEvent, mapId: number) => void;
  readonly drop: (event: React.DragEvent, mapId: number) => void;
  readonly dragEnd: () => void;
  readonly rename: (mapId: number, name: string | null) => void;
};

/**
 * Where the right-click menu is open, and on which map, if any.
 */
type MenuState = { readonly x: number; readonly y: number; readonly mapId: number | null } | null;

/**
 * How far each level of the tree is indented, in pixels.
 */
const INDENT = 14;

/**
 * The line a drop draws on the row it would land by: along its top in front of it, along its bottom after it, and
 * none inside it, where the whole row lights up instead.
 */
const DROP_LINES: Readonly<Record<DropZone, string>> = {
  before: 'inset 0 2px 0 0 #90caf9',
  after: 'inset 0 -2px 0 0 #90caf9',
  inside: 'none',
};

/**
 * Reads which part of a row a drag is over.
 * @param {React.DragEvent} event The drag event.
 * @returns {DropZone} The zone.
 */
const zoneOf = (event: React.DragEvent): DropZone =>
{
  const bounds = event.currentTarget.getBoundingClientRect();
  return dropZoneAt(event.clientY - bounds.top, bounds.height);
};

/**
 * Renames a map in place: Enter or leaving the field keeps the name, Escape keeps the old one.
 * @param {{ mapId: number, name: string, onDone: (mapId: number, name: string | null) => void }} props The map, its name and what to do when done.
 * @returns {React.JSX.Element} The field.
 */
const RenameField = (props: { mapId: number; name: string; onDone: (mapId: number, name: string | null) => void }) =>
{
  const { mapId, name, onDone } = props;
  const [ draft, setDraft ] = useState(name);
  const finished = useRef(false);

  /**
   * Finishes once, with the new name or none.
   * @param {string | null} value The name to keep, or null to cancel.
   */
  const finish = (value: string | null) =>
  {
    if (finished.current === false)
    {
      finished.current = true;
      onDone(mapId, value);
    }
  };

  return (
    <InputBase
      autoFocus
      value={draft}
      onFocus={event => event.target.select()}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => finish(draft)}
      onClick={event => event.stopPropagation()}
      onKeyDown={event =>
      {
        event.stopPropagation();
        if (event.key === 'Enter')
        {
          finish(draft);
        }

        if (event.key === 'Escape')
        {
          finish(null);
        }
      }}
      inputProps={{ 'aria-label': 'Map name' }}
      sx={{ flex: 1, fontSize: 13, px: 0.5, bgcolor: 'background.paper', border: 1, borderColor: 'primary.main', borderRadius: 0.5 }}
    />
  );
};

/**
 * One line of the tree: the branch toggle, the name (or the rename field), and the map's id.
 * @param {object} props The line, how it shows, and the panel's handlers.
 * @returns {React.JSX.Element} The row.
 */
const TreeRow = memo((props: {
  line: TreeLine;
  selected: boolean;
  cut: boolean;
  zone: DropZone | null;
  renaming: boolean;
  handlers: RowHandlers;
}) =>
{
  const { line, selected, cut, zone, renaming, handlers } = props;
  return (
    <Box
      data-map-id={line.id}
      role={'treeitem'}
      aria-selected={selected}
      aria-expanded={line.hasChildren ? line.expanded : undefined}
      draggable={renaming === false}
      onClick={event => handlers.click(event, line.id)}
      onDoubleClick={() => handlers.open(line.id)}
      onContextMenu={event => handlers.menu(event, line.id)}
      onDragStart={event => handlers.dragStart(event, line.id)}
      onDragOver={event => handlers.dragOver(event, line.id)}
      onDrop={event => handlers.drop(event, line.id)}
      onDragEnd={handlers.dragEnd}
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: 24,
        pl: `${4 + line.depth * INDENT}px`,
        pr: 1,
        cursor: 'default',
        userSelect: 'none',
        opacity: cut ? 0.5 : 1,
        bgcolor: selected || zone === 'inside' ? 'action.selected' : 'transparent',
        boxShadow: DROP_LINES[zone ?? 'inside'],
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
      }}
    >
      {line.hasChildren
        ? (
          <IconButton
            size={'small'}
            aria-label={line.expanded ? 'Close branch' : 'Open branch'}
            onClick={event =>
            {
              event.stopPropagation();
              handlers.toggle(line.id);
            }}
            sx={{ p: 0, mr: 0.25 }}
          >
            {line.expanded ? <ExpandMore sx={{ fontSize: 18 }}/> : <ChevronRight sx={{ fontSize: 18 }}/>}
          </IconButton>
        )
        : <Box sx={{ width: 18, mr: 0.25, flexShrink: 0 }}/>}
      {renaming
        ? <RenameField mapId={line.id} name={line.name} onDone={handlers.rename}/>
        : (
          <Typography variant={'body2'} noWrap sx={{ flex: 1, fontSize: 13 }}>
            {line.name}
          </Typography>
        )}
      <Typography variant={'caption'} color={'text.disabled'} sx={{ ml: 1, fontVariantNumeric: 'tabular-nums' }}>
        {String(line.id).padStart(3, '0')}
      </Typography>
    </Box>
  );
});

TreeRow.displayName = 'TreeRow';

/**
 * The tree's right-click menu: everything the keyboard does, and the rest, on the map clicked or on the tree itself.
 * Deleting asks first, as the Delete key does.
 * @param {object} props Where it is open, the selection, whether anything can be pasted, the workspace, and how to ask about a delete.
 * @returns {React.JSX.Element} The menu.
 */
const TreeMenu = (props: {
  menu: MenuState;
  selection: readonly number[];
  canPaste: boolean;
  controller: WorkspaceController;
  onDelete: (mapIds: readonly number[]) => void;
  onClose: () => void;
}) =>
{
  const { menu, selection, canPaste, controller, onDelete, onClose } = props;
  const mapId = menu?.mapId ?? null;

  /**
   * Builds one menu item that closes the menu and then acts.
   * @param {string} label What it says.
   * @param {() => void} act What it does.
   * @param {string} shortcut The keys that do the same, if any.
   * @param {boolean} disabled Whether it is greyed out.
   * @returns {React.JSX.Element} The item.
   */
  const item = (label: string, act: () => void, shortcut = '', disabled = false) => (
    <MenuItem
      key={label}
      dense
      disabled={disabled}
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

  const run = (promise: Promise<void>) =>
  {
    promise.catch(() => undefined);
  };

  const onMap = mapId === null
    ? [
      item('New map', () => run(controller.createMap(TREE_ROOT))),
      item('Paste', () => run(controller.paste(TREE_ROOT)), 'Ctrl+V', canPaste === false),
    ]
    : [
      item('Open', () => selection.forEach(id => controller.openMap(id)), 'Enter'),
      item('Open beside', () => controller.openMap(mapId, { beside: true })),
      <Divider key={'open-divider'}/>,
      item('New map inside', () => run(controller.createMap(mapId))),
      item('Rename', () => controller.setRenaming(mapId), 'F2'),
      item('Duplicate', () => run(controller.duplicateMaps(selection)), 'Ctrl+D'),
      item('Copy', () => run(controller.copyMaps(selection)), 'Ctrl+C'),
      item('Cut', () => controller.cutMaps(selection), 'Ctrl+X'),
      item('Paste inside', () => run(controller.paste(mapId)), 'Ctrl+V', canPaste === false),
      item('Delete', () => onDelete(selection), 'Del'),
      <Divider key={'edit-divider'}/>,
      item('Properties', () =>
      {
        controller.selectTreeMaps([ mapId ]);
        controller.dockview?.getPanel(SINGLE_PANEL_IDS.properties)?.api.setActive();
      }),
    ];

  return (
    <Menu
      open={menu !== null}
      onClose={onClose}
      anchorReference={'anchorPosition'}
      anchorPosition={menu === null ? undefined : { top: menu.y, left: menu.x }}
    >
      {onMap}
    </Menu>
  );
};

/**
 * The question the tree asks, in place above its rows, before deleting maps: what goes and how many maps that is,
 * with a button to go ahead and one to keep them. Nothing else waits on it; Enter on the focused button deletes, and
 * Escape keeps the maps.
 * @param {{ text: string, onDelete: () => void, onKeep: () => void }} props The question and its two answers.
 * @returns {React.JSX.Element} The question.
 */
const DeleteConfirm = (props: { text: string; onDelete: () => void; onKeep: () => void }) =>
{
  const { text, onDelete, onKeep } = props;
  return (
    <Alert
      severity={'warning'}
      data-testid={'delete-confirm'}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          event.stopPropagation();
          onKeep();
        }
      }}
      action={(
        <Stack direction={'row'} spacing={0.5}>
          <Button color={'inherit'} size={'small'} autoFocus onClick={onDelete}>
            Delete
          </Button>
          <Button color={'inherit'} size={'small'} onClick={onKeep}>
            Keep
          </Button>
        </Stack>
      )}
      sx={{ borderRadius: 0, py: 0, alignItems: 'center' }}
    >
      {text}
    </Alert>
  );
};

/**
 * The map tree: every map in the project, nested and ordered as MapInfos.json keeps them. Click to pick, Shift and
 * Ctrl to pick several, double-click or Enter to open, F2 to rename, drag to nest and reorder (or into any pane to
 * open it there), and Ctrl+C, X, V, D and Delete to copy, cut, paste, duplicate and delete, all undoable. Deleting
 * asks first, in place, saying how many maps go: the tree's history lasts only as long as the window, so a delete
 * cannot be undone once it closes. The right click offers the same. Open branches are kept with the layout.
 * @param {IDockviewPanelProps<MapTreeParams>} props The dock's panel props.
 * @returns {React.JSX.Element} The panel.
 */
const MapTreePanel = (props: IDockviewPanelProps<MapTreeParams>) =>
{
  const { api, params } = props;
  const controller = useWorkspace();
  const { tree, failure } = useMapTreeDocument();
  const revision = useDocumentRevision(tree);
  const selection = useWorkspaceState(state => state.treeSelection);
  const renaming = useWorkspaceState(state => state.renaming);
  const clipboard = useWorkspaceState(state => state.clipboard);
  const [ expanded, setExpanded ] = useState<Set<number>>(() => new Set(params.expanded ?? []));
  const [ anchor, setAnchor ] = useState<number | null>(null);
  const [ drop, setDrop ] = useState<{ id: number; zone: DropZone } | null>(null);
  const [ menu, setMenu ] = useState<MenuState>(null);
  const [ confirming, setConfirming ] = useState<readonly number[] | null>(null);
  const seeded = useRef(params.expanded !== undefined);
  const list = useRef<HTMLDivElement | null>(null);

  // the rows change only with the tree's revision; copying them per render would copy every row every time.
  const rows = useMemo(
    () => (tree === null ? [] : tree.toJson() as unknown as MapInfoRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ tree, revision ],
  );
  const lines = useMemo(() => visibleTreeLines(rows, expanded), [ rows, expanded ]);
  const cutIds = useMemo(() => new Set(clipboard?.kind === 'cut' ? clipboard.mapIds : []), [ clipboard ]);
  const question = useMemo(() => (confirming === null ? null : deleteQuestion(rows, confirming)), [ rows, confirming ]);

  // a question about a delete stands for the maps picked when it was asked; picking others withdraws it.
  useEffect(() =>
  {
    setConfirming(null);
  }, [ selection ]);

  // the first time the tree loads without saved branches, open the ones MZ left open.
  useEffect(() =>
  {
    if (seeded.current === false && tree !== null)
    {
      seeded.current = true;
      setExpanded(new Set(initiallyExpanded(rows)));
    }
  }, [ tree, rows ]);

  // open branches live in the layout, so they come back with it.
  useEffect(() =>
  {
    api.updateParameters({ expanded: [ ...expanded ] });
  }, [ api, expanded ]);

  // whatever gets picked (a paste, a duplicate, an undone delete) is revealed and scrolled into view. Only a new pick or
  // a changed tree reveals anything: a branch closed by hand stays closed.
  const revealedFor = useRef<{ rows: MapInfoRows; selection: readonly number[] } | null>(null);
  useEffect(() =>
  {
    const fresh = revealedFor.current === null || revealedFor.current.rows !== rows || revealedFor.current.selection !== selection;
    revealedFor.current = { rows, selection };
    const revealed = fresh ? revealMaps(rows, expanded, selection) : expanded;
    if (revealed.size !== expanded.size)
    {
      setExpanded(revealed);
      return;
    }

    const last = selection[selection.length - 1];
    list.current?.querySelector(`[data-map-id="${last}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ rows, expanded, selection ]);

  const state = useRef({ rows, lines, selection, anchor, drop, expanded });
  state.current = { rows, lines, selection, anchor, drop, expanded };

  const handlers = useMemo<RowHandlers>(() => ({
    click: (event, mapId) =>
    {
      const { current } = state;
      list.current?.focus({ preventScroll: true });
      if (event.shiftKey)
      {
        controller.selectTreeMaps(selectRange(current.lines, current.anchor, mapId));
        return;
      }

      setAnchor(mapId);
      controller.selectTreeMaps(event.ctrlKey || event.metaKey ? toggleSelection(current.selection, mapId) : [ mapId ]);
    },
    open: mapId => controller.openMap(mapId),
    menu: (event, mapId) =>
    {
      event.preventDefault();
      event.stopPropagation();
      if (mapId !== null && state.current.selection.includes(mapId) === false)
      {
        setAnchor(mapId);
        controller.selectTreeMaps([ mapId ]);
      }

      setMenu({ x: event.clientX, y: event.clientY, mapId });
    },
    toggle: mapId =>
    {
      const { current } = state;
      const closing = current.expanded.has(mapId);
      setExpanded(open =>
      {
        const next = new Set(open);
        if (next.delete(mapId) === false)
        {
          next.add(mapId);
        }

        return next;
      });

      // closing a branch holding picked maps picks the branch instead, rather than opening it again to show them.
      const picked = closing ? selectionAfterCollapse(current.rows, current.selection, mapId) : current.selection;
      if (picked.length !== current.selection.length || picked.some((id, at) => id !== current.selection[at]))
      {
        if (current.anchor !== null && picked.includes(current.anchor) === false)
        {
          setAnchor(mapId);
        }

        controller.selectTreeMaps(picked);
      }
    },
    dragStart: (event, mapId) =>
    {
      const carried = draggedMaps(state.current.selection, mapId);
      if (state.current.selection.includes(mapId) === false)
      {
        setAnchor(mapId);
        controller.selectTreeMaps([ mapId ]);
      }

      event.dataTransfer.setData(MAP_DRAG_TYPE, encodeDraggedMaps(carried));
      event.dataTransfer.effectAllowed = 'copyMove';
    },
    dragOver: (event, mapId) =>
    {
      if (event.dataTransfer.types.includes(MAP_DRAG_TYPE) === false)
      {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const zone = zoneOf(event);
      const current = state.current.drop;
      if (current === null || current.id !== mapId || current.zone !== zone)
      {
        setDrop({ id: mapId, zone });
      }
    },
    drop: (event, mapId) =>
    {
      event.preventDefault();
      event.stopPropagation();
      setDrop(null);
      const carried = decodeDraggedMaps(event.dataTransfer.getData(MAP_DRAG_TYPE));
      if (carried.length > 0)
      {
        controller.moveMaps(carried, dropPlace(state.current.rows, mapId, zoneOf(event))).catch(() => undefined);
      }
    },
    dragEnd: () => setDrop(null),
    rename: (mapId, name) =>
    {
      list.current?.focus({ preventScroll: true });
      if (name === null)
      {
        controller.setRenaming(null);
        return;
      }

      controller.renameMap(mapId, name).catch(() => undefined);
    },
  }), [ controller ]);

  /**
   * Runs the tree's shortcuts on the selection. Undo, redo and save are left to go by, for the workspace to route.
   * @param {React.KeyboardEvent} event The key press.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (moveWithArrows(event))
    {
      return;
    }

    const command = appShortcutFor(event, event.target as unknown as KeyTarget);
    const action = command === null ? undefined : shortcutActions[command];
    if (action !== undefined)
    {
      event.preventDefault();
      action();
    }
  };

  /**
   * Moves the pick up and down the tree with the arrow keys, and opens or closes branches with left and right.
   * @param {React.KeyboardEvent} event The key press.
   * @returns {boolean} True when the key was an arrow the tree used.
   */
  const moveWithArrows = (event: React.KeyboardEvent): boolean =>
  {
    const ids = lines.map(line => line.id);
    const at = ids.indexOf(selection[selection.length - 1] ?? -1);
    const step: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in step)
    {
      event.preventDefault();
      const next = ids[Math.min(ids.length - 1, Math.max(0, at + step[event.key]))];
      if (next !== undefined)
      {
        setAnchor(next);
        controller.selectTreeMaps([ next ]);
      }

      return true;
    }

    const line = lines[at];
    if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && line?.hasChildren)
    {
      event.preventDefault();
      if (line.expanded !== (event.key === 'ArrowRight'))
      {
        handlers.toggle(line.id);
      }

      return true;
    }

    return false;
  };

  /**
   * Asks, in place, before deleting maps, when there is anything to delete.
   * @param {readonly number[]} mapIds The maps picked.
   */
  const askDelete = (mapIds: readonly number[]) =>
  {
    if (deleteQuestion(rows, mapIds) !== null)
    {
      setConfirming([ ...mapIds ]);
    }
  };

  /**
   * Answers the question about a delete, deleting the maps it named or keeping them, and hands the keys back to the
   * tree.
   * @param {boolean} go True to delete.
   */
  const answerDelete = (go: boolean) =>
  {
    const mapIds = confirming;
    setConfirming(null);
    list.current?.focus({ preventScroll: true });
    if (go && mapIds !== null)
    {
      controller.deleteMaps(mapIds).catch(() => undefined);
    }
  };

  const target = anchor !== null && selection.includes(anchor) ? anchor : selection[0] ?? TREE_ROOT;
  const shortcutActions: Partial<Record<ShortcutCommand, () => void>> = {
    copy: () => controller.copyMaps(selection).catch(() => undefined),
    cut: () => controller.cutMaps(selection),
    paste: () => controller.paste(target).catch(() => undefined),
    duplicate: () => controller.duplicateMaps(selection).catch(() => undefined),
    delete: () => askDelete(selection),
    rename: () => controller.setRenaming(selection[0] ?? null),
    open: () => selection.forEach(mapId => controller.openMap(mapId)),
    escape: () =>
    {
      if (confirming !== null)
      {
        setConfirming(null);
        return;
      }

      if (clipboard?.kind === 'cut')
      {
        controller.clearClipboard();
        return;
      }

      controller.selectTreeMaps([]);
    },
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Stack direction={'row'} alignItems={'center'} sx={{ px: 1, minHeight: 30, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant={'caption'} color={'text.secondary'} sx={{ flex: 1 }}>
          {tree === null ? '' : `${lines.length} shown`}
        </Typography>
        <Tooltip title={selection.length === 1 ? 'New map inside the picked one' : 'New map'}>
          <span>
            <IconButton
              size={'small'}
              aria-label={'New map'}
              disabled={tree === null}
              onClick={() => controller.createMap(selection.length === 1 ? selection[0] : TREE_ROOT).catch(() => undefined)}
            >
              <CreateNewFolderOutlined fontSize={'small'}/>
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {question !== null && <DeleteConfirm text={question.text} onDelete={() => answerDelete(true)} onKeep={() => answerDelete(false)}/>}
      <Box
        ref={list}
        role={'tree'}
        aria-multiselectable
        tabIndex={0}
        data-testid={'map-tree'}
        onKeyDown={onKeyDown}
        onContextMenu={event => handlers.menu(event, null)}
        onDragOver={event =>
        {
          if (event.dataTransfer.types.includes(MAP_DRAG_TYPE))
          {
            event.preventDefault();
            setDrop(null);
          }
        }}
        onDrop={event =>
        {
          event.preventDefault();
          setDrop(null);
          const carried = decodeDraggedMaps(event.dataTransfer.getData(MAP_DRAG_TYPE));
          if (carried.length > 0)
          {
            controller.moveMaps(carried, { parentId: TREE_ROOT, beforeId: null }).catch(() => undefined);
          }
        }}
        sx={{ flex: 1, overflowY: 'auto', outline: 'none', pb: 4 }}
      >
        {failure !== null && (
          <Typography variant={'body2'} color={'text.secondary'} sx={{ p: 2 }}>
            {failure}
          </Typography>
        )}
        {lines.map(line => (
          <TreeRow
            key={line.id}
            line={line}
            selected={selection.includes(line.id)}
            cut={cutIds.has(line.id)}
            zone={drop !== null && drop.id === line.id ? drop.zone : null}
            renaming={renaming === line.id}
            handlers={handlers}
          />
        ))}
      </Box>
      <TreeMenu
        menu={menu}
        selection={selection}
        canPaste={clipboard !== null}
        controller={controller}
        onDelete={askDelete}
        onClose={() => setMenu(null)}
      />
    </Box>
  );
};

export { MapTreePanel };
export type { MapTreeParams };

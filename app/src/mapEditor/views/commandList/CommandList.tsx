import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Divider, Menu, MenuItem } from '@mui/material';
import type { CommandEditorRegistry } from '../../core/commands/CommandEditorRegistry.ts';
import type { CommandCatalogEntry } from '../../core/commands/catalogTypes.ts';
import { renderSentence, type NameLookup } from '../../core/commands/sentence.ts';
import { hasElseBranch } from '../../core/commandList/blockReconcile.ts';
import { CommandListEditor } from '../../core/commandList/CommandListEditor.ts';
import { isBodyInside, type CommandBlockNode, type CommandNode } from '../../core/commandList/commandTree.ts';
import { nameLookup } from '../../core/commandList/databaseNames.ts';
import {
  dropTargetAt,
  pointAtRow,
  pointBelowRow,
  type DropTarget,
  type InsertionPoint,
} from '../../core/commandList/insertionPoints.ts';
import { outermostNodes } from '../../core/commandList/listEdits.ts';
import { buildListRows, startsFolded, type ListRow } from '../../core/commandList/listRows.ts';
import { clickSelection, nodeOfRow, selectedNodes, type ListSelection } from '../../core/commandList/listSelection.ts';
import type { HistoryKey } from '../../core/history/historyKeys.ts';
import type { DocumentKey } from '../../core/model/documentKeys.ts';
import type { PatchPath } from '../../core/model/patches.ts';
import type { RmmzEventCommand } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { SoundPlayerContext, useCommandListResources } from './commandListResources.ts';
import { CommandRow, INDENT_PX } from './CommandRow.tsx';
import { CommandRowEditor } from './CommandRowEditor.tsx';
import { CommandSearch } from './CommandSearch.tsx';
import { useDocumentRevision } from './useCommandListState.ts';

/**
 * How far the pointer must travel with the button held before a press on a row's handle becomes a drag.
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * What a command list shows: one list, inside one document, and the histories its edits belong to.
 */
type CommandListProps = {
  /**
   * The document holding the list; it must be held by the window's hub while the list shows.
   */
  readonly documentKey: DocumentKey;

  /**
   * Where the list sits inside the document: {@code ['events', 5, 'pages', 0, 'list']} for a map event's first
   * page, {@code [31, 'list']} for common event 31.
   */
  readonly path: PatchPath;

  /**
   * The histories every edit is recorded in; the first is the one Ctrl+Z undoes.
   */
  readonly histories: readonly HistoryKey[];

  /**
   * What assistive technology calls the list.
   */
  readonly label?: string;
};

/**
 * A drag in progress: the units dragged (by their first command), where it started, whether it has moved far
 * enough to be a drag, and where it would land.
 */
type DragState = {
  readonly heads: readonly RmmzEventCommand[];
  readonly originY: number;
  readonly active: boolean;
  readonly target: DropTarget | null;
};

/**
 * The open search: the row it adds at, and what was typed to open it.
 */
type SearchState = {
  readonly at: RmmzEventCommand;
  readonly query: string;
};

/**
 * The open context menu: where, and for which row.
 */
type MenuState = {
  readonly x: number;
  readonly y: number;
  readonly row: ListRow;
};

/**
 * Reports whether an event started inside something that handles its own keys and clipboard: a text box, the open
 * editor, the search.
 * @param {EventTarget | null} target Where the event started.
 * @returns {boolean} True when the list should leave the event alone.
 */
const isInsideEditor = (target: EventTarget | null): boolean =>
{
  return target instanceof Element
    && target.closest('input, textarea, select, [contenteditable="true"], [data-command-editor], [data-command-search]') !== null;
};

/**
 * Writes a row's sentence. A sentence built from a plugin's header could meet arguments it never expected, and a
 * row that failed to read would take the whole list down with it, so a failure reads as the bare command instead.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {RmmzEventCommand} command The command.
 * @param {readonly RmmzEventCommand[]} continuation Its lines.
 * @param {NameLookup} names Names ids.
 * @returns {string} The sentence.
 */
const sentenceOf = (entry: CommandCatalogEntry, command: RmmzEventCommand, continuation: readonly RmmzEventCommand[], names: NameLookup): string =>
{
  try
  {
    return renderSentence(entry, command, continuation, names);
  }
  catch
  {
    return `${entry.name} (${JSON.stringify(command.parameters)})`;
  }
};

/**
 * Maps each command of a list to its index.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @returns {Map<RmmzEventCommand, number>} The indexes, by command.
 */
const indexCommands = (list: readonly RmmzEventCommand[]): Map<RmmzEventCommand, number> =>
{
  return new Map(list.map((command, index) => [ command, index ]));
};

/**
 * Turns the selection the list keeps (units by their first command, which survive edits elsewhere in the list)
 * into indexes, for the selection rules.
 * @param {readonly RmmzEventCommand[]} selected The selected units' first commands.
 * @param {RmmzEventCommand | null} anchor Where a Shift range starts.
 * @param {ReadonlyMap<RmmzEventCommand, number>} indexOf Each command's index.
 * @returns {ListSelection} The selection by index; units gone from the list drop out.
 */
const selectionOf = (
  selected: readonly RmmzEventCommand[],
  anchor: RmmzEventCommand | null,
  indexOf: ReadonlyMap<RmmzEventCommand, number>,
): ListSelection =>
{
  return {
    selected: selected.map(head => indexOf.get(head)).filter((index): index is number => index !== undefined),
    anchor: anchor === null ? null : indexOf.get(anchor) ?? null,
  };
};

/**
 * Finds the row showing a command.
 * @param {readonly ListRow[]} rows The rows.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {RmmzEventCommand | null} head The command.
 * @returns {number} The row's position, or -1 when no row shows it.
 */
const rowPositionOf = (rows: readonly ListRow[], list: readonly RmmzEventCommand[], head: RmmzEventCommand | null): number =>
{
  return head === null
    ? -1
    : rows.findIndex(row => list[row.index] === head);
};

/**
 * Finds where the open search adds: its row, and the place that row stands for.
 * @param {readonly ListRow[]} rows The rows.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {SearchState | null} search The search.
 * @returns {{ row: ListRow, point: InsertionPoint } | null} The place, or null when no search is open or its row is gone.
 */
const searchPlaceOf = (rows: readonly ListRow[], list: readonly RmmzEventCommand[], search: SearchState | null): { row: ListRow; point: InsertionPoint } | null =>
{
  const row = search === null
    ? undefined
    : rows.find(each => list[each.index] === search.at);
  const point = row === undefined
    ? null
    : pointAtRow(row) ?? pointBelowRow(row);
  return row === undefined || point === null
    ? null
    : { row, point };
};

/**
 * Finds the gap a drag's marker shows in, and its indent.
 * @param {DragState | null} drag The drag.
 * @returns {{ gap: number, indent: number } | null} The marker, or null while nothing is being dragged anywhere.
 */
const markerOf = (drag: DragState | null): { gap: number; indent: number } | null =>
{
  return drag === null || drag.active === false || drag.target === null
    ? null
    : { gap: drag.target.gap, indent: drag.target.point.body.indent };
};

/**
 * What the context menu offers, and what each choice does.
 */
type CommandListMenuProps = {
  readonly menu: MenuState | null;

  /**
   * Whether anything is selected, for the choices that act on the selection.
   */
  readonly hasSelection: boolean;

  /**
   * Whether the menu's row is a conditional branch with an else, or null when it is no conditional branch.
   */
  readonly hasElse: boolean | null;

  readonly onClose: () => void;
  readonly onAdd: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onToggleElse: () => void;
  readonly onToggleFold: () => void;
};

/**
 * The list's context menu: add a command at the row, the clipboard, duplicate and delete, a conditional branch's
 * else, and folding.
 * @param {CommandListMenuProps} props What it offers and does.
 * @returns {React.JSX.Element} The menu.
 */
const CommandListMenu = (props: CommandListMenuProps) =>
{
  const { menu, hasSelection, hasElse } = props;
  const row = menu?.row ?? null;
  return (
    <Menu
      open={menu !== null}
      onClose={props.onClose}
      anchorReference={'anchorPosition'}
      anchorPosition={menu === null ? undefined : { top: menu.y, left: menu.x }}
    >
      <MenuItem onClick={props.onAdd}>Add a command here</MenuItem>
      <Divider/>
      <MenuItem disabled={hasSelection === false} onClick={props.onCopy}>Copy</MenuItem>
      <MenuItem disabled={hasSelection === false} onClick={props.onCut}>Cut</MenuItem>
      <MenuItem onClick={props.onPaste}>Paste</MenuItem>
      <MenuItem disabled={hasSelection === false} onClick={props.onDuplicate}>Duplicate</MenuItem>
      <MenuItem disabled={hasSelection === false} onClick={props.onDelete}>Delete</MenuItem>
      {hasElse !== null && (
        <MenuItem onClick={props.onToggleElse}>{hasElse ? 'Remove the else branch' : 'Add an else branch'}</MenuItem>
      )}
      {row !== null && row.foldable && (
        <MenuItem onClick={props.onToggleFold}>{row.folded ? 'Unfold' : 'Fold'}</MenuItem>
      )}
    </Menu>
  );
};

/**
 * The line showing where a drag will land.
 * @param {{ indent: number }} props The indent of the place.
 * @returns {React.JSX.Element} The marker.
 */
const DropMarker = (props: { readonly indent: number }) =>
{
  return (
    <Box aria-hidden sx={{ position: 'relative', height: 0 }}>
      <Box
        data-drop-marker
        sx={{ position: 'absolute', left: `${56 + props.indent * INDENT_PX}px`, right: 8, top: -1, height: 3, borderRadius: 2, bgcolor: 'primary.main' }}
      />
    </Box>
  );
};

/**
 * A command list: every command of one list as a row that reads like a sentence, blocks that fold, rows that unfold
 * into their inputs, commands found by typing, and rows moved by dragging or by copying and pasting, alone or
 * several at once. Every change is one named step in the list's history.
 *
 * The keys: arrows move (Shift extends the selection), Enter unfolds a row or adds at the end of a body, Escape
 * folds it back, Space folds a block, typing starts the search, Delete removes, Ctrl+C, X, V and D copy, cut, paste
 * and duplicate, Ctrl+A selects everything, Ctrl+Z and Ctrl+Y undo and redo.
 * @param {CommandListProps} props The list shown.
 * @returns {React.JSX.Element} The list.
 */
const CommandList = (props: CommandListProps) =>
{
  const { documentKey, path, histories, label } = props;
  const { hub, catalog, commandEditors, api, pluginHeaders, loadCommandResources } = useMapEditorServices();
  const playSound = useContext(SoundPlayerContext);

  // the plugin headers and the names the editors pick from are read once a list shows; the list redraws when the
  // headers land, by which time the catalog holds their commands and the names are in place.
  useEffect(() =>
  {
    loadCommandResources();
  }, [ loadCommandResources ]);
  const subscribeToHeaders = useCallback((listener: () => void) => pluginHeaders.subscribe(listener), [ pluginHeaders ]);
  useSyncExternalStore(subscribeToHeaders, () => pluginHeaders.library());
  const { names, usage } = useCommandListResources(api);
  const lookup = useMemo(() => nameLookup(names), [ names ]);
  const pathKey = path.join('/');
  const historyKey = histories.join('|');
  // the path and histories arrive as fresh arrays each render; their joined forms say when they really change.
  const editor = useMemo(
    () => new CommandListEditor(hub, catalog, { documentKey, path, histories }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ hub, catalog, documentKey, pathKey, historyKey ],
  );
  // redraw on every change to the document; the editor's tree follows its revision.
  useDocumentRevision(hub, documentKey);

  const [ toggled, setToggled ] = useState<ReadonlySet<RmmzEventCommand>>(() => new Set());
  const [ selected, setSelected ] = useState<readonly RmmzEventCommand[]>([]);
  const [ anchor, setAnchor ] = useState<RmmzEventCommand | null>(null);
  const [ focus, setFocus ] = useState<RmmzEventCommand | null>(null);
  const [ open, setOpen ] = useState<RmmzEventCommand | null>(null);
  const [ search, setSearch ] = useState<SearchState | null>(null);
  const [ drag, setDrag ] = useState<DragState | null>(null);
  const [ menu, setMenu ] = useState<MenuState | null>(null);
  const [ notice, setNotice ] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowElements = useRef(new Map<number, HTMLElement>());

  // the document's list is live and changes in place, so what is read off it follows the tree, which the editor
  // rebuilds at every revision of the document.
  const list = editor.commands();
  const tree = editor.tree();
  const indexOf = indexCommands(list);
  const rows = useMemo(
    () => buildListRows(tree, index => startsFolded(list[index]) !== toggled.has(list[index])),
    [ tree, list, toggled ],
  );

  const selection = selectionOf(selected, anchor, indexOf);
  const nodeAt = (start: number) => editor.nodeAt(start);
  const chosen = selectedNodes(selection, nodeAt);
  const focusPosition = rowPositionOf(rows, list, focus);
  const focusedRow = rows[focusPosition] ?? null;
  const endOfList: InsertionPoint = { body: tree.root, position: tree.root.nodes.length };
  const [ primaryHistory ] = histories;
  const searchPlace = searchPlaceOf(rows, list, search);
  const marker = markerOf(drag);

  //region actions

  /**
   * Runs an action, showing what went wrong instead of losing it; each action clears the last notice first.
   * @param {() => void} action The action.
   */
  const run = (action: () => void) =>
  {
    setNotice(null);
    try
    {
      action();
    }
    catch (error)
    {
      setNotice((error as Error).message);
    }
  };

  /**
   * Selects units by their first commands, the first one focused and anchoring a Shift range.
   * @param {readonly RmmzEventCommand[]} heads The units' first commands.
   */
  const selectHeads = (heads: readonly RmmzEventCommand[]) =>
  {
    setSelected(heads);
    setAnchor(heads[0] ?? null);
    setFocus(heads[0] ?? null);
  };

  /**
   * Selects the units an operation just put somewhere.
   * @param {number} index Where the first starts.
   * @param {number} count How many.
   */
  const selectUnitsAt = (index: number, count: number) =>
  {
    const current = editor.commands();
    selectHeads(editor.unitsFrom(index, count).map(node => current[node.start]));
  };

  /**
   * Keeps the row at an index selected, focused and open after its command was replaced by an edit.
   * @param {number} index The row's command.
   */
  const keepOpenAt = (index: number) =>
  {
    const head = editor.commands()[index];
    if (head !== undefined)
    {
      selectHeads([ head ]);
      setOpen(head);
    }
  };

  /**
   * Takes a selection in index form.
   * @param {ListSelection} next The selection.
   */
  const applySelection = (next: ListSelection) =>
  {
    setSelected(next.selected.map(index => list[index]));
    setAnchor(next.anchor === null ? null : list[next.anchor]);
  };

  /**
   * Folds or unfolds a row's block.
   * @param {ListRow} row The row.
   */
  const toggleFold = (row: ListRow) =>
  {
    const head = list[row.index];
    setToggled(current =>
    {
      const next = new Set(current);
      if (next.has(head))
      {
        next.delete(head);
      }
      else
      {
        next.add(head);
      }

      return next;
    });
  };

  /**
   * Finds where a paste or a new command goes: at the focused row, the way MZ inserts above the selected line,
   * or at the list's end.
   * @returns {InsertionPoint} The place.
   */
  const insertionAtFocus = (): InsertionPoint =>
  {
    if (focusedRow === null)
    {
      return endOfList;
    }

    return pointAtRow(focusedRow) ?? pointBelowRow(focusedRow) ?? endOfList;
  };

  /**
   * Opens the search at a row.
   * @param {ListRow} row The row it adds at.
   * @param {string} query What is already typed.
   */
  const openSearch = (row: ListRow, query: string) =>
  {
    setMenu(null);
    setSearch({ at: list[row.index], query });
  };

  /**
   * Closes the search and gives the keys back to the list.
   */
  const closeSearch = () =>
  {
    setSearch(null);
    containerRef.current?.focus();
  };

  /**
   * Adds the command picked in the search and unfolds it, so its inputs are ready.
   * @param {CommandCatalogEntry} entry The command.
   */
  const pick = (entry: CommandCatalogEntry) => run(() =>
  {
    const point = searchPlace?.point ?? endOfList;
    setSearch(null);
    const { index } = editor.insertNew(entry, point);
    keepOpenAt(index);
    containerRef.current?.focus();
  });

  /**
   * Deletes the selected units.
   */
  const deleteSelection = () => run(() =>
  {
    if (chosen.length === 0)
    {
      return;
    }

    const { index } = editor.remove(chosen);
    setSelected([]);
    setOpen(null);
    setFocus(editor.commands()[index] ?? null);
  });

  /**
   * Duplicates the selected units and selects the copies.
   */
  const duplicateSelection = () => run(() =>
  {
    if (chosen.length === 0)
    {
      return;
    }

    const { index } = editor.duplicate(chosen);
    selectUnitsAt(index, outermostNodes(chosen).length);
  });

  /**
   * Pastes clipboard text at the focused row, selecting what landed, or says why nothing did.
   * @param {string} text The clipboard text.
   */
  const pasteText = (text: string) => run(() =>
  {
    const result = editor.paste(insertionAtFocus(), text);
    if (result.ok)
    {
      selectUnitsAt(result.index, result.count);
      return;
    }

    setNotice(result.reason === 'broken'
      ? 'The clipboard holds commands that do not read as whole commands, so nothing was pasted.'
      : 'The clipboard holds no commands to paste.');
  });

  /**
   * Undoes the list's newest step, saying so when a later edit blocks it.
   */
  const undo = () => run(() =>
  {
    const result = hub.undo(primaryHistory);
    if (result.ok === false && result.reason === 'conflict')
    {
      setNotice(`"${result.step.label}" cannot be undone: a later edit changed the same commands.`);
    }
  });

  /**
   * Redoes the list's most recently undone step, saying so when a later edit blocks it.
   */
  const redo = () => run(() =>
  {
    const result = hub.redo(primaryHistory);
    if (result.ok === false && result.reason === 'conflict')
    {
      setNotice(`"${result.step.label}" cannot be redone: a later edit changed the same commands.`);
    }
  });

  //endregion actions

  //region keys

  /**
   * Moves the focus to a row, selecting its unit (or extending the selection to it).
   * @param {number} position The row.
   * @param {boolean} extend Whether to extend the selection from its anchor.
   */
  const focusRowAt = (position: number, extend: boolean) =>
  {
    const row = rows[position];
    if (row === undefined)
    {
      return;
    }

    setFocus(list[row.index]);
    rowElements.current.get(position)?.scrollIntoView?.({ block: 'nearest' });
    const node = nodeOfRow(row);
    if (node !== null)
    {
      applySelection(clickSelection(selection, node, { shift: extend, toggle: false }, nodeAt));
    }
  };

  /**
   * Finds the row an arrow key moves to.
   * @param {number} delta One down, or one up.
   * @returns {number} The row.
   */
  const nextPosition = (delta: number): number =>
  {
    if (focusPosition < 0)
    {
      return delta > 0 ? 0 : rows.length - 1;
    }

    return Math.min(Math.max(focusPosition + delta, 0), rows.length - 1);
  };

  /**
   * Does what Enter does on the focused row: unfolds a command, adds at a body's end, folds a branch.
   */
  const activateFocused = () =>
  {
    if (focusedRow === null)
    {
      return;
    }

    if (focusedRow.kind === 'terminator')
    {
      openSearch(focusedRow, '');
      return;
    }

    if (focusedRow.kind === 'line' || focusedRow.kind === 'opener')
    {
      const head = list[focusedRow.index];
      setOpen(current => (current === head ? null : head));
      return;
    }

    if (focusedRow.foldable)
    {
      toggleFold(focusedRow);
    }
  };

  /**
   * Backs out one level: a drag, then an open editor, then the selection.
   */
  const escape = () =>
  {
    if (drag !== null)
    {
      setDrag(null);
      return;
    }

    if (open !== null)
    {
      setOpen(null);
      return;
    }

    setSelected([]);
    setAnchor(null);
  };

  /**
   * Handles the keys that move around the list.
   * @param {React.KeyboardEvent} event The key.
   * @returns {boolean} True when handled.
   */
  const handleNavigationKey = (event: React.KeyboardEvent): boolean =>
  {
    const moves: Record<string, () => number> = {
      ArrowDown: () => nextPosition(1),
      ArrowUp: () => nextPosition(-1),
      Home: () => 0,
      End: () => rows.length - 1,
    };
    const move = moves[event.key];
    if (move !== undefined)
    {
      focusRowAt(move(), event.shiftKey);
      return true;
    }

    if (event.key === 'Enter')
    {
      activateFocused();
      return true;
    }

    if (event.key === 'Escape')
    {
      escape();
      return true;
    }

    if (event.key === ' ' && focusedRow !== null && focusedRow.foldable)
    {
      toggleFold(focusedRow);
      return true;
    }

    return false;
  };

  /**
   * Handles the keys that change the list.
   * @param {React.KeyboardEvent} event The key.
   * @returns {boolean} True when handled.
   */
  const handleEditKey = (event: React.KeyboardEvent): boolean =>
  {
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Delete' || event.key === 'Backspace')
    {
      deleteSelection();
      return true;
    }

    if (command && key === 'd')
    {
      duplicateSelection();
      return true;
    }

    if (command && key === 'a')
    {
      selectHeads(tree.root.nodes.map(node => list[node.start]));
      return true;
    }

    if (command && key === 'z')
    {
      if (event.shiftKey)
      {
        redo();
      }
      else
      {
        undo();
      }

      return true;
    }

    if (command && key === 'y')
    {
      redo();
      return true;
    }

    return false;
  };

  /**
   * Starts the search with a typed character, at the focused row.
   * @param {React.KeyboardEvent} event The key.
   * @returns {boolean} True when handled.
   */
  const handleTypeToSearch = (event: React.KeyboardEvent): boolean =>
  {
    if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey)
    {
      return false;
    }

    const row = focusedRow ?? rows[rows.length - 1];
    if (row === undefined)
    {
      return false;
    }

    openSearch(row, event.key);
    return true;
  };

  /**
   * Routes a key pressed in the list, leaving text boxes, the open editor and the search their own keys.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (isInsideEditor(event.target))
    {
      return;
    }

    if (handleNavigationKey(event) || handleEditKey(event) || handleTypeToSearch(event))
    {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  //endregion keys

  //region clipboard

  /**
   * Copies the selection to the system clipboard as marked JSON, when the list has the keys.
   * @param {React.ClipboardEvent} event The copy.
   * @returns {boolean} True when something was copied.
   */
  const copyTo = (event: React.ClipboardEvent): boolean =>
  {
    if (isInsideEditor(event.target) || chosen.length === 0)
    {
      return false;
    }

    event.clipboardData.setData('text/plain', editor.copy(chosen));
    event.preventDefault();
    return true;
  };

  /**
   * Pastes commands from the system clipboard, when the list has the keys.
   * @param {React.ClipboardEvent} event The paste.
   */
  const onPaste = (event: React.ClipboardEvent) =>
  {
    if (isInsideEditor(event.target))
    {
      return;
    }

    event.preventDefault();
    pasteText(event.clipboardData.getData('text/plain'));
  };

  /**
   * Runs a context menu choice that needs the system clipboard, which a page reaches asynchronously.
   * @param {(clipboard: Clipboard) => Promise<void>} use What to do with it.
   */
  const withClipboard = (use: (clipboard: Clipboard) => Promise<void>) =>
  {
    setMenu(null);
    if (navigator.clipboard === undefined)
    {
      setNotice('This window cannot reach the clipboard from a menu; use Ctrl+C, Ctrl+X and Ctrl+V instead.');
      return;
    }

    use(navigator.clipboard).catch((error: unknown) => setNotice(`The clipboard refused: ${(error as Error).message}`));
  };

  //endregion clipboard

  //region pointer

  /**
   * Finds the row under the pointer, and which half of it: above the first row counts as its top, below the last as
   * its bottom.
   * @param {number} y The pointer's height on the page.
   * @returns {{ position: number, upperHalf: boolean } | null} The row, or null when there are none.
   */
  const rowAtPointer = (y: number): { position: number; upperHalf: boolean } | null =>
  {
    const measured = [ ...rowElements.current.entries() ]
      .map(([ position, element ]) => ({ position, rect: element.getBoundingClientRect() }))
      .sort((left, right) => left.position - right.position);
    if (measured.length === 0)
    {
      return null;
    }

    const hit = measured.find(({ rect }) => y >= rect.top && y < rect.bottom);
    if (hit !== undefined)
    {
      return { position: hit.position, upperHalf: y < hit.rect.top + hit.rect.height / 2 };
    }

    const [ first ] = measured;
    return y < first.rect.top
      ? { position: first.position, upperHalf: true }
      : { position: measured[measured.length - 1].position, upperHalf: false };
  };

  /**
   * Finds the units a drag carries, as they stand now.
   * @param {DragState} state The drag.
   * @returns {CommandNode[]} The units.
   */
  const dragNodes = (state: DragState): CommandNode[] =>
  {
    return state.heads
      .map(head => indexOf.get(head))
      .filter((index): index is number => index !== undefined)
      .map(nodeAt)
      .filter((node): node is CommandNode => node !== null);
  };

  /**
   * Starts a possible drag from a row's handle: the whole selection when the row is in it, the row's unit otherwise.
   * @param {ListRow} row The row.
   * @param {React.PointerEvent} event The press.
   */
  const onHandlePointerDown = (row: ListRow, event: React.PointerEvent) =>
  {
    const node = nodeOfRow(row);
    if (event.button !== 0 || node === null)
    {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const inSelection = chosen.some(each => each.start === node.start);
    const heads = inSelection
      ? chosen.map(each => list[each.start])
      : [ list[node.start] ];
    setDrag({ heads, originY: event.clientY, active: false, target: null });
  };

  /**
   * Follows a drag, marking where it would land.
   * @param {React.PointerEvent} event The move.
   */
  const onHandlePointerMove = (event: React.PointerEvent) =>
  {
    if (drag === null || (drag.active === false && Math.abs(event.clientY - drag.originY) < DRAG_THRESHOLD_PX))
    {
      return;
    }

    const hit = rowAtPointer(event.clientY);
    const target = hit === null
      ? null
      : dropTargetAt(tree, rows, hit.position, hit.upperHalf, dragNodes(drag));
    setDrag({ ...drag, active: true, target });
  };

  /**
   * Finishes a drag, moving the units where the marker was.
   * @param {React.PointerEvent} event The release.
   */
  const onHandlePointerUp = (event: React.PointerEvent) =>
  {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const finished = drag;
    setDrag(null);
    if (finished === null || finished.active === false || finished.target === null)
    {
      return;
    }

    const nodes = dragNodes(finished);
    const { point } = finished.target;
    run(() =>
    {
      const { index } = editor.move(nodes, point);
      selectUnitsAt(index, outermostNodes(nodes).length);
    });
  };

  //endregion pointer

  //region rows

  /**
   * Selects a clicked row and, for a plain click on a command, unfolds or folds its editor. A body's end row opens
   * the search there.
   * @param {ListRow} row The row.
   * @param {React.MouseEvent} event The click.
   */
  const onRowClick = (row: ListRow, event: React.MouseEvent) =>
  {
    containerRef.current?.focus();
    setFocus(list[row.index]);
    if (row.kind === 'terminator')
    {
      openSearch(row, '');
      return;
    }

    const node = nodeOfRow(row);
    if (node === null)
    {
      return;
    }

    const modifiers = { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey };
    applySelection(clickSelection(selection, node, modifiers, nodeAt));
    if (modifiers.shift === false && modifiers.toggle === false && (row.kind === 'line' || row.kind === 'opener'))
    {
      const head = list[row.index];
      setOpen(current => (current === head ? null : head));
    }
  };

  /**
   * Opens the context menu on a row, selecting it first unless it is already selected.
   * @param {ListRow} row The row.
   * @param {React.MouseEvent} event The right click.
   */
  const onRowContextMenu = (row: ListRow, event: React.MouseEvent) =>
  {
    event.preventDefault();
    setFocus(list[row.index]);
    const node = nodeOfRow(row);
    if (node !== null && chosen.some(each => each.start === node.start) === false)
    {
      applySelection({ selected: [ node.start ], anchor: node.start });
    }

    setMenu({ x: event.clientX, y: event.clientY, row });
  };

  /**
   * Reports whether a row belongs to a selected unit, however deep inside it.
   * @param {ListRow} row The row.
   * @returns {boolean} True when it is part of the selection.
   */
  const isRowSelected = (row: ListRow): boolean =>
  {
    return chosen.some(node => (row.node === node && row.kind !== 'terminator') || isBodyInside(row.body, node));
  };

  /**
   * Builds the editor an open row unfolds into, with its block for the editors that change a block's shape, and
   * the else of a conditional branch.
   * @param {ListRow} row The row.
   * @returns {React.JSX.Element} The editor.
   */
  const renderEditor = (row: ListRow) =>
  {
    const { index } = row;
    const draft = editor.draftAt(index);
    const { code } = draft.command;
    const span = code === 102 || code === 111
      ? editor.blockSpanAt(index)
      : null;
    // a block editor may reshape the whole run (a merged Show Choices can gain or lose a command), so the row
    // opened from anywhere in it stays open on the run's first command, which every shape still starts with.
    const block = span === null
      ? undefined
      : {
        commands: list.slice(span.start, span.end),
        onChange: (commands: readonly RmmzEventCommand[]) => run(() =>
        {
          editor.editBlock(span, commands);
          keepOpenAt(span.start);
        }),
      };
    const branch = row.node !== null && row.node.kind === 'block' && code === 111
      ? row.node
      : null;
    const elseBranch = branch === null
      ? null
      : { present: hasElseBranch(list, branch), set: (wanted: boolean) => run(() => editor.setElse(branch, wanted)) };

    return (
      <CommandRowEditor
        entry={editor.entryAt(index)}
        draft={draft}
        onChange={next => run(() =>
        {
          editor.edit(index, next);
          keepOpenAt(index);
        })}
        block={block}
        elseBranch={elseBranch}
        registry={commandEditors as CommandEditorRegistry}
        names={names}
        api={api}
        playSound={playSound}
      />
    );
  };

  /**
   * Draws one row: the drag marker and the search when they sit above it, its header, and its editor when open.
   * @param {ListRow} row The row.
   * @param {number} position Where it is among the rows.
   * @returns {React.JSX.Element} The row.
   */
  const renderRow = (row: ListRow, position: number) =>
  {
    const draft = editor.draftAt(row.index);
    const entry = editor.entryAt(row.index);
    const isOpen = open === list[row.index] && (row.kind === 'line' || row.kind === 'opener');
    return (
      <React.Fragment key={row.index}>
        {marker?.gap === position && <DropMarker indent={marker.indent}/>}
        {searchPlace?.row === row && (
          <Box sx={{ pl: `${56 + searchPlace.point.body.indent * INDENT_PX}px`, pr: 1 }}>
            <CommandSearch catalog={catalog} usage={usage} initialQuery={search?.query ?? ''} onPick={pick} onClose={closeSearch}/>
          </Box>
        )}
        <Box
          role={'listitem'}
          ref={(element: HTMLDivElement | null) =>
          {
            if (element === null)
            {
              rowElements.current.delete(position);
            }
            else
            {
              rowElements.current.set(position, element);
            }
          }}
        >
          <CommandRow
            row={row}
            list={list}
            entry={entry}
            draft={draft}
            sentence={sentenceOf(entry, draft.command, draft.continuation, lookup)}
            selected={isRowSelected(row)}
            focused={position === focusPosition}
            open={isOpen}
            api={api}
            playSound={playSound}
            onClick={event => onRowClick(row, event)}
            onContextMenu={event => onRowContextMenu(row, event)}
            onToggleFold={() => toggleFold(row)}
            onHandlePointerDown={event => onHandlePointerDown(row, event)}
            onHandlePointerMove={onHandlePointerMove}
            onHandlePointerUp={onHandlePointerUp}
          />
          {isOpen && (
            <Box
              data-command-editor
              sx={{ ml: `${56 + row.indent * INDENT_PX}px`, mr: 1, mt: 0.5, mb: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}
            >
              {renderEditor(row)}
            </Box>
          )}
        </Box>
      </React.Fragment>
    );
  };

  /**
   * Finds the conditional branch the context menu's row belongs to, for its else choice.
   * @returns {CommandBlockNode | null} The branch, or null when the row is no conditional branch's.
   */
  const menuBranchOf = (): CommandBlockNode | null =>
  {
    const node = menu?.row.node ?? null;
    return node !== null && node.kind === 'block' && list[node.start].code === 111
      ? node
      : null;
  };

  /**
   * Closes the menu, then runs a choice.
   * @param {() => void} choice The choice.
   * @returns {() => void} The menu item's handler.
   */
  const fromMenu = (choice: () => void) => () =>
  {
    setMenu(null);
    choice();
  };

  //endregion rows

  const menuBranch = menuBranchOf();

  return (
    <Box
      ref={containerRef}
      tabIndex={0}
      role={'list'}
      aria-label={label ?? 'Commands'}
      onKeyDown={onKeyDown}
      onCopy={copyTo}
      onCut={event =>
      {
        if (copyTo(event))
        {
          deleteSelection();
        }
      }}
      onPaste={onPaste}
      sx={{ outline: 'none', py: 0.5, userSelect: drag !== null && drag.active ? 'none' : undefined }}
    >
      {notice !== null && (
        <Alert severity={'warning'} onClose={() => setNotice(null)} sx={{ mb: 1 }}>
          {notice}
        </Alert>
      )}
      {rows.map(renderRow)}
      {marker?.gap === rows.length && <DropMarker indent={marker.indent}/>}
      <CommandListMenu
        menu={menu}
        hasSelection={chosen.length > 0}
        hasElse={menuBranch === null ? null : hasElseBranch(list, menuBranch)}
        onClose={() => setMenu(null)}
        onAdd={fromMenu(() => menu !== null && openSearch(menu.row, ''))}
        onCopy={() => withClipboard(clipboard => clipboard.writeText(editor.copy(chosen)))}
        onCut={() => withClipboard(async clipboard =>
        {
          await clipboard.writeText(editor.copy(chosen));
          deleteSelection();
        })}
        onPaste={() => withClipboard(async clipboard => pasteText(await clipboard.readText()))}
        onDuplicate={fromMenu(duplicateSelection)}
        onDelete={fromMenu(deleteSelection)}
        onToggleElse={fromMenu(() => menuBranch !== null && run(() => editor.setElse(menuBranch, hasElseBranch(list, menuBranch) === false)))}
        onToggleFold={fromMenu(() => menu !== null && toggleFold(menu.row))}
      />
    </Box>
  );
};

export { CommandList };
export type { CommandListProps };

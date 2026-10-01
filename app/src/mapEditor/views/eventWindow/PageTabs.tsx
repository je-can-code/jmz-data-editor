import React, { useRef, useState } from 'react';
import { Box, Button, Divider, IconButton, Menu, MenuItem, Stack, Tab, Tabs, Tooltip } from '@mui/material';
import { Add, ChevronLeft, ChevronRight, ContentCopy, ContentPaste, DeleteOutline, LayersClear } from '@mui/icons-material';
import { nameLookup, type DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import type { EventWindowTarget, PageOutcome } from '../../core/eventWindow/eventWindowTarget.ts';
import {
  addPage,
  clearPage,
  copyPages,
  decodePageClipboard,
  deletePage,
  duplicatePage,
  encodePageClipboard,
  movePage,
  PAGE_CLIPBOARD_MARKER,
  pastePages,
} from '../../core/eventWindow/pageOperations.ts';
import { describePageTab } from '../../core/eventWindow/pageSummaries.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

/**
 * What the page tabs take: the event, the page shown, the project's names for each tab's summary, and where a change,
 * a choice of page or a message goes.
 */
type PageTabsProps = {
  readonly target: EventWindowTarget;
  readonly event: RmmzMapEvent;
  readonly page: number;
  readonly names: DatabaseNamesJson | null;
  readonly onSelect: (page: number) => void;
  readonly onOutcome: (outcome: PageOutcome) => void;
  readonly onNotice: (message: string) => void;
};

/**
 * The open right-click menu: where, and for which page.
 */
type TabMenu = {
  readonly x: number;
  readonly y: number;
  readonly page: number;
};

/**
 * What the author reads when a paste finds no copied page on the clipboard.
 */
const NO_COPIED_PAGE = 'The clipboard holds no copied page.';

/**
 * The tabs of an event's pages, with what can be done to them: a new page, copy, cut, paste, duplicate, delete, clear
 * and a move left or right, from the buttons, a tab's right-click menu, or the keys while the tabs have focus (Ctrl+C,
 * X, V and D, and Delete). A tab dragged onto another moves its page there. New and pasted pages land after the page
 * shown. Copied pages go on the system clipboard, so they paste into any event, in any window.
 * @param {PageTabsProps} props The event, the page shown, and where changes go.
 * @returns {React.JSX.Element} The tabs.
 */
const PageTabs = (props: PageTabsProps) =>
{
  const { target, event, page, names, onSelect, onOutcome, onNotice } = props;
  const { hub, shell } = useMapEditorServices();
  const [ menu, setMenu ] = useState<TabMenu | null>(null);
  const [ dropAt, setDropAt ] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const lookup = nameLookup(names);
  const last = event.pages.length - 1;

  /**
   * Runs a page change, telling an unexpected failure rather than losing it.
   * @param {() => PageOutcome} change The change.
   */
  const run = (change: () => PageOutcome) =>
  {
    setMenu(null);
    try
    {
      onOutcome(change());
    }
    catch (error)
    {
      onNotice((error as Error).message);
    }
  };

  /**
   * Writes one page as clipboard text.
   * @param {number} index The page.
   * @returns {string | null} The text, or null when the page has gone.
   */
  const clipboardText = (index: number): string | null =>
  {
    const clipboard = copyPages(event, [ index ]);
    return clipboard === null
      ? null
      : encodePageClipboard(clipboard);
  };

  /**
   * Pastes clipboard text after the page shown, telling the author when it holds no copied page.
   * @param {string} text The clipboard's text.
   */
  const pasteText = (text: string) =>
  {
    const clipboard = decodePageClipboard(text);
    if (clipboard === null)
    {
      onNotice(NO_COPIED_PAGE);
      return;
    }

    run(() => pastePages(hub, target, page, clipboard));
  };

  /**
   * Copies a page from a button or the menu, which have no clipboard event to write through.
   * @param {number} index The page.
   * @param {boolean} cut True to take the page off once it is on the clipboard.
   */
  const copyFromMenu = (index: number, cut: boolean) =>
  {
    setMenu(null);
    const text = clipboardText(index);
    if (text === null)
    {
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() =>
      {
        if (cut)
        {
          run(() => deletePage(hub, target, index, 'Cut'));
        }
      })
      .catch((error: unknown) => onNotice(`The clipboard refused: ${(error as Error).message}`));
  };

  /**
   * Pastes from a button or the menu: the window shell reads the page clipboard, through the NW.js shell where a page's
   * own read would wait forever.
   */
  const pasteFromMenu = () =>
  {
    setMenu(null);
    shell.readClipboard(PAGE_CLIPBOARD_MARKER)
      .then(text =>
      {
        if (text === null)
        {
          onNotice('The clipboard could not be read here; press Ctrl+V on the tabs to paste instead.');
          return;
        }

        pasteText(text);
      })
      .catch(() => undefined);
  };

  /**
   * Copies the page shown on Ctrl+C or Ctrl+X while the tabs have focus.
   * @param {React.ClipboardEvent} clipboardEvent The copy or cut.
   * @param {boolean} cut True for a cut.
   */
  const onCopy = (clipboardEvent: React.ClipboardEvent, cut: boolean) =>
  {
    const text = clipboardText(page);
    if (text === null)
    {
      return;
    }

    clipboardEvent.clipboardData.setData('text/plain', text);
    clipboardEvent.preventDefault();
    if (cut)
    {
      run(() => deletePage(hub, target, page, 'Cut'));
    }
  };

  /**
   * Handles Delete and Ctrl+D while the tabs have focus.
   * @param {React.KeyboardEvent} keyEvent The key.
   */
  const onKeyDown = (keyEvent: React.KeyboardEvent) =>
  {
    const command = keyEvent.ctrlKey || keyEvent.metaKey;
    if (keyEvent.key === 'Delete' && command === false)
    {
      keyEvent.preventDefault();
      run(() => deletePage(hub, target, page));
      return;
    }

    if (command && keyEvent.key.toLowerCase() === 'd')
    {
      keyEvent.preventDefault();
      run(() => duplicatePage(hub, target, page));
    }
  };

  /**
   * Ends a drag, whether or not it dropped anywhere.
   */
  const endDrag = () =>
  {
    dragFrom.current = null;
    setDropAt(null);
  };

  /**
   * Moves the dragged page onto the tab it was dropped on.
   * @param {number} index The tab dropped on.
   */
  const dropOn = (index: number) =>
  {
    const from = dragFrom.current;
    endDrag();
    if (from !== null && from !== index)
    {
      run(() => movePage(hub, target, from, index));
    }
  };

  const menuPage = menu?.page ?? page;
  return (
    <Stack
      direction={'row'}
      alignItems={'center'}
      spacing={1}
      sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 48 }}
      onCopy={clipboardEvent => onCopy(clipboardEvent, false)}
      onCut={clipboardEvent => onCopy(clipboardEvent, true)}
      onPaste={clipboardEvent =>
      {
        clipboardEvent.preventDefault();
        pasteText(clipboardEvent.clipboardData.getData('text/plain'));
      }}
      onKeyDown={onKeyDown}
    >
      <Tabs
        value={page}
        onChange={(_change, next: number) => onSelect(next)}
        variant={'scrollable'}
        scrollButtons={'auto'}
        aria-label={'Pages'}
        sx={{ flex: 1, minWidth: 0 }}
      >
        {event.pages.map((each, index) => (
          <Tab
            key={index}
            value={index}
            label={(
              <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{describePageTab(each, lookup).join('\n')}</Box>}>
                <span>{index + 1}</span>
              </Tooltip>
            )}
            aria-label={`Page ${index + 1}`}
            draggable
            onDragStart={dragEvent =>
            {
              dragFrom.current = index;
              dragEvent.dataTransfer.effectAllowed = 'move';
              dragEvent.dataTransfer.setData('text/plain', `Page ${index + 1}`);
            }}
            onDragOver={dragEvent =>
            {
              if (dragFrom.current !== null)
              {
                dragEvent.preventDefault();
                setDropAt(index);
              }
            }}
            onDragLeave={() => setDropAt(current => (current === index ? null : current))}
            onDrop={dragEvent =>
            {
              dragEvent.preventDefault();
              dropOn(index);
            }}
            onDragEnd={endDrag}
            onContextMenu={menuEvent =>
            {
              menuEvent.preventDefault();
              onSelect(index);
              setMenu({ x: menuEvent.clientX, y: menuEvent.clientY, page: index });
            }}
            sx={{ minWidth: 48, outline: dropAt === index && dragFrom.current !== index ? '2px dashed' : 'none', outlineOffset: -4 }}
          />
        ))}
      </Tabs>
      <Button size={'small'} startIcon={<Add/>} onClick={() => run(() => addPage(hub, target, page))}>New</Button>
      <Button size={'small'} startIcon={<ContentCopy/>} onClick={() => copyFromMenu(page, false)}>Copy</Button>
      <Button size={'small'} startIcon={<ContentPaste/>} onClick={pasteFromMenu}>Paste</Button>
      <Tooltip title={event.pages.length === 1 ? 'An event keeps at least one page' : 'Delete this page (Delete)'}>
        <span>
          <Button size={'small'} startIcon={<DeleteOutline/>} disabled={event.pages.length === 1} onClick={() => run(() => deletePage(hub, target, page))}>
            Delete
          </Button>
        </span>
      </Tooltip>
      <Button size={'small'} startIcon={<LayersClear/>} onClick={() => run(() => clearPage(hub, target, page))}>Clear</Button>
      <Tooltip title={'Move this page left'}>
        <span>
          <IconButton size={'small'} aria-label={'Move this page left'} disabled={page === 0} onClick={() => run(() => movePage(hub, target, page, page - 1))}>
            <ChevronLeft/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Move this page right'}>
        <span>
          <IconButton size={'small'} aria-label={'Move this page right'} disabled={page === last} onClick={() => run(() => movePage(hub, target, page, page + 1))}>
            <ChevronRight/>
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference={'anchorPosition'}
        anchorPosition={menu === null ? undefined : { top: menu.y, left: menu.x }}
      >
        <MenuItem onClick={() => run(() => addPage(hub, target, menuPage))}>New page after</MenuItem>
        <Divider/>
        <MenuItem onClick={() => copyFromMenu(menuPage, false)}>Copy</MenuItem>
        <MenuItem disabled={event.pages.length === 1} onClick={() => copyFromMenu(menuPage, true)}>Cut</MenuItem>
        <MenuItem onClick={pasteFromMenu}>Paste after</MenuItem>
        <MenuItem onClick={() => run(() => duplicatePage(hub, target, menuPage))}>Duplicate</MenuItem>
        <Divider/>
        <MenuItem disabled={event.pages.length === 1} onClick={() => run(() => deletePage(hub, target, menuPage))}>Delete</MenuItem>
        <MenuItem onClick={() => run(() => clearPage(hub, target, menuPage))}>Clear</MenuItem>
        <Divider/>
        <MenuItem disabled={menuPage === 0} onClick={() => run(() => movePage(hub, target, menuPage, menuPage - 1))}>Move left</MenuItem>
        <MenuItem disabled={menuPage === last} onClick={() => run(() => movePage(hub, target, menuPage, menuPage + 1))}>Move right</MenuItem>
      </Menu>
    </Stack>
  );
};

export { NO_COPIED_PAGE, PageTabs };

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { documentHistoryKey } from '../../../core/history/historyKeys.ts';
import { TILESETS_KEY } from '../../../core/model/documentKeys.ts';
import type { RmmzTileset } from '../../../core/model/rmmzTypes.ts';
import { brushForPick } from '../../../core/palette/paletteGeometry.ts';
import { isTabAvailable, layoutPaletteTab, PALETTE_TABS, type PaletteRect, type PaletteTab } from '../../../core/palette/paletteLayout.ts';
import { recallPalette, type PaletteMemory } from '../../../core/palette/paletteMemory.ts';
import type { PaletteEditing } from '../../../core/palette/paletteMode.ts';
import { describeHover, describePick, FLAG_MODE_WORDS, paletteHint } from '../../../core/palette/paletteWords.ts';
import {
  editTilesetFlags,
  FLAG_MODES,
  planFlagEdit,
  switchedOffShapesFor,
  type FlagClick,
  type FlagMode,
} from '../../../core/palette/passabilityEdits.ts';
import { TILESET_MARKS_DOCUMENT, toggleTileMark } from '../../../core/palette/tilesetMarkEdits.ts';
import { isAutotile } from '../../../core/tiles/tileIds.ts';
import { takeUpPenForPick } from '../../../core/tools/paintSelectionLink.ts';
import { useHeldMap, useTilesets, useWorkspace, useWorkspaceState } from '../../workspaceHooks.tsx';
import { AutotilePreview } from './AutotilePreview.tsx';
import { PaletteCanvas, type PaletteHover } from './PaletteCanvas.tsx';
import { usePaletteMode, useTilesetMarks, useTilesetSheets } from './paletteHooks.ts';
import { usePaintScope } from './paintScope.tsx';

/**
 * How long the pointer rests on an autotile before its painted patch shows, in milliseconds: long enough that sweeping
 * across the palette shows nothing, short enough to feel immediate once the pointer stops.
 */
const PREVIEW_DELAY_MS = 250;

/**
 * A line in place of the palette, while there is nothing to show.
 * @param {{ line: string }} props What to say.
 * @returns {React.JSX.Element} The message.
 */
const PaletteMessage = (props: { readonly line: string }) =>
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
 * The row under the palette's tabs: picking tiles or editing passability, the shadow pen on the regions tab, and while
 * editing, the flags to show and whether the tileset has unsaved edits.
 * @param {object} props The tab on show, the editor's mode and flags, whether the shadow pen is picked and the tileset
 * unsaved, and how to pick the shadow pen.
 * @returns {React.JSX.Element} The toolbar.
 */
const PaletteToolbar = (props: {
  readonly tab: PaletteTab;
  readonly flagMode: FlagMode;
  readonly editing: boolean;
  readonly shadowPicked: boolean;
  readonly unsaved: boolean;
  readonly onPickShadow: () => void;
}) =>
{
  const { tab, flagMode, editing, shadowPicked, unsaved, onPickShadow } = props;
  const { mode } = usePaintScope();
  return (
    <>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        <ToggleButtonGroup
          exclusive
          size={'small'}
          value={editing ? 'passability' : 'tiles'}
          onChange={(_event, value: PaletteEditing | null) =>
          {
            if (value !== null)
            {
              mode.setEditing(value);
            }
          }}
        >
          <ToggleButton value={'tiles'} sx={{ py: 0.25, px: 1 }}>Tiles</ToggleButton>
          <ToggleButton value={'passability'} sx={{ py: 0.25, px: 1 }}>Passability</ToggleButton>
        </ToggleButtonGroup>
        {tab === 'R' && editing === false && (
          <ToggleButton size={'small'} value={'shadow'} selected={shadowPicked} onChange={onPickShadow} sx={{ py: 0.25, px: 1 }}>
            Shadow pen
          </ToggleButton>
        )}
        {editing && unsaved && (
          <Tooltip title={'Ctrl+S saves the tileset along with everything else.'}>
            <Chip size={'small'} label={'Unsaved'} color={'warning'} variant={'outlined'}/>
          </Tooltip>
        )}
      </Stack>
      {editing && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pb: 0.5 }}>
          {FLAG_MODES.map(each => (
            <Chip
              key={each}
              size={'small'}
              label={FLAG_MODE_WORDS[each].label}
              color={flagMode === each ? 'primary' : 'default'}
              variant={flagMode === each ? 'filled' : 'outlined'}
              onClick={() => mode.setFlagMode(each)}
            />
          ))}
        </Box>
      )}
    </>
  );
};

/**
 * One tileset's palette: its tabs, the cells to pick from, the "goes on top" badges, and the passability editor. It
 * picks for its paint's window (see usePaintScope), and remembers each tileset's tab and pick there.
 * @param {{ tileset: RmmzTileset }} props The tileset, live from the tilesets document.
 * @returns {React.JSX.Element} The palette.
 */
const TilesetPalette = (props: { readonly tileset: RmmzTileset }) =>
{
  const { tileset } = props;
  const controller = useWorkspace();
  const { hub } = controller.services;
  const paint = usePaintScope();
  const names = tileset.tilesetNames;
  const sheets = useTilesetSheets(tileset);
  const mode = usePaletteMode();
  const marksState = useTilesetMarks(tileset.id);
  const [ memory, setMemory ] = useState<PaletteMemory>(() => recallPalette(paint.memories, tileset));
  const [ hover, setHover ] = useState<PaletteHover | null>(null);
  const [ preview, setPreview ] = useState<PaletteHover | null>(null);
  const layout = useMemo(() => layoutPaletteTab(memory.tab, names), [ memory.tab, names ]);
  const editing = mode.editing === 'passability';

  // what is picked becomes the window's brush, and is remembered for this tileset.
  useEffect(() =>
  {
    paint.memories.set(tileset.id, memory);
    paint.selection.setBrush(brushForPick(names, memory.pick, tileset.id));
  }, [ paint, memory, names, tileset.id ]);

  // the regions have no passability, so the editor shows a sheet's tiles instead.
  useEffect(() =>
  {
    if (editing && memory.tab === 'R')
    {
      const tab = PALETTE_TABS.find(each => each !== 'R' && isTabAvailable(each, names));
      if (tab !== undefined)
      {
        setMemory(current => ({ ...current, tab }));
      }
    }
  }, [ editing, memory.tab, names ]);

  // an autotile the pointer rests on shows its painted patch after a moment; anything else hides it at once.
  useEffect(() =>
  {
    setPreview(null);
    if (hover === null || editing || hover.onBadge || isAutotile(hover.id) === false)
    {
      return undefined;
    }

    const timer = setTimeout(() => setPreview(hover), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ hover, editing ]);

  /**
   * Picks a rectangle of cells on the tab on show, and takes up the pen if the events were in hand, since tiles are
   * picked to be painted.
   * @param {PaletteRect} rect The cells.
   */
  const pickCells = (rect: PaletteRect) =>
  {
    setMemory(current => ({ ...current, pick: { kind: 'cells', tab: current.tab, rect } }));
    takeUpPenForPick(paint.painting);
  };

  /**
   * Picks the shadow pen, taking up the pen to draw with it if the events were in hand.
   */
  const pickShadow = () =>
  {
    setMemory(current => ({ ...current, pick: { kind: 'shadow' } }));
    takeUpPenForPick(paint.painting);
  };

  /**
   * Toggles a tile's "goes on top" mark for this tileset, saving the marks at once so every window and every later
   * session paints with them.
   * @param {number} tileId The tile.
   */
  const toggleMark = (tileId: number) =>
  {
    if (marksState.document === null)
    {
      return;
    }

    try
    {
      const step = toggleTileMark(hub, tileset.id, tileId);
      if (step !== null)
      {
        hub.save(TILESET_MARKS_DOCUMENT).catch((error: unknown) =>
        {
          controller.notify(`The tile marks could not be saved: ${error instanceof Error ? error.message : String(error)}`, 'error');
        });
      }
    }
    catch (error)
    {
      controller.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  /**
   * Edits a tile's flags as the passability editor's click asks, as one undoable step in the tilesets' history, and
   * hands undo to that history so the next undo takes it back.
   * @param {number} tileId The tile.
   * @param {FlagClick} click The click.
   */
  const editFlags = (tileId: number, click: FlagClick) =>
  {
    try
    {
      const edit = planFlagEdit(tileset.flags, tileId, click, switchedOffShapesFor(tileset.id));
      const step = editTilesetFlags(hub, tileset.id, edit);
      if (step !== null)
      {
        controller.focusHistory(documentHistoryKey(TILESETS_KEY));
      }
    }
    catch (error)
    {
      controller.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const selection = memory.pick !== null && memory.pick.kind === 'cells' && memory.pick.tab === memory.tab
    ? memory.pick.rect
    : null;
  const marks = memory.tab === 'A' && editing === false
    ? marksState.marks
    : null;
  const passability = editing
    ? { flags: tileset.flags, mode: mode.flagMode }
    : null;
  const info = hover === null
    ? describePick(memory.pick, names)
    : describeHover(memory.tab, hover, marks);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.default' }} data-testid={'palette'}>
      <Tabs
        value={memory.tab}
        onChange={(_event, tab: PaletteTab) => setMemory(current => ({ ...current, tab }))}
        variant={'fullWidth'}
        sx={{ minHeight: 32, borderBottom: 1, borderColor: 'divider' }}
      >
        {PALETTE_TABS.map(tab => (
          <Tab
            key={tab}
            value={tab}
            label={tab}
            disabled={isTabAvailable(tab, names) === false || (editing && tab === 'R')}
            sx={{ minWidth: 0, minHeight: 32, py: 0.5 }}
          />
        ))}
      </Tabs>
      <PaletteToolbar
        tab={memory.tab}
        flagMode={mode.flagMode}
        editing={editing}
        shadowPicked={memory.pick?.kind === 'shadow'}
        unsaved={hub.has(TILESETS_KEY) && hub.isDirty(TILESETS_KEY)}
        onPickShadow={pickShadow}
      />
      {marksState.failure !== null && memory.tab === 'A' && (
        <Alert severity={'warning'} sx={{ mx: 1, mb: 0.5, py: 0 }}>
          {`The tiles that go on top could not be read: ${marksState.failure}`}
        </Alert>
      )}
      <PaletteCanvas
        layout={layout}
        sheets={sheets}
        selection={selection}
        marks={marks}
        passability={passability}
        onSelect={pickCells}
        onToggleMark={toggleMark}
        onFlagClick={editFlags}
        onHover={setHover}
      />
      <Box sx={{ px: 1, py: 0.5, borderTop: 1, borderColor: 'divider', minHeight: 40 }}>
        <Typography variant={'caption'} sx={{ display: 'block' }} noWrap title={info}>
          {info}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }}>
          {paletteHint(editing, mode.flagMode, marks !== null)}
        </Typography>
      </Box>
      {preview !== null && sheets !== null && (
        <AutotilePreview tileId={preview.id} anchor={preview.screen} sheets={sheets} mode={tileset.mode}/>
      )}
    </Box>
  );
};

/**
 * The tileset palette for one map: its tiles, sheet by sheet as MZ shows them, each autotile kind as one ready-made
 * tile, with a painted patch of it on hover. A drag picks a rectangle to paint with, the regions tab picks regions and
 * the shadow pen, and a tile's corner badge marks it to go on top of the ground, remembered per tileset. Switched to
 * passability, the same cells edit the tileset's flags instead, while its window's maps show their passability. It
 * picks for its paint's window (see usePaintScope): the workspace's own palette, or a torn-out map's.
 * @param {{ mapId: number | null }} props The map whose tiles to show, or null for none.
 * @returns {React.JSX.Element} The palette.
 */
const MapPalette = (props: { readonly mapId: number | null }) =>
{
  const { mapId } = props;
  const held = useHeldMap(mapId);
  const tilesets = useTilesets();
  const { mode } = usePaintScope();
  const { map } = held;

  // closing the palette closes its passability editor, so no map goes on showing passability for an editor nobody sees.
  useEffect(() => () => mode.setEditing('tiles'), [ mode ]);

  if (mapId === null || map === null)
  {
    return <PaletteMessage line={'Open a map to see its tiles here.'}/>;
  }

  const tileset = tilesets[map.tilesetId] ?? null;
  if (tileset === null)
  {
    return (
      <PaletteMessage
        line={tilesets.length === 0 ? 'Loading the tilesets…' : `This map draws with tileset ${map.tilesetId}, which the project does not have.`}
      />
    );
  }

  return <TilesetPalette key={tileset.id} tileset={tileset}/>;
};

/**
 * The workspace's own palette: the tiles of the map with focus in the main window, or the map picked alone in the tree,
 * picking for the main window's maps wherever the panel is shown. A torn-out map carries a palette of its own, so
 * focusing one leaves this one where it was.
 * @returns {React.JSX.Element} The panel.
 */
const PalettePanel = () =>
{
  const mapId = useWorkspaceState(state => state.paletteMapId);
  return <MapPalette mapId={mapId}/>;
};

export { MapPalette, PalettePanel };

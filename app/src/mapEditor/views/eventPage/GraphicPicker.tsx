import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import type { TextureImage } from '../../core/renderer/MapRenderer.ts';
import {
  DIRECTION_OPTIONS,
  eventImageMode,
  PATTERN_OPTIONS,
  sheetGrid,
  tileGridCell,
  TILE_SHEET_COLUMNS,
  TILE_SHEET_ROWS,
  TILE_SHEET_TABS,
  withCharacter,
  withDirection,
  withNoImage,
  withPattern,
  withTile,
  type EventImageMode,
  type TileSheetTab,
} from '../../core/eventPage/eventImage.ts';
import type { RmmzEventImage, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import { drawCharacterFrame } from '../../render/characterCanvas.ts';
import { projectImagesFor } from '../../render/projectImages.ts';
import { TileThumb } from '../../workspace/panels/palette/TileThumb.tsx';
import { useEditorEnvironment } from '../commandEditors/editorEnvironment.tsx';
import { EditorStack, FieldRow, NumberField, SelectField } from '../commandEditors/editorFields.tsx';

/**
 * How big the live preview and each picking cell draw, in CSS pixels.
 */
const PREVIEW_SIZE = 72;
const CHARACTER_CELL_SIZE = 56;
const TILE_CELL_SIZE = 28;

/**
 * Settles a load into state, unless the effect that started it has already been cleaned up.
 * @param {Promise<T> | undefined} pending The load, or undefined to do nothing.
 * @param {(value: T) => void} settle Stores what loaded.
 * @returns {() => void} Stops listening for it.
 */
const settleWhileCurrent = <T,>(pending: Promise<T> | undefined, settle: (value: T) => void): (() => void) =>
{
  let current = true;
  pending?.then(value =>
  {
    if (current)
    {
      settle(value);
    }
  }).catch(() => undefined);

  return () =>
  {
    current = false;
  };
};

/**
 * Lists the sheets in {@code img/characters}, for the sheet picker.
 * @returns {readonly string[] | null} The sheets, or null until listed or without a server that can list them.
 */
const useCharacterSheetNames = (): readonly string[] | null =>
{
  const { api } = useEditorEnvironment();
  const [ names, setNames ] = useState<readonly string[] | null>(null);
  useEffect(() => settleWhileCurrent(api?.listImages?.('characters'), setNames), [ api ]);
  return names;
};

/**
 * Loads one character sheet, through the window's shared image cache.
 * @param {string} characterName The sheet's name, or an empty string for none.
 * @returns {TextureImage | null} The sheet, or null while it is missing, loading or not asked for.
 */
const useCharacterSheetImage = (characterName: string): TextureImage | null =>
{
  const { api } = useEditorEnvironment();
  const [ loaded, setLoaded ] = useState<{ name: string; image: TextureImage | null } | null>(null);
  useEffect(() =>
  {
    if (api === null || characterName === '')
    {
      return undefined;
    }

    return settleWhileCurrent(projectImagesFor(api).image('characters', characterName), image => setLoaded({ name: characterName, image }));
  }, [ api, characterName ]);

  return loaded !== null && loaded.name === characterName
    ? loaded.image
    : null;
};

/**
 * Loads a tileset's nine sheets, through the window's shared image cache.
 * @param {RmmzTileset | null} tileset The tileset, or null for none.
 * @returns {readonly (TextureImage | null)[] | null} The sheets in RMMZ order, or null while they load.
 */
const useTilesetSheetImages = (tileset: RmmzTileset | null): readonly (TextureImage | null)[] | null =>
{
  const { api } = useEditorEnvironment();
  const [ loaded, setLoaded ] = useState<{ id: number; sheets: readonly (TextureImage | null)[] } | null>(null);
  useEffect(() =>
  {
    if (api === null || tileset === null)
    {
      return undefined;
    }

    return settleWhileCurrent(projectImagesFor(api).tilesetSheets(tileset), sheets => setLoaded({ id: tileset.id, sheets }));
  }, [ api, tileset ]);

  return loaded !== null && tileset !== null && loaded.id === tileset.id
    ? loaded.sheets
    : null;
};

/**
 * One still frame of a character sheet, drawn into its own canvas: the live preview when the page shows a
 * character, and each cell of the sheet browser showing the character that sits there.
 * @param {{ sheet: TextureImage | null, characterName: string, characterIndex: number, direction: number, pattern: number, size: number }} props
 * The loaded sheet, the cell to show, and how big to draw it in CSS pixels.
 * @returns {React.JSX.Element} The picture.
 */
const CharacterCell = (props: {
  sheet: TextureImage | null;
  characterName: string;
  characterIndex: number;
  direction: number;
  pattern: number;
  size: number;
}) =>
{
  const { sheet, characterName, characterIndex, direction, pattern, size } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    // drawn at the screen's pixel density, so a small picture stays sharp.
    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    drawCharacterFrame(context, sheet, { tileId: 0, characterName, characterIndex, direction, pattern }, 0, 0, canvas.width);
  }, [ sheet, characterName, characterIndex, direction, pattern, size ]);

  return (
    <Box component={'canvas'} ref={canvasRef}
      sx={{ width: size, height: size, flexShrink: 0, display: 'block', bgcolor: 'action.hover', borderRadius: 0.5 }}/>
  );
};

/**
 * Browses one character sheet: its cells, laid out the way {@link sheetGrid} says to, each picking that character
 * when clicked.
 * @param {{ characterName: string, sheet: TextureImage | null, selectedIndex: number, selected: boolean, onPick: (cellIndex: number) => void }} props
 * The sheet being browsed, its loaded image, which cell reads as selected, and what to do when one is picked.
 * @returns {React.JSX.Element} The grid.
 */
const CharacterSheetGrid = (props: {
  characterName: string;
  sheet: TextureImage | null;
  selectedIndex: number;
  selected: boolean;
  onPick: (cellIndex: number) => void;
}) =>
{
  const { characterName, sheet, selectedIndex, selected, onPick } = props;
  const grid = sheetGrid(characterName);
  const cells = grid.big ? 1 : grid.columns * grid.rows;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${grid.columns}, ${CHARACTER_CELL_SIZE}px)`, gap: 0.5 }}>
      {Array.from({ length: cells }, (_unused, cellIndex) => (
        <Box key={cellIndex} component={'button'} type={'button'} aria-label={`${characterName} ${cellIndex + 1}`}
          onClick={() => onPick(cellIndex)}
          sx={{
            p: 0,
            cursor: 'pointer',
            bgcolor: 'transparent',
            border: 2,
            borderRadius: 1,
            borderColor: selected && cellIndex === selectedIndex ? 'primary.main' : 'transparent',
          }}
        >
          {/* down, standing, is the pose MZ's own picker shows a character at rest with. */}
          <CharacterCell sheet={sheet} characterName={characterName} characterIndex={cellIndex} direction={2} pattern={1} size={CHARACTER_CELL_SIZE}/>
        </Box>
      ))}
    </Box>
  );
};

/**
 * Browses one of the tileset's B to E sheets: a tab per sheet, and the chosen one's full grid, each cell picking
 * that tile when clicked.
 * @param {{ tileset: RmmzTileset, sheets: readonly (TextureImage | null)[] | null, value: number, onPick: (tileId: number) => void }} props
 * The tileset, its loaded sheets, the tile reading as selected, and what to do when one is picked.
 * @returns {React.JSX.Element} The tabs and the grid.
 */
const TileSheetPicker = (props: {
  tileset: RmmzTileset;
  sheets: readonly (TextureImage | null)[] | null;
  value: number;
  onPick: (tileId: number) => void;
}) =>
{
  const { sheets, value, onPick } = props;
  const [ tab, setTab ] = useState<TileSheetTab>(() => TILE_SHEET_TABS.find(each => value >= each.base && value < each.base + 256) ?? TILE_SHEET_TABS[0]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FieldRow>
        {TILE_SHEET_TABS.map(candidate => (
          <Button key={candidate.label} size={'small'} variant={candidate.label === tab.label ? 'contained' : 'outlined'}
            onClick={() => setTab(candidate)}>
            {candidate.label}
          </Button>
        ))}
      </FieldRow>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${TILE_SHEET_COLUMNS}, ${TILE_CELL_SIZE}px)`, gap: '1px', maxHeight: 360, overflowY: 'auto' }}>
        {Array.from({ length: TILE_SHEET_COLUMNS * TILE_SHEET_ROWS }, (_unused, index) =>
        {
          const column = index % TILE_SHEET_COLUMNS;
          const row = Math.floor(index / TILE_SHEET_COLUMNS);
          const tileId = tileGridCell(tab, column, row);
          return (
            <Box key={tileId} component={'button'} type={'button'} aria-label={`Tile ${tileId}`} onClick={() => onPick(tileId)}
              sx={{ p: 0, cursor: 'pointer', bgcolor: 'transparent', border: 1, borderColor: tileId === value ? 'primary.main' : 'transparent' }}
            >
              <TileThumb sheets={sheets} tileId={tileId} size={TILE_CELL_SIZE}/>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * Draws the live preview above the picker: the way the engine would actually draw the page right now, never the
 * sheet or cell currently being browsed.
 * @param {{ mode: EventImageMode, value: RmmzEventImage, previewSheet: TextureImage | null, tilesetSheets: readonly (TextureImage | null)[] | null }} props
 * The current mode, the page's image, and the loaded sheets each mode draws from.
 * @returns {React.JSX.Element} The preview.
 */
const GraphicPreview = (props: {
  mode: EventImageMode;
  value: RmmzEventImage;
  previewSheet: TextureImage | null;
  tilesetSheets: readonly (TextureImage | null)[] | null;
}) =>
{
  const { mode, value, previewSheet, tilesetSheets } = props;
  if (mode === 'none')
  {
    return (
      <Box sx={{
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
      >
        <Typography variant={'caption'} color={'text.secondary'}>No image</Typography>
      </Box>
    );
  }

  if (mode === 'tile')
  {
    return <TileThumb sheets={tilesetSheets} tileId={value.tileId} size={PREVIEW_SIZE}/>;
  }

  return (
    <CharacterCell sheet={previewSheet} characterName={value.characterName} characterIndex={value.characterIndex}
      direction={value.direction} pattern={value.pattern} size={PREVIEW_SIZE}/>
  );
};

/**
 * Shows the tile half of the picker: the full B to E browser once the map's tileset is known, or a typed tile id
 * while it is not.
 * @param {{ tileset: RmmzTileset | null, sheets: readonly (TextureImage | null)[] | null, value: number, onPick: (tileId: number) => void }} props
 * The tileset, its loaded sheets, the tile reading as selected, and what to do when one is picked.
 * @returns {React.JSX.Element} The fallback field or the browser.
 */
const TilePanel = (props: {
  tileset: RmmzTileset | null;
  sheets: readonly (TextureImage | null)[] | null;
  value: number;
  onPick: (tileId: number) => void;
}) =>
{
  const { tileset, sheets, value, onPick } = props;
  if (tileset === null)
  {
    return <NumberField label={'Tile id'} value={value} min={0} onChange={onPick}/>;
  }

  return <TileSheetPicker tileset={tileset} sheets={sheets} value={value} onPick={onPick}/>;
};

/**
 * What the graphic picker takes: an event page's image, exactly as RMMZ stores it, and the current map's tileset
 * for the tile half of the picker.
 */
type GraphicPickerProps = {
  /**
   * The page's {@code tileId}, {@code characterName}, {@code direction}, {@code pattern} and {@code characterIndex}.
   */
  readonly value: RmmzEventImage;

  /**
   * Hands back the image after every change.
   */
  readonly onChange: (value: RmmzEventImage) => void;

  /**
   * The map's own tileset, for the tile half of the picker; null while it has not loaded, which falls back to a
   * typed tile id.
   */
  readonly tileset: RmmzTileset | null;
};

/**
 * Edits an event page's graphic: a character cut from a sheet in {@code img/characters} ({@code $} and {@code !}
 * sheets read the way RMMZ itself reads them), a tile cut from the map's own tileset (its B to E sheets), or no
 * image at all. The live preview above the picker always draws the way the engine draws the page right now, never
 * the sheet or cell being browsed, so it only changes once a pick is actually made.
 * @param {GraphicPickerProps} props The image, what to do with a change, and the map's tileset.
 * @returns {React.JSX.Element} The picker.
 */
const GraphicPicker = (props: GraphicPickerProps) =>
{
  const { value, onChange, tileset } = props;
  const mode = eventImageMode(value);
  const [ panel, setPanel ] = useState<EventImageMode>(mode);
  const [ browsingSheet, setBrowsingSheet ] = useState(value.characterName);

  const sheetNames = useCharacterSheetNames();
  const previewSheet = useCharacterSheetImage(value.characterName);
  const browsingSheetImage = useCharacterSheetImage(browsingSheet);
  const tilesetSheets = useTilesetSheetImages(tileset);

  return (
    <EditorStack>
      <FieldRow>
        <GraphicPreview mode={mode} value={value} previewSheet={previewSheet} tilesetSheets={tilesetSheets}/>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Button size={'small'} variant={panel === 'none' ? 'contained' : 'outlined'}
            onClick={() =>
            {
              setPanel('none');
              onChange(withNoImage(value));
            }}
          >
            No image
          </Button>
          <Button size={'small'} variant={panel === 'character' ? 'contained' : 'outlined'} onClick={() => setPanel('character')}>
            Character
          </Button>
          <Button size={'small'} variant={panel === 'tile' ? 'contained' : 'outlined'} onClick={() => setPanel('tile')}>
            Tile
          </Button>
        </Box>
      </FieldRow>
      {panel === 'character'
        ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sheetNames === null
              ? <TextField size={'small'} label={'Character sheet'} value={browsingSheet} onChange={event => setBrowsingSheet(event.target.value)}/>
              : (
                <Autocomplete
                  size={'small'}
                  sx={{ width: 260 }}
                  options={sheetNames as string[]}
                  value={browsingSheet === '' ? null : browsingSheet}
                  onChange={(_event, picked) => setBrowsingSheet(picked ?? '')}
                  renderInput={params => <TextField {...params} label={'Character sheet'}/>}
                />
              )}
            {browsingSheet === ''
              ? null
              : (
                <CharacterSheetGrid characterName={browsingSheet} sheet={browsingSheetImage}
                  selected={value.characterName === browsingSheet} selectedIndex={value.characterIndex}
                  onPick={cellIndex => onChange(withCharacter(value, browsingSheet, cellIndex))}/>
              )}
            {value.characterName === ''
              ? null
              : (
                <FieldRow>
                  <SelectField label={'Direction'} value={value.direction} options={DIRECTION_OPTIONS} width={130}
                    onChange={direction => onChange(withDirection(value, direction))}/>
                  <SelectField label={'Pattern'} value={value.pattern} options={PATTERN_OPTIONS} width={140}
                    onChange={pattern => onChange(withPattern(value, pattern))}/>
                </FieldRow>
              )}
          </Box>
        )
        : null}
      {panel === 'tile'
        ? <TilePanel tileset={tileset} sheets={tilesetSheets} value={value.tileId} onPick={tileId => onChange(withTile(value, tileId))}/>
        : null}
    </EditorStack>
  );
};

export { GraphicPicker };
export type { GraphicPickerProps };

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import type { TextureImage } from '../../core/renderer/MapRenderer.ts';
import { stampCaption, type Stamp } from '../../core/stamps/stamp.ts';
import { projectImagesFor } from '../../render/projectImages.ts';
import { drawStampThumbnail, THUMBNAIL_BOX, thumbnailCharacters, thumbnailLayout } from '../../render/stampThumbnail.ts';
import { usePaintSettings } from '../../render/tools/PaintToolBar.tsx';
import { useTilesets, useWorkspace } from '../workspaceHooks.tsx';
import { usePaintScope } from './palette/paintScope.tsx';
import { useTilesetSheets } from './palette/paletteHooks.ts';
import { CHECKERBOARD } from './palette/TileThumb.tsx';

/**
 * Loads the character sheets a stamp's events show, through the window's image cache, which every map view shares.
 * @param {Stamp} stamp The stamp.
 * @returns {ReadonlyMap<string, TextureImage | null>} The sheets by name, each null until it loads, or for a missing one.
 */
const useCharacterSheets = (stamp: Stamp): ReadonlyMap<string, TextureImage | null> =>
{
  const { api } = useWorkspace().services;
  const names = useMemo(() => thumbnailCharacters(stamp), [ stamp ]);
  const [ loaded, setLoaded ] = useState<ReadonlyMap<string, TextureImage | null>>(() => new Map());

  useEffect(() =>
  {
    if (api === null || names.length === 0)
    {
      return undefined;
    }

    let live = true;
    const images = projectImagesFor(api);
    Promise.all(names.map(name => images.image('characters', name).catch(() => null)))
      .then(sheets =>
      {
        if (live)
        {
          setLoaded(new Map(names.map((name, index) => [ name, sheets[index] ])));
        }
      })
      .catch(() => undefined);

    return () =>
    {
      live = false;
    };
  }, [ api, names ]);

  return loaded;
};

/**
 * A stamp's picture: its tiles and its events as the map shows them, drawn small, keeping the stamp's shape, sharp at
 * the screen's pixel density.
 * @param {{ stamp: Stamp }} props The stamp.
 * @returns {React.JSX.Element} The picture.
 */
const StampPicture = (props: { readonly stamp: Stamp }) =>
{
  const { stamp } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tilesets = useTilesets();
  const sheets = useTilesetSheets(tilesets[stamp.tilesetId] ?? null);
  const characters = useCharacterSheets(stamp);
  const layout = thumbnailLayout(stamp);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    // drawn at the screen's pixel density, the cells crisp rather than smoothed.
    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.max(1, Math.round(layout.width * scale));
    canvas.height = Math.max(1, Math.round(layout.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    drawStampThumbnail(context, stamp, { sheets, characters }, layout.cell * scale);
  }, [ stamp, sheets, characters, layout.width, layout.height, layout.cell ]);

  return (
    <Box
      component={'canvas'}
      ref={canvasRef}
      sx={{ width: layout.width, height: layout.height, display: 'block', background: CHECKERBOARD }}
    />
  );
};

/**
 * One stamp in the panel: its picture, what it holds, and the map it came from. A click takes it up as the brush, or
 * puts it down again when it is the stamp in hand.
 * @param {{ stamp: Stamp, picked: boolean, from: string, onClick: () => void }} props The stamp, whether it is in hand,
 * the name of the map it was copied from, and what a click does.
 * @returns {React.JSX.Element} The card.
 */
const StampCard = (props: { readonly stamp: Stamp; readonly picked: boolean; readonly from: string; readonly onClick: () => void }) =>
{
  const { stamp, picked, from, onClick } = props;
  return (
    <ButtonBase
      data-testid={'stamp-card'}
      aria-pressed={picked}
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        borderRadius: 1,
        border: 2,
        borderColor: picked ? 'primary.main' : 'divider',
        bgcolor: picked ? 'action.selected' : 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ height: THUMBNAIL_BOX.height + 8, display: 'grid', placeItems: 'center', bgcolor: '#121212' }}>
        <StampPicture stamp={stamp}/>
      </Box>
      <Box sx={{ px: 0.75, py: 0.5, minWidth: 0 }}>
        <Typography variant={'caption'} sx={{ display: 'block' }} noWrap title={stampCaption(stamp)}>
          {stampCaption(stamp)}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }} noWrap title={from}>
          {from}
        </Typography>
      </Box>
    </ButtonBase>
  );
};

/**
 * Every stamp copied in this window this session, newest first, each with a picture of what it holds: whatever Ctrl+C
 * or Ctrl+X takes off a map lands here, the oldest dropping off once more than the stamp history's cap are kept.
 * Clicking a stamp makes it the brush, so each click on a map places it, and clicking it again, or Esc, puts it down
 * and takes up the tool held before. It picks for its paint's window, as the palette does: the workspace's own maps.
 * @returns {React.JSX.Element} The panel.
 */
const StampsPanel = () =>
{
  const controller = useWorkspace();
  const { stamps } = controller.services;
  const list = useSyncExternalStore(stamps.subscribe, stamps.getSnapshot);
  const { painting } = usePaintScope();
  const settings = usePaintSettings(painting);
  const pickedId = settings.tool === 'stamp' && settings.stamp !== null ? settings.stamp.id : null;

  /**
   * Takes up a stamp as the brush, or puts it down when it is the one in hand.
   * @param {Stamp} stamp The stamp clicked.
   */
  const pick = (stamp: Stamp) =>
  {
    if (stamp.id === pickedId)
    {
      painting.putDownStamp();
      return;
    }

    painting.takeUpStamp(stamp);
  };

  /**
   * Puts the stamp in hand down on Esc, while the panel has the keys.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (event.key === 'Escape' && pickedId !== null)
    {
      event.preventDefault();
      painting.putDownStamp();
    }
  };

  if (list.length === 0)
  {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, color: 'text.secondary', bgcolor: 'background.default' }} data-testid={'stamps-panel'}>
        <Typography variant={'body2'} align={'center'}>
          Copy part of a map with Ctrl+C and it lands here as a stamp, ready to place again.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.default' }}
      data-testid={'stamps-panel'}
      onKeyDown={onKeyDown}
    >
      <Typography variant={'caption'} color={'text.secondary'} sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
        Click a stamp to place it with each click on a map; Esc puts it down.
      </Typography>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: 1,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          gridTemplateColumns: `repeat(auto-fill, minmax(${THUMBNAIL_BOX.width + 8}px, 1fr))`,
        }}
      >
        {list.map(stamp => (
          <StampCard
            key={stamp.id}
            stamp={stamp}
            picked={stamp.id === pickedId}
            from={`From ${controller.mapName(stamp.mapId)}`}
            onClick={() => pick(stamp)}
          />
        ))}
      </Box>
    </Box>
  );
};

export { StampsPanel };

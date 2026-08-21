import React, { type ChangeEvent, useCallback, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useIconSetAtlas } from '@presentation/context/icon-set-atlas.context.tsx';
import { iconGridDimensions, iconSlotCount, RMMZ_ICON_SET_CELL_PX, } from '@core/enums/RmmzIconSet.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';

type IconIndexFieldProps = {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
};

const PREVIEW_PX = 40;

/** Picker tile size in the dialog (compact vs. native {@code 32}px atlas cells). */
const DIALOG_CELL_PX = 28;

/** Must match {@code gap} on the picker CSS grid. */
const GRID_GAP_PX = 2;

/**
 * RPG Maker MZ {@code iconIndex}: preview + numeric field + atlas dialog ({@code IconSet.png}).
 * Requires {@link IconSetAtlasProvider} above in the tree (atlas is loaded once per project path).
 */
function IconIndexField(props: IconIndexFieldProps)
{
  const {
    value,
    onChange,
    disabled,
  } = props;

  const {
    atlasUrl,
    imgWidth,
    imgHeight,
    loadError,
  } = useIconSetAtlas();

  const [ dialogOpen, setDialogOpen ] = useState(false);

  const imgSize = useMemo(() =>
  {
    if (imgWidth <= 0 || imgHeight <= 0)
    {
      return null;
    }
    return {
      w: imgWidth,
      h: imgHeight,
    };
  }, [ imgHeight, imgWidth ]);

  const grid = useMemo(() =>
  {
    if (imgSize === null)
    {
      return {
        cols: 0,
        rows: 0,
        slots: 0,
      };
    }
    const {
      cols,
      rows
    } = iconGridDimensions(imgSize.w, imgSize.h, RMMZ_ICON_SET_CELL_PX);
    return {
      cols,
      rows,
      slots: iconSlotCount(cols, rows),
    };
  }, [ imgSize ]);

  const clampedPickerIndex = useMemo(() =>
  {
    if (grid.slots <= 0)
    {
      return 0;
    }
    const v = Math.max(0, Math.trunc(value));
    return Math.min(v, grid.slots - 1);
  }, [ value, grid.slots ]);

  const currentIconCellRef = useRef<HTMLDivElement>(null);

  const scrollPickerToCurrentIcon = useCallback(() =>
  {
    const el = currentIconCellRef.current;
    if (el === null)
    {
      return;
    }
    el.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });
  }, []);

  useLayoutEffect(() =>
  {
    if (dialogOpen === false)
    {
      return;
    }
    if (grid.slots <= 0)
    {
      return;
    }
    let alive = true;
    requestAnimationFrame(() =>
    {
      requestAnimationFrame(() =>
      {
        if (alive === false)
        {
          return;
        }
        scrollPickerToCurrentIcon();
      });
    });
    return () =>
    {
      alive = false;
    };
  }, [
    dialogOpen,
    clampedPickerIndex,
    grid.slots,
    scrollPickerToCurrentIcon,
  ]);

  const pickerCrosshairLayout = useMemo(() =>
  {
    if (grid.cols <= 0 || grid.rows <= 0)
    {
      return null;
    }
    const gap = GRID_GAP_PX;
    const cell = DIALOG_CELL_PX;
    const selCol = clampedPickerIndex % grid.cols;
    const selRow = Math.floor(clampedPickerIndex / grid.cols);
    const gridW = grid.cols * cell + (grid.cols - 1) * gap;
    const gridH = grid.rows * cell + (grid.rows - 1) * gap;
    return {
      colLeft: selCol * (cell + gap),
      rowTop: selRow * (cell + gap),
      gridW,
      gridH,
    };
  }, [
    clampedPickerIndex,
    grid.cols,
    grid.rows,
  ]);

  const handleIndexInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    const parsed = parseInt(event.target.value, 10);
    if (Number.isNaN(parsed))
    {
      onChange(0);
      return;
    }
    if (parsed < 0)
    {
      onChange(0);
      return;
    }
    onChange(parsed);
  };

  const pickIndex = (idx: number) =>
  {
    onChange(idx);
    setDialogOpen(false);
  };

  const previewSpriteStyle = useMemo(() =>
  {
    if (atlasUrl === null || imgSize === null || grid.cols <= 0)
    {
      return null;
    }
    const idx = Math.max(0, Math.trunc(value));
    if (idx >= grid.slots)
    {
      return null;
    }
    const col = idx % grid.cols;
    const row = Math.floor(idx / grid.cols);
    const s = RMMZ_ICON_SET_CELL_PX;
    const scale = PREVIEW_PX / s;
    return {
      width: PREVIEW_PX,
      height: PREVIEW_PX,
      backgroundImage: `url("${atlasUrl}")`,
      backgroundRepeat: 'no-repeat' as const,
      backgroundSize: `${imgSize.w * scale}px ${imgSize.h * scale}px`,
      backgroundPosition: `${-col * PREVIEW_PX}px ${-row * PREVIEW_PX}px`,
      // see IconSetSprite.tsx- keeps the border from shifting the visible window inward.
      backgroundOrigin: 'border-box' as const,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      flexShrink: 0,
    };
  }, [ atlasUrl, grid.cols, grid.slots, imgSize, value ]);

  const pickerDisabled =
    disabled === true
    || atlasUrl === null
    || loadError !== null;

  return (
    <Stack spacing={1}>
      <Stack direction={'row'} spacing={1.5} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
        <ButtonBase
          type={'button'}
          disabled={pickerDisabled}
          onClick={() =>
          {
            setDialogOpen(true);
          }}
          aria-label={'Choose icon from IconSet sheet'}
          sx={{
            display: 'block',
            padding: 0,
            ...(previewSpriteStyle !== null
              ? previewSpriteStyle
              : {
                width: PREVIEW_PX,
                height: PREVIEW_PX,
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                flexShrink: 0,
              }),
            '&:not(.Mui-disabled)': {
              cursor: 'pointer',
            },
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        />
        <NumberInputWithLabel
          label={'Icon #'}
          variant={'outlined'}
          size={'small'}
          value={Math.max(0, Math.trunc(value))}
          htmlInput={{
            min: 0,
            step: 1
          }}
          onChangeEventHandler={handleIndexInput}
          disabled={disabled === true}
          sx={{ width: 120 }}
        />
      </Stack>
      {loadError !== null && (
        <Typography variant={'caption'} color={'error'}>
          {loadError}
        </Typography>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() =>
        {
          setDialogOpen(false);
        }}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: {
              m: 2,
              width: 'fit-content',
              maxWidth: 'calc(100vw - 48px)',
            },
          },
        }}
      >
        <DialogTitle>IconSet</DialogTitle>
        <DialogContent
          dividers
          sx={{
            overflow: 'auto',
            maxHeight: '70vh',
            scrollbarGutter: 'stable',
            px: 3,
            pb: 1,
            boxSizing: 'border-box',
          }}
        >
          {atlasUrl === null || imgSize === null || grid.slots <= 0
            ? (
              <Typography color={'text.secondary'}>
                Loading atlas…
              </Typography>
            )
            : (
              <Box
                sx={{
                  position: 'relative',
                  width: 'fit-content',
                  boxSizing: 'border-box',
                }}
              >
                {pickerCrosshairLayout !== null && (
                  <>
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        left: pickerCrosshairLayout.colLeft,
                        top: 0,
                        width: DIALOG_CELL_PX,
                        height: pickerCrosshairLayout.gridH,
                        zIndex: 0,
                        pointerEvents: 'none',
                        backgroundColor: (theme) =>
                          alpha(theme.palette.primary.main, 0.22),
                        boxSizing: 'border-box',
                        borderLeft: '1px solid',
                        borderRight: '1px solid',
                        borderColor: (theme) =>
                          alpha(theme.palette.primary.light, 0.55),
                      }}
                    />
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: pickerCrosshairLayout.rowTop,
                        width: pickerCrosshairLayout.gridW,
                        height: DIALOG_CELL_PX,
                        zIndex: 0,
                        pointerEvents: 'none',
                        backgroundColor: (theme) =>
                          alpha(theme.palette.primary.main, 0.22),
                        boxSizing: 'border-box',
                        borderTop: '1px solid',
                        borderBottom: '1px solid',
                        borderColor: (theme) =>
                          alpha(theme.palette.primary.light, 0.55),
                      }}
                    />
                  </>
                )}
                <Box
                  sx={{
                    display: 'grid',
                    position: 'relative',
                    zIndex: 1,
                    gridTemplateColumns: `repeat(${grid.cols}, ${DIALOG_CELL_PX}px)`,
                    gap: `${GRID_GAP_PX}px`,
                    width: 'fit-content',
                    boxSizing: 'border-box',
                  }}
                >
                  {Array.from(
                    { length: grid.slots },
                    (
                      _,
                      idx
                    ) =>
                    {
                      const col = idx % grid.cols;
                      const row = Math.floor(idx / grid.cols);
                      const s = RMMZ_ICON_SET_CELL_PX;
                      const scale = DIALOG_CELL_PX / s;
                      const isCurrentPick = idx === clampedPickerIndex;
                      return (
                        <Box
                          key={idx}
                          ref={isCurrentPick
                            ? currentIconCellRef
                            : undefined}
                          role={'button'}
                          tabIndex={0}
                          onClick={() =>
                          {
                            pickIndex(idx);
                          }}
                          onKeyDown={(ke) =>
                          {
                            if (ke.key === 'Enter' || ke.key === ' ')
                            {
                              ke.preventDefault();
                              pickIndex(idx);
                            }
                          }}
                          sx={{
                            width: DIALOG_CELL_PX,
                            height: DIALOG_CELL_PX,
                            boxSizing: 'border-box',
                            backgroundImage: `url("${atlasUrl}")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: `${imgSize.w * scale}px ${imgSize.h * scale}px`,
                            backgroundPosition: `${-col * DIALOG_CELL_PX}px ${-row * DIALOG_CELL_PX}px`,
                            // see IconSetSprite.tsx- keeps the border (2px on the selected cell)
                            // from shifting the visible window inward and bleeding the neighbor in.
                            backgroundOrigin: 'border-box',
                            border: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                            ...(isCurrentPick
                              ? {
                                zIndex: 2,
                                border: '2px solid',
                                borderColor: 'primary.main',
                                boxShadow: (theme) =>
                                  `0 0 0 1px ${theme.palette.background.paper}, 0 0 0 3px ${theme.palette.primary.main}, 0 0 12px ${alpha(
                                    theme.palette.primary.main,
                                    0.65
                                  )}`,
                              }
                              : {}),
                            '&:hover': {
                              outline: '1px solid',
                              outlineColor: 'primary.light',
                            },
                          }}
                        />
                      );
                    }
                  )}
                </Box>
              </Box>
            )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
            {
              setDialogOpen(false);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export { IconIndexField, type IconIndexFieldProps };

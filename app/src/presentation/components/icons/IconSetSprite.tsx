import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useIconSetAtlas } from '@presentation/context/icon-set-atlas.context.tsx';
import {
  iconGridDimensions,
  iconSlotCount,
  RMMZ_ICON_SET_CELL_PX,
} from '@core/enums/RmmzIconSet.ts';

type IconSetSpriteProps = {
  /**
   * RPG Maker MZ {@link Rmmz.Base.RPG_BaseItem.iconIndex} into {@code IconSet.png}.
   */
  iconIndex: number;
  /**
   * On-screen square size (background is scaled from {@link RMMZ_ICON_SET_CELL_PX} source cells).
   */
  sizePx?: number;
};

/**
 * Read-only sprite cut from the loaded IconSet atlas (no picker). Used in dense lists and chips.
 */
function IconSetSprite(props: IconSetSpriteProps)
{
  const {
    iconIndex,
    sizePx = 28,
  } = props;

  const {
    atlasUrl,
    imgWidth,
    imgHeight,
  } = useIconSetAtlas();

  const spriteStyle = useMemo(() =>
  {
    if (atlasUrl === null || imgWidth <= 0 || imgHeight <= 0)
    {
      return null;
    }

    const {
      cols,
      rows
    } = iconGridDimensions(imgWidth, imgHeight, RMMZ_ICON_SET_CELL_PX);
    const slots = iconSlotCount(cols, rows);

    if (cols <= 0 || slots <= 0)
    {
      return null;
    }

    const idx = Math.max(0, Math.trunc(iconIndex));
    if (idx >= slots)
    {
      return null;
    }

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const s = RMMZ_ICON_SET_CELL_PX;
    const scale = sizePx / s;

    return {
      width: sizePx,
      height: sizePx,
      backgroundImage: `url("${atlasUrl}")`,
      backgroundRepeat: 'no-repeat' as const,
      backgroundSize: `${imgWidth * scale}px ${imgHeight * scale}px`,
      backgroundPosition: `${-col * sizePx}px ${-row * sizePx}px`,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      flexShrink: 0,
      boxSizing: 'border-box' as const,
    };
  }, [
    atlasUrl,
    iconIndex,
    imgHeight,
    imgWidth,
    sizePx,
  ]);

  return (
    <Box
      aria-hidden={true}
      sx={spriteStyle !== null
        ? spriteStyle
        : {
          width: sizePx,
          height: sizePx,
          flexShrink: 0,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          boxSizing: 'border-box',
        }}
    />
  );
}

export { IconSetSprite };
export type { IconSetSpriteProps };

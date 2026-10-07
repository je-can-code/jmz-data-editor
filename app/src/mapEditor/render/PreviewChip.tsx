import React, { useSyncExternalStore } from 'react';
import ToggleOn from '@mui/icons-material/ToggleOn';
import { Chip } from '@mui/material';
import { previewWords } from '../core/preview/previewWords.ts';
import type { WindowPreview } from '../core/preview/WindowPreview.ts';

/**
 * What the chip shows: the window's preview, and what a click on it does.
 */
type PreviewChipProps = {
  readonly preview: WindowPreview;
  readonly onOpen: () => void;
};

/**
 * The window's preview in a map view's bar, beside the clock, so a preview is never on unnoticed: "Fresh save" while
 * every map shows a new game, and otherwise what it sets, such as "2 switches on, 1 variable set", standing out until it
 * is cleared. A click opens the Switches & Variables window, where it is changed.
 * @param {PreviewChipProps} props The preview, and what opening it does.
 * @returns {React.JSX.Element} The chip.
 */
const PreviewChip = (props: PreviewChipProps) =>
{
  const { preview, onOpen } = props;
  const shown = useSyncExternalStore(preview.subscribe, preview.preview);
  return (
    <Chip
      color={shown.isFresh ? 'default' : 'warning'}
      data-testid={'map-preview'}
      icon={<ToggleOn/>}
      label={previewWords(shown)}
      onClick={onOpen}
      size={'small'}
      title={'How far along the story every map shows the game: open Switches & Variables to change it'}
      variant={shown.isFresh ? 'outlined' : 'filled'}
    />
  );
};

export { PreviewChip };

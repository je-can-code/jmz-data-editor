import React, { useSyncExternalStore } from 'react';
import ToggleOn from '@mui/icons-material/ToggleOn';
import { Chip } from '@mui/material';
import type { PreviewKind } from '../core/preview/GamePreview.ts';
import { previewWords, type PreviewNouns } from '../core/preview/previewWords.ts';
import type { WindowPreview } from '../core/preview/WindowPreview.ts';

/**
 * What the chip shows: the window's preview, what each kind it may set is called, and what a click on it does.
 */
type PreviewChipProps = {
  readonly preview: WindowPreview;
  readonly nouns: ReadonlyMap<PreviewKind, PreviewNouns>;
  readonly onOpen: () => void;
};

/**
 * The window's preview in a map view's bar, beside the clock, so a preview is never on unnoticed: "Fresh save" while
 * every map shows a new game, and otherwise what it sets, such as "2 switches on, 1 variable set, 1 quest set", each kind
 * named as the core or the module adding it names it, standing out until it is cleared. A click opens the Switches &
 * Variables window, where it is changed.
 * @param {PreviewChipProps} props The preview, what each kind is called, and what opening it does.
 * @returns {React.JSX.Element} The chip.
 */
const PreviewChip = (props: PreviewChipProps) =>
{
  const { preview, nouns, onOpen } = props;
  const shown = useSyncExternalStore(preview.subscribe, preview.preview);
  return (
    <Chip
      color={shown.isFresh ? 'default' : 'warning'}
      data-testid={'map-preview'}
      icon={<ToggleOn/>}
      label={previewWords(shown, nouns)}
      onClick={onOpen}
      size={'small'}
      title={'How far along the story every map shows the game: open Switches & Variables to change it'}
      variant={shown.isFresh ? 'outlined' : 'filled'}
    />
  );
};

export { PreviewChip };

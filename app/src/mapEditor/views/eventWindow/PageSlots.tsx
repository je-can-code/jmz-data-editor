import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { describeGraphic, describeMovement } from '../../core/eventWindow/pageSummaries.ts';
import type { PageMovement } from '../../core/eventWindow/pageSettings.ts';
import type { RmmzEventImage } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { GraphicPreview } from '../quickPanel/QuickControls.tsx';

/**
 * What every page slot takes: the value it edits, as the page holds it now, and where a new value goes. The event
 * window hands each change on as one step in the event's own history, so a component mounted in a slot never touches
 * the document itself.
 */
type PageSlotProps<T> = {
  readonly value: T;
  readonly onChange: (value: T) => void;
};

/**
 * The graphic picker's place on a page: the character or tile picture, its facing and its frame. The picker is built
 * on its own, with the same value and onChange, and mounts here in place of this read-only view of the picture; its
 * changes already reach the page through onChange.
 * @param {PageSlotProps<RmmzEventImage>} props The page's picture, and where a new one goes.
 * @returns {React.JSX.Element} The slot.
 */
const GraphicSlot = (props: PageSlotProps<RmmzEventImage>) =>
{
  const { value } = props;
  const { api } = useMapEditorServices();
  return (
    <Stack direction={'row'} spacing={1.5} alignItems={'center'} data-testid={'graphic-slot'}>
      <GraphicPreview api={api} image={value}/>
      <Typography variant={'body2'} color={'text.secondary'}>{describeGraphic(value)}</Typography>
    </Stack>
  );
};

/**
 * The movement settings' place on a page: how it moves on its own, how fast, how often, and its custom route. The
 * settings are built on their own, with the same value and onChange, and mount here in place of this read-only view of
 * the movement; their changes already reach the page through onChange.
 * @param {PageSlotProps<PageMovement>} props The page's movement, and where a new one goes.
 * @returns {React.JSX.Element} The slot.
 */
const MovementSlot = (props: PageSlotProps<PageMovement>) =>
{
  const { value } = props;
  return (
    <Box data-testid={'movement-slot'}>
      {describeMovement(value).map(line => (
        <Typography key={line} variant={'body2'} color={'text.secondary'}>{line}</Typography>
      ))}
    </Box>
  );
};

export { GraphicSlot, MovementSlot };
export type { PageSlotProps };

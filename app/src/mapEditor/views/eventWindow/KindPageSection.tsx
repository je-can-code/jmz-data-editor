import React, { useSyncExternalStore } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import type { EventWindowTarget } from '../../core/eventWindow/eventWindowTarget.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

/**
 * The section a plugin module's kind adds to the event window for the page it shows, such as a battler's settings, under
 * the kind's name, as the window's own sections sit under theirs; nothing for an event no kind with such a section
 * claims. It follows the modules switching on and off with their plugins.
 * @param {{ target: EventWindowTarget, event: RmmzMapEvent, pageIndex: number }} props The event and the page shown.
 * @returns {React.JSX.Element | null} The section, or nothing.
 */
const KindPageSection = (props: { readonly target: EventWindowTarget; readonly event: RmmzMapEvent; readonly pageIndex: number }) =>
{
  const { target, event, pageIndex } = props;
  const { modules } = useMapEditorServices();
  useSyncExternalStore(modules.subscribe, () => modules.revision);
  const kind = modules.kindOf(event, target.mapId);
  const PageSection = kind === null ? undefined : kind.pageSection;
  if (kind === null || PageSection === undefined)
  {
    return null;
  }

  return (
    <>
      <Divider/>
      <Box component={'section'} aria-label={kind.title} sx={{ px: 1.5, py: 1.25 }} data-testid={`page-section-${kind.id}`}>
        <Typography variant={'overline'} color={'text.secondary'} component={'h2'} sx={{ display: 'block', lineHeight: 2 }}>
          {kind.title}
        </Typography>
        <PageSection target={target} pageIndex={pageIndex}/>
      </Box>
    </>
  );
};

export { KindPageSection };

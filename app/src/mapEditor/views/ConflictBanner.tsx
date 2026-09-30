import React, { useEffect, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import type { DocumentConflict, DocumentHub } from '../core/history/DocumentHub.ts';
import type { DocumentKey } from '../core/model/documentKeys.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { describeConflict } from './documentLabels.ts';

/**
 * One conflicted document and its conflict.
 */
type ConflictRow = {
  readonly document: DocumentKey;
  readonly conflict: DocumentConflict;
};

/**
 * Lists every conflicted document the window holds.
 * @param {DocumentHub} hub The window's documents.
 * @returns {ConflictRow[]} The conflicts.
 */
const listConflicts = (hub: DocumentHub): ConflictRow[] =>
{
  return hub.documentKeys()
    .map(document => ({ document, conflict: hub.conflict(document) }))
    .filter((row): row is ConflictRow => row.conflict !== null);
};

/**
 * Shows every document whose two copies disagree, with both choices, until the author picks one. Nothing is
 * settled without them: either choice throws the other copy's work away, which only they can decide.
 * @returns {React.JSX.Element | null} The banner, or nothing when there is no conflict.
 */
const ConflictBanner = () =>
{
  const { hub, resolveConflict } = useMapEditorServices();
  const [ conflicts, setConflicts ] = useState<ConflictRow[]>(() => listConflicts(hub));

  // every conflict raised or settled, here or through another window, redraws the list.
  useEffect(() => hub.subscribe(() => setConflicts(listConflicts(hub))), [ hub ]);

  if (conflicts.length === 0)
  {
    return null;
  }

  return (
    <Stack spacing={1} sx={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 'snackbar' }}>
      {conflicts.map(({ document, conflict }) =>
      {
        const wording = describeConflict(document, conflict);
        return (
          <Alert
            key={document}
            data-testid={'document-conflict'}
            severity={'warning'}
            variant={'filled'}
            action={(
              <Stack direction={'row'} spacing={1}>
                <Button color={'inherit'} size={'small'} onClick={() => resolveConflict(document, 'mine')}>
                  {wording.keepLabel}
                </Button>
                {wording.takeLabel !== null && (
                  <Button color={'inherit'} size={'small'} onClick={() => resolveConflict(document, 'theirs')}>
                    {wording.takeLabel}
                  </Button>
                )}
              </Stack>
            )}
          >
            {wording.message}
          </Alert>
        );
      })}
    </Stack>
  );
};

export { ConflictBanner, listConflicts };

import React, { useEffect, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../core/blueprints/blueprints.ts';
import type { DocumentConflict, DocumentHub } from '../core/history/DocumentHub.ts';
import { parseDocumentKey, type DocumentKey } from '../core/model/documentKeys.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { describeConflict, documentLabel, documentName, heldTreeName } from './documentLabels.ts';

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
 * Names a conflicted document for the author: a map as the map tree shows it; a blueprint opened as a map by the
 * blueprint's own name, quoted, while the blueprints still hold it in a form that can be read; anything else by its label.
 * @param {DocumentHub} hub The window's documents.
 * @param {DocumentKey} key The document.
 * @returns {string} The name.
 */
const conflictName = (hub: DocumentHub, key: DocumentKey): string =>
{
  const parsed = parseDocumentKey(key);
  if (parsed.kind === 'map')
  {
    return documentName(key, mapId => heldTreeName(hub, mapId));
  }

  if (parsed.kind !== 'blueprint-map' || hub.has(BLUEPRINTS_DOCUMENT) === false)
  {
    return documentLabel(key);
  }

  // a hand-edited file can hold something there no blueprint can be read from, which is named by its label instead.
  try
  {
    const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), parsed.blueprintId);
    return blueprint === null ? documentLabel(key) : `"${blueprint.name}"`;
  }
  catch
  {
    return documentLabel(key);
  }
};

/**
 * Shows every document whose two copies disagree, with both choices, until the author picks one. Nothing is
 * settled without them: either choice throws the other copy's work away, which only they can decide. A map whose file was
 * deleted offers no choice, only the words that saving puts the file back, and goes once it is saved. The banner stands
 * in the window's bottom right corner, clear of the notices at its foot on the left, so nothing it says is hidden.
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
    <Stack spacing={1} sx={{ position: 'fixed', right: 16, bottom: 16, maxWidth: 'min(640px, calc(100vw - 32px))', zIndex: 'snackbar' }}>
      {conflicts.map(({ document, conflict }) =>
      {
        const wording = describeConflict(document, conflict, conflictName(hub, document));
        return (
          <Alert
            key={document}
            data-testid={'document-conflict'}
            severity={'warning'}
            variant={'filled'}
            action={(
              <Stack direction={'row'} spacing={1}>
                {wording.keepLabel !== null && (
                  <Button color={'inherit'} size={'small'} onClick={() => resolveConflict(document, 'mine')}>
                    {wording.keepLabel}
                  </Button>
                )}
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

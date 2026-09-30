import { useEffect, useState } from 'react';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import type { DocumentKey } from '../../core/model/documentKeys.ts';

/**
 * Follows a held document's revision, so a component redraws on every change to it: its own edits, undo and redo,
 * another window's edits, a reload from disk.
 * @param {DocumentHub} hub The window's documents.
 * @param {DocumentKey} key The document; it must be held while the component shows it.
 * @returns {number} The document's revision.
 */
const useDocumentRevision = (hub: DocumentHub, key: DocumentKey): number =>
{
  const [ revision, setRevision ] = useState(() => hub.document(key).revision);

  useEffect(() =>
  {
    const document = hub.document(key);
    setRevision(document.revision);
    return document.subscribe(change => setRevision(change.revision));
  }, [ hub, key ]);

  return revision;
};

/**
 * Follows every change the hub announces (steps recorded, undone and redone, saves, conflicts), for what shows
 * history or save state.
 * @param {DocumentHub} hub The window's documents.
 * @returns {number} A count that grows with each announcement.
 */
const useHubChanges = (hub: DocumentHub): number =>
{
  const [ changes, setChanges ] = useState(0);
  useEffect(() => hub.subscribe(() => setChanges(count => count + 1)), [ hub ]);
  return changes;
};

export { useDocumentRevision, useHubChanges };

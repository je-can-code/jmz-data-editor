import { describe, expect, it } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { recheckCleanDocuments, routeFileChange } from '../../../../src/mapEditor/core/sync/fileChangeRouting.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Routing decides what a change on the server's stream means for one window. Echoes of session saves are ignored
 * (the sync suite proves that across two windows); what remains is covered here. A file backing nothing this
 * window holds is none of its business. A removed file never reloads, since the window now holds the only copy.
 * And after the stream reconnects, only clean documents are re-read: a document with unsaved edits differs from
 * disk by definition, and flagging it for that would cry wolf on every reconnect.
 */
describe('fileChangeRouting', () =>
{
  const NOBODY = { knowsClient: () => false };

  /**
   * A hub holding two maps over a store whose files can be changed behind its back.
   * @returns {{ hub: DocumentHub, files: Map<DocumentKey, JsonValue> }} The hub and the files.
   */
  const buildHub = () =>
  {
    const files = new Map<DocumentKey, JsonValue>([
      [ 'map:1', buildMapJson() as unknown as JsonValue ],
      [ 'map:2', buildMapJson() as unknown as JsonValue ],
    ]);
    const store: DocumentStore = {
      load: async key => structuredClone(files.get(key) as JsonValue),
      save: async () => undefined,
    };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    return { hub, files };
  };

  /**
   * Changes a map's file on disk.
   * @param {Map<DocumentKey, JsonValue>} files The files.
   * @param {DocumentKey} key The map.
   * @param {string} note The new note.
   */
  const changeOnDisk = (files: Map<DocumentKey, JsonValue>, key: DocumentKey, note: string) =>
  {
    files.set(key, { ...(files.get(key) as object), note } as JsonValue);
  };

  it('leaves alone a file backing nothing this window holds', async () =>
  {
    // Arrange.
    const { hub } = buildHub();

    // Act.
    const outcomes = [
      await routeFileChange({ path: 'data/Map009.json', kind: 'write', client: '' }, hub, NOBODY),
      await routeFileChange({ path: 'data/Actors.json', kind: 'write', client: '' }, hub, NOBODY),
    ];

    // Assert.
    expect(outcomes)
      .toStrictEqual([ 'untracked', 'untracked' ]);
  });

  it('flags a document whose file was removed, and keeps what it holds', async () =>
  {
    // Arrange.
    const { hub } = buildHub();
    const before = hub.document('map:2').toJson();

    // Act.
    const outcome = await routeFileChange({ path: 'data/Map002.json', kind: 'remove', client: '' }, hub, NOBODY);

    // Assert: flagged with no file content beside it, since there is no file.
    expect([ outcome, hub.conflict('map:2'), hub.isConflicted('map:1'), hub.document('map:2').toJson() ])
      .toStrictEqual([ 'conflicted', { kind: 'disk', content: null }, false, before ]);
  });

  it('re-reads only the clean documents after a reconnect', async () =>
  {
    // Arrange.
    const { hub, files } = buildHub();
    hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    changeOnDisk(files, 'map:1', 'changed while the stream was down');
    changeOnDisk(files, 'map:2', 'changed while the stream was down');

    // Act.
    const outcomes = await recheckCleanDocuments(hub);

    // Assert.
    expect([ outcomes, hub.isConflicted('map:1'), (hub.document('map:2').toJson() as { note: string }).note ])
      .toStrictEqual([ [ 'reloaded' ], false, 'changed while the stream was down' ]);
  });
});

import { describe, expect, it } from 'vitest';
import { DocumentHub, type DocumentSnapshot } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import type { TilesetsDocument } from '../../../../src/mapEditor/core/model/JsonDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { lookAtDocument, type LookSources } from '../../../../src/mapEditor/core/sync/lookAtDocument.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A picker looks at maps it never edits, from windows that may have no way to save them, so a look must never hold a
 * document: every window holding one counts as keeping a copy, and a window holding a map it cannot save would let the
 * window editing that map close without asking about its unsaved edits. After a look, the hub holds exactly what it
 * held before.
 *
 * What a look returns is the freshest copy there is: this window's own when it holds one; else the live copy another
 * window holds, unsaved edits included, once the other windows have had their chance to be heard; else the file. The
 * file is read only when nobody holds the document or a holder never answers, since it may lack edits a window has.
 */
describe('lookAtDocument', () =>
{
  /**
   * Builds a map file with a name to tell its copies apart by.
   * @param {string} displayName The map's display name.
   * @returns {JsonValue} The map file.
   */
  const mapNamed = (displayName: string): JsonValue =>
  {
    return { ...buildMapJson(), displayName } as unknown as JsonValue;
  };

  /**
   * Builds a tileset row.
   * @param {number} id The tileset id.
   * @returns {RmmzTileset} The row.
   */
  const tilesetRow = (id: number): RmmzTileset => ({ id, flags: [ id ], mode: 1, name: `Set ${id}`, note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] });

  /**
   * Builds a window's hub over files on disk, and its link to windows that hold some documents and answer with a copy.
   * @param {object} options Who holds the documents before and after the wait, what their copy holds (null when they
   * never answer), and the files on disk.
   * @returns {object} The sources, the hub, and every file read, wait made and copy asked for, in order.
   */
  const buildSources = (options: {
    holdersBefore?: readonly string[];
    holdersAfter?: readonly string[];
    copy?: JsonValue | null;
    files?: ReadonlyMap<DocumentKey, JsonValue>;
  }) =>
  {
    const asked: string[] = [];
    const files = options.files ?? new Map<DocumentKey, JsonValue>([ [ 'map:5', mapNamed('On disk') ] ]);
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async (key: DocumentKey) =>
        {
          asked.push(`file ${key}`);
          return files.get(key) as JsonValue;
        },
        save: async () => undefined,
      },
    });

    // the other windows are heard from during the wait, so who holds what can change across it.
    let holders = options.holdersBefore ?? [];
    const sync = {
      whenHeldOrDiscovered: async (key: DocumentKey) =>
      {
        asked.push(`wait ${key}`);
        holders = options.holdersAfter ?? holders;
      },
      holders: () => [ ...holders ],
      requestSnapshot: async (key: DocumentKey): Promise<DocumentSnapshot | null> =>
      {
        asked.push(`copy ${key}`);
        const { copy = null } = options;
        return copy === null
          ? null
          : { document: key, content: copy, lineage: [], applied: [], moves: [], saved: [], histories: [], unlisted: [] };
      },
    };
    const sources: LookSources = { hub, sync };
    return { sources, hub, asked };
  };

  /**
   * Reads the display name a looked-at map holds.
   * @param {EditorDocument} document The map.
   * @returns {string} Its display name.
   */
  const displayNameOf = (document: EditorDocument): string =>
  {
    return (document as MapDocument).property('displayName');
  };

  it('hands back this window\'s own copy when it holds the document, asking nobody', async () =>
  {
    // Arrange: this window holds map 5 with an edit the file lacks, and another window holds it too.
    const { sources, hub, asked } = buildSources({ holdersBefore: [ 'window-b' ], copy: mapNamed('Their copy') });
    hub.adopt('map:5', mapNamed('My copy'));

    // Act.
    const looked = await lookAtDocument(sources, 'map:5');

    // Assert.
    expect([ looked === hub.document('map:5'), asked ])
      .toStrictEqual([ true, [] ]);
  });

  it('takes another window\'s live copy, unsaved edits and all, without holding it or reading the file', async () =>
  {
    // Arrange.
    const { sources, hub, asked } = buildSources({ holdersBefore: [ 'window-b' ], copy: mapNamed('Unsaved name') });

    // Act.
    const looked = await lookAtDocument(sources, 'map:5');

    // Assert.
    expect([ displayNameOf(looked), hub.has('map:5'), hub.documentKeys(), asked ])
      .toStrictEqual([ 'Unsaved name', false, [], [ 'wait map:5', 'copy map:5' ] ]);
  });

  it('waits to hear from the other windows before deciding nobody holds the document', async () =>
  {
    // Arrange: the window holding map 5 is only heard from during the wait.
    const { sources, asked } = buildSources({ holdersBefore: [], holdersAfter: [ 'window-b' ], copy: mapNamed('Unsaved name') });

    // Act.
    const looked = await lookAtDocument(sources, 'map:5');

    // Assert.
    expect([ displayNameOf(looked), asked ])
      .toStrictEqual([ 'Unsaved name', [ 'wait map:5', 'copy map:5' ] ]);
  });

  it('reads the file when the window holding the document never answers', async () =>
  {
    // Arrange.
    const { sources, hub, asked } = buildSources({ holdersBefore: [ 'window-b' ], copy: null });

    // Act.
    const looked = await lookAtDocument(sources, 'map:5');

    // Assert.
    expect([ displayNameOf(looked), hub.has('map:5'), asked ])
      .toStrictEqual([ 'On disk', false, [ 'wait map:5', 'copy map:5', 'file map:5' ] ]);
  });

  it('reads the file when nobody holds the document, asking nobody for a copy', async () =>
  {
    // Arrange.
    const { sources, hub, asked } = buildSources({ holdersBefore: [], copy: mapNamed('Never asked for') });

    // Act.
    const looked = await lookAtDocument(sources, 'map:5');

    // Assert.
    expect([ displayNameOf(looked), hub.has('map:5'), asked ])
      .toStrictEqual([ 'On disk', false, [ 'wait map:5', 'file map:5' ] ]);
  });

  it('looks at the tilesets as tilesets, holding them no more than a map', async () =>
  {
    // Arrange: the tilesets file holds each row at its id.
    const files = new Map<DocumentKey, JsonValue>([ [ 'tilesets', [ null, tilesetRow(1), null, null, tilesetRow(4) ] as unknown as JsonValue ] ]);
    const { sources, hub } = buildSources({ files });

    // Act.
    const looked = await lookAtDocument(sources, 'tilesets');

    // Assert.
    expect([ (looked as TilesetsDocument).tileset(4), hub.has('tilesets') ])
      .toStrictEqual([ tilesetRow(4), false ]);
  });
});

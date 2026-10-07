import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../../src/mapEditor/core/model/createDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { JsonDocument, MapInfosDocument, SystemDocument, TilesetsDocument } from '../../../../src/mapEditor/core/model/JsonDocument.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { PatchConflictError } from '../../../../src/mapEditor/core/model/patches.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The map tree, the tilesets and every editor-only document are one JSON value each, kept in the file's own
 * shape and changed by set and splice patches. Such a document owes the same things a map does: its own copy of
 * whatever it was built from, every change heard by its listeners, and a refusal for anything that is not a set
 * or a splice, since it has no tiles to change. The typed map tree and tileset views are thin, but a map tree
 * row read from the wrong index would open the wrong map, so they are covered too.
 */
describe('JsonDocument', () =>
{
  /**
   * A map tree with two rows, index 0 empty as the file has it.
   * @returns {JsonValue} The content.
   */
  const buildInfos = (): JsonValue => [
    null,
    { id: 1, expanded: false, name: 'Town', order: 1, parentId: 0, scrollX: 0, scrollY: 0 },
    { id: 2, expanded: true, name: 'Cave', order: 2, parentId: 1, scrollX: 10.5, scrollY: 3, quick: true },
  ];

  it('keeps its own copy of the content it was built from', () =>
  {
    // Arrange.
    const content = { names: [ 'a', 'b' ] };
    const document = new JsonDocument('editor-data:layouts', content);

    // Act.
    content.names.push('c');

    // Assert.
    expect(document.toJson())
      .toStrictEqual({ names: [ 'a', 'b' ] });
  });

  it('applies a set and tells its listeners', () =>
  {
    // Arrange.
    const document = new JsonDocument('editor-data:layouts', { width: 1, height: 2 });
    const listener = vi.fn();
    document.subscribe(listener);
    const patch = document.setPatch([ 'width' ], 5);

    // Act.
    document.apply(patch);

    // Assert.
    expect([ document.toJson(), listener.mock.calls ])
      .toStrictEqual([ { width: 5, height: 2 }, [ [ { kind: 'patched', key: 'editor-data:layouts', patch, revision: 1 } ] ] ]);
  });

  it('applies a splice', () =>
  {
    // Arrange.
    const document = new JsonDocument('editor-data:layouts', { names: [ 'a', 'b', 'c' ] });

    // Act.
    document.apply(document.splicePatch([ 'names' ], 1, 1, [ 'x', 'y' ]));

    // Assert.
    expect(document.valueAt([ 'names' ]))
      .toStrictEqual([ 'a', 'x', 'y', 'c' ]);
  });

  it('refuses tile patches, having no tiles', () =>
  {
    // Arrange.
    const document = new JsonDocument('tilesets', []);

    // Act.
    const apply = () => document.apply({ kind: 'tiles', indices: [ 0 ], before: [ 0 ], after: [ 1 ] });

    // Assert.
    expect(apply)
      .toThrow(PatchConflictError);
  });

  it('swaps in whole new content and says so', () =>
  {
    // Arrange.
    const document = new JsonDocument('mapinfos', buildInfos());
    const listener = vi.fn();
    document.subscribe(listener);

    // Act.
    document.replace([ null ]);

    // Assert.
    expect([ document.toJson(), listener.mock.calls[0][0] ])
      .toStrictEqual([ [ null ], { kind: 'replaced', key: 'mapinfos', revision: 1 } ]);
  });

  it('hands back a copy from toJson', () =>
  {
    // Arrange.
    const document = new JsonDocument('editor-data:layouts', { names: [ 'a' ] });

    // Act.
    const copy = document.toJson() as { names: string[] };
    copy.names.push('b');

    // Assert.
    expect(document.content)
      .toStrictEqual({ names: [ 'a' ] });
  });

  it('works out the patches to other content without applying them, and they reach it exactly', () =>
  {
    // Arrange: the second map is renamed and a third arrives; the first row stays as it was.
    const document = new MapInfosDocument('mapinfos', buildInfos());
    const next = buildInfos() as { name: string }[];
    next[2].name = 'Deep Cave';
    next.push({ id: 3, expanded: false, name: 'Peak', order: 3, parentId: 0, scrollX: 0, scrollY: 0 } as never);

    // Act.
    const patches = document.patchesTo(next as unknown as JsonValue) ?? [];
    const untouched = document.toJson();
    patches.forEach(patch => document.apply(patch));

    // Assert.
    expect([ patches.map(patch => [ patch.kind, 'path' in patch ? patch.path : null ]), untouched, document.toJson() ])
      .toStrictEqual([ [ [ 'set', [ 2, 'name' ] ], [ 'splice', [] ] ], buildInfos(), next ]);
  });

  it('has no patches for content whose whole value changed kind', () =>
  {
    // Arrange: a list that became an object.
    const document = new JsonDocument('mapinfos', buildInfos());

    // Act.
    const patches = document.patchesTo({ rows: [] });

    // Assert.
    expect(patches)
      .toBeNull();
  });

  describe('MapInfosDocument', () =>
  {
    it('reads a map row by id and answers null for the empty slot and beyond', () =>
    {
      // Arrange.
      const document = new MapInfosDocument('mapinfos', buildInfos());

      // Act.
      const names = [ document.info(1)?.name, document.info(2)?.name, document.info(0), document.info(3) ];

      // Assert.
      expect(names)
        .toStrictEqual([ 'Town', 'Cave', null, null ]);
    });
  });

  describe('TilesetsDocument', () =>
  {
    it('reads a tileset by id and answers null for the empty slot', () =>
    {
      // Arrange.
      const row = { id: 1, flags: [ 16 ], mode: 1, name: 'Outside', note: '', tilesetNames: [ 'A1' ] };
      const document = new TilesetsDocument('tilesets', [ null, row, { ...row, id: 2, name: 'Inside' } ]);

      // Act.
      const names = [ document.tileset(1)?.name, document.tileset(2)?.name, document.tileset(0) ];

      // Assert.
      expect(names)
        .toStrictEqual([ 'Outside', 'Inside', null ]);
    });
  });

  describe('SystemDocument', () =>
  {
    it('reads the switches\' names and the variables\' names, each by id', () =>
    {
      // Arrange: the settings, with a title beside the two lists.
      const document = new SystemDocument('system', { gameTitle: 'Chef Adventure', switches: [ '', 'Door open' ], variables: [ '', 'Gold', 'Parries' ] });

      // Act.
      const names = [ document.names('switches'), document.names('variables'), document.system['gameTitle'] ];

      // Assert.
      expect(names)
        .toStrictEqual([ [ '', 'Door open' ], [ '', 'Gold', 'Parries' ], 'Chef Adventure' ]);
    });
  });

  describe('createDocument', () =>
  {
    it('builds the kind of document each key names', () =>
    {
      // Arrange.
      const map = buildMapJson() as unknown as JsonValue;

      // Act.
      const documents = [
        createDocument('map:3', map),
        createDocument('mapinfos', buildInfos()),
        createDocument('tilesets', []),
        createDocument('common-events', [ null ]),
        createDocument('system', { switches: [ '' ], variables: [ '' ] }),
        createDocument('editor-data:blueprints', {}),
      ];

      // Assert.
      expect(documents.map(document => document.constructor))
        .toStrictEqual([ MapDocument, MapInfosDocument, TilesetsDocument, JsonDocument, SystemDocument, JsonDocument ]);
    });
  });
});

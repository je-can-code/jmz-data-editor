import { describe, expect, it } from 'vitest';
import { MapEditorApiError, type MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { LayoutStore } from '../../../../src/mapEditor/core/workspace/LayoutStore.ts';

/*
 * The workspace comes back the way it was left, torn-out windows included, because its layout is kept in the
 * project's saved layouts document under the name "workspace". The store owes that promise without getting in the
 * way: a layout dragged about writes once, after it settles, and only the latest; each write changes only the
 * workspace's entry, so any other layout kept there survives; a document it cannot read is never written over; and
 * a missing or unreadable layout is simply none, so the workspace starts from its default rather than failing to
 * start. Without a server nothing is kept.
 */
describe('LayoutStore', () =>
{
  const LAYOUT = { grid: { root: { type: 'branch', data: [] }, width: 800, height: 600 }, panels: { tree: { id: 'tree' } } };

  /**
   * A server holding the layouts document, recording every write, and a hand-driven timer.
   * @param {JsonValue | null} stored What the server holds, or null for a document never saved.
   * @returns {object} The store, the server's writes, the timer's queue and switches for failures.
   */
  const buildStore = (stored: JsonValue | null) =>
  {
    const state = { stored, failRead: false };
    const writes: JsonValue[] = [];
    const api = {
      loadEditorData: async (key: string) =>
      {
        if (state.failRead)
        {
          throw new MapEditorApiError(`GET /api/editor-data/${key} answered 500`, 500);
        }

        return structuredClone(state.stored);
      },
      saveEditorData: async (_key: string, document: JsonValue) =>
      {
        writes.push(structuredClone(document));
        state.stored = structuredClone(document);
      },
    } as unknown as MapEditorApi;
    const timers: (() => void)[] = [];
    const store = new LayoutStore({
      api,
      setTimer: callback =>
      {
        timers.push(callback);
        return timers.length;
      },
      clearTimer: handle =>
      {
        timers[(handle as number) - 1] = () => undefined;
      },
    });

    return { store, writes, timers, state };
  };

  /**
   * Runs every scheduled callback, as time passing would.
   * @param {(() => void)[]} timers The queue.
   */
  const runTimers = (timers: (() => void)[]): void =>
  {
    timers.splice(0).forEach(callback => callback());
  };

  describe('load', () =>
  {
    it('answers the saved workspace layout', async () =>
    {
      // Arrange.
      const { store } = buildStore({ schemaVersion: 1, data: { layouts: { workspace: LAYOUT } } });

      // Act.
      const loaded = await store.load();

      // Assert.
      expect(loaded)
        .toStrictEqual(LAYOUT);
    });

    it('answers none for a project that never saved one, a layout dockview could not restore, or a failed read', async () =>
    {
      // Arrange.
      const never = buildStore(null);
      const malformed = buildStore({ schemaVersion: 1, data: { layouts: { workspace: { panels: {} } } } });
      const failing = buildStore({ schemaVersion: 1, data: { layouts: { workspace: LAYOUT } } });
      failing.state.failRead = true;

      // Act.
      const loaded = [ await never.store.load(), await malformed.store.load(), await failing.store.load() ];

      // Assert.
      expect(loaded)
        .toStrictEqual([ null, null, null ]);
    });

    it('answers none, and keeps nothing, without a server', async () =>
    {
      // Arrange.
      const store = new LayoutStore({ api: null });

      // Act.
      store.save(LAYOUT);
      const loaded = await store.load();
      await store.flush();

      // Assert.
      expect(loaded)
        .toBeNull();
    });
  });

  describe('save', () =>
  {
    it('writes only the latest layout, once it settles, beside the other layouts kept there', async () =>
    {
      // Arrange.
      const { store, writes, timers } = buildStore({ schemaVersion: 1, data: { layouts: { review: { grid: {}, panels: {} } } } });
      const moved = { ...LAYOUT, activeGroup: 'maps' };

      // Act.
      store.save(LAYOUT);
      store.save(moved);
      const beforeSettling = writes.length;
      runTimers(timers);
      await store.flush();

      // Assert.
      expect([ beforeSettling, writes ])
        .toStrictEqual([ 0, [ { schemaVersion: 1, data: { layouts: { review: { grid: {}, panels: {} }, workspace: moved } } } ] ]);
    });

    it('writes at once on flush, and nothing when nothing is waiting', async () =>
    {
      // Arrange.
      const { store, writes } = buildStore(null);

      // Act.
      store.save(LAYOUT);
      await store.flush();
      await store.flush();

      // Assert.
      expect(writes)
        .toStrictEqual([ { schemaVersion: 1, data: { layouts: { workspace: LAYOUT } } } ]);
    });

    it('never writes over a document it cannot read', async () =>
    {
      // Arrange: a document saved by a newer editor.
      const { store, writes, state } = buildStore({ schemaVersion: 9, data: { layouts: {} } });

      // Act.
      store.save(LAYOUT);
      await store.flush();

      // Assert: a document from a newer editor is refused on read, so nothing is written.
      expect([ writes, state.stored ])
        .toStrictEqual([ [], { schemaVersion: 9, data: { layouts: {} } } ]);
    });

    it('keeps a copy of the layout, not the caller\'s', async () =>
    {
      // Arrange.
      const { store, writes } = buildStore(null);
      const layout = structuredClone(LAYOUT);

      // Act.
      store.save(layout);
      layout.panels.tree.id = 'changed after saving';
      await store.flush();

      // Assert.
      expect(writes)
        .toStrictEqual([ { schemaVersion: 1, data: { layouts: { workspace: LAYOUT } } } ]);
    });
  });
});

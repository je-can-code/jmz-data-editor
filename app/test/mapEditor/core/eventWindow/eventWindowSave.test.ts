import { describe, expect, it, vi } from 'vitest';
import { MAP_CONFLICT_MESSAGE, saveTargetMap } from '../../../../src/mapEditor/core/eventWindow/eventWindowSave.ts';
import { setPageOption } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { eventWindowMap, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * An event window saves the map its event lives on, and owes the author the same care the workspace's Save all takes:
 * a map with nothing unsaved is left alone, and a map flagged in conflict (its file changed on disk, or another
 * window's copy went another way, while it held unsaved edits) is never written. Writing it would put this copy over
 * the other before the author chose between them, and the map would then read as saved, leaving nothing to warn them.
 * Only a map with unsaved edits and no conflict is written, and only a written map reads as saved afterwards.
 */
describe('eventWindowSave', () =>
{
  /**
   * Builds a hub holding the fixture map over a store that keeps what it is asked to write.
   * @param {DocumentStore['save']} save What a write does; it succeeds unless told otherwise.
   * @returns {{ hub: DocumentHub, store: DocumentStore }} The hub and its store.
   */
  const hubWithStore = (save: DocumentStore['save'] = vi.fn(async () => undefined)) =>
  {
    const store: DocumentStore = { load: vi.fn(async () => eventWindowMap() as unknown as JsonValue), save };
    const hub = new DocumentHub({ clientId: 'event-window', store });
    hub.adopt('map:1', eventWindowMap() as unknown as JsonValue);
    return { hub, store };
  };

  describe('saveTargetMap', () =>
  {
    it('leaves a map with nothing unsaved alone, flagged or not, writing nothing', async () =>
    {
      // Arrange: one clean map, and one clean map flagged by a change on disk.
      const clean = hubWithStore();
      const flagged = hubWithStore();
      flagged.hub.flagConflict('map:1', { kind: 'disk', content: { changed: true } });

      // Act.
      const outcomes = [ await saveTargetMap(clean.hub, TARGET), await saveTargetMap(flagged.hub, TARGET) ];

      // Assert.
      expect([ outcomes, vi.mocked(clean.store.save).mock.calls.length, vi.mocked(flagged.store.save).mock.calls.length ])
        .toStrictEqual([ [ { ok: true, saved: false }, { ok: true, saved: false } ], 0, 0 ]);
    });

    it('holds back a map with unsaved edits waiting for a choice about changes made elsewhere, writing nothing', async () =>
    {
      // Arrange: an unsaved edit, then a change on disk flags the map.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);
      hub.flagConflict('map:1', { kind: 'disk', content: { changed: true } });

      // Act.
      const outcome = await saveTargetMap(hub, TARGET);

      // Assert: the edit is still unsaved, and the flag still stands for the author to settle.
      expect([ outcome, vi.mocked(store.save).mock.calls.length, hub.isDirty('map:1'), hub.isConflicted('map:1') ])
        .toStrictEqual([ { ok: false, message: MAP_CONFLICT_MESSAGE }, 0, true, true ]);
    });

    it('writes a map with unsaved edits and no conflict, which then reads as saved', async () =>
    {
      // Arrange.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);

      // Act.
      const outcome = await saveTargetMap(hub, TARGET);

      // Assert.
      const [ [ key, content ] ] = vi.mocked(store.save).mock.calls;
      expect([ outcome, key, (content as unknown as RmmzMap).events[2]!.pages[0].through, hub.isDirty('map:1') ])
        .toStrictEqual([ { ok: true, saved: true }, 'map:1', true, false ]);
    });

    it('fails with the write, leaving the map unsaved', async () =>
    {
      // Arrange: a store that cannot write.
      const { hub } = hubWithStore(vi.fn(async () => Promise.reject(new Error('disk full'))));
      setPageOption(hub, TARGET, 0, 'through', true);

      // Act.
      const failure = await saveTargetMap(hub, TARGET).catch((error: unknown) => (error as Error).message);

      // Assert.
      expect([ failure, hub.isDirty('map:1') ])
        .toStrictEqual([ 'disk full', true ]);
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { BLUEPRINT_NOT_WRITTEN_MESSAGE, MAP_CONFLICT_MESSAGE, saveTargetMap } from '../../../../src/mapEditor/core/eventWindow/eventWindowSave.ts';
import { renameEvent } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { setPageOption } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { openedBlueprint } from '../../support/blueprintFixtures.ts';
import { eventWindowMap, TARGET } from '../../support/eventWindowFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * An event window saves the map its event lives on, and owes the author the same care the workspace's Save all takes:
 * a map with nothing unsaved is left alone, and a map flagged in conflict (its file changed on disk, or another
 * window's copy went another way, while it held unsaved edits) is never written. Writing it would put this copy over
 * the other before the author chose between them, and the map would then read as saved, leaving nothing to warn them.
 * Only a map with unsaved edits and no conflict is written, and only a written map reads as saved afterwards; a map whose
 * file was deleted has no other copy to put this one over, so it is written, which puts the file back. Every change
 * to a blueprint on its way to the map's file lands first, so the save goes on top of what such a change wrote, never
 * under it; a map those writes leave holding what its file holds needs no save of its own.
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

    it('writes a map whose file was deleted straight back, its edit with it, and the conflict over it goes', async () =>
    {
      // Arrange: an unsaved edit, then the map's file deleted from disk.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);
      hub.applyOutsideContent('map:1', null);
      const flagged = hub.conflict('map:1');

      // Act.
      const outcome = await saveTargetMap(hub, TARGET);

      // Assert: the file is written back holding the edit, and the map reads as saved with nothing left to settle.
      const [ [ key, content ] ] = vi.mocked(store.save).mock.calls;
      expect([ flagged, outcome, key, (content as unknown as RmmzMap).events[2]!.pages[0].through, hub.isDirty('map:1'), hub.conflict('map:1') ])
        .toStrictEqual([ { kind: 'disk', content: null }, { ok: true, saved: true }, 'map:1', true, false, null ]);
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

    it('waits for every change to a blueprint on its way before writing a map, writing it after they land', async () =>
    {
      // Arrange: an unsaved edit, and changes to a blueprint on their way, whose landing is recorded.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);
      const order: string[] = [];
      vi.mocked(store.save).mockImplementation(async () =>
      {
        order.push('saved');
      });
      const written = async () =>
      {
        order.push('landed');
      };

      // Act.
      const outcome = await saveTargetMap(hub, TARGET, written);

      // Assert.
      expect([ outcome, order, hub.isDirty('map:1') ])
        .toStrictEqual([ { ok: true, saved: true }, [ 'landed', 'saved' ], false ]);
    });

    it('writes nothing for a map the changes on their way leave holding what its file holds', async () =>
    {
      // Arrange: an unsaved edit, and a change on its way whose write leaves the file holding that very edit.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);
      const written = async () =>
      {
        hub.noteWritten('map:1', hub.committedContent('map:1'));
      };

      // Act.
      const outcome = await saveTargetMap(hub, TARGET, written);

      // Assert.
      expect([ outcome, vi.mocked(store.save).mock.calls.length, hub.isDirty('map:1') ])
        .toStrictEqual([ { ok: true, saved: false }, 0, false ]);
    });

    it('holds back a map the changes on their way leave waiting for a choice, writing nothing', async () =>
    {
      // Arrange: an unsaved edit, and a change on its way, during which the map is flagged.
      const { hub, store } = hubWithStore();
      setPageOption(hub, TARGET, 0, 'through', true);
      const written = async () =>
      {
        hub.flagConflict('map:1', { kind: 'disk', content: { changed: true } });
      };

      // Act.
      const outcome = await saveTargetMap(hub, TARGET, written);

      // Assert.
      expect([ outcome, vi.mocked(store.save).mock.calls.length, hub.isDirty('map:1') ])
        .toStrictEqual([ { ok: false, message: MAP_CONFLICT_MESSAGE }, 0, true ]);
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

    it('saves an event of a blueprint by waiting for its changes to be written, saying so when one is not', async () =>
    {
      // Arrange: three camps opened as maps: one changed whose write lands, one changed in a window writing nothing, and
      // one left as it was.
      const written = openedBlueprint('k3x9q2mf', stampOf());
      const unwritten = openedBlueprint('k3x9q2mf', stampOf());
      const clean = openedBlueprint('k3x9q2mf', stampOf());
      renameEvent(written.hub, { mapId: written.mapId, eventId: 1 }, 'Guard');
      renameEvent(unwritten.hub, { mapId: unwritten.mapId, eventId: 1 }, 'Guard');
      const land = async () =>
      {
        written.hub.noteWritten(written.map.key, written.hub.committedContent(written.map.key));
      };

      // Act.
      const outcomes = [
        await saveTargetMap(written.hub, { mapId: written.mapId, eventId: 1 }, land),
        await saveTargetMap(unwritten.hub, { mapId: unwritten.mapId, eventId: 1 }),
        await saveTargetMap(clean.hub, { mapId: clean.mapId, eventId: 1 }, land),
      ];

      // Assert: the unwritten change stays, unsaved.
      expect([ outcomes, written.hub.isDirty(written.map.key), unwritten.hub.isDirty(unwritten.map.key), unwritten.map.event(1)?.name ])
        .toStrictEqual([ [ { ok: true, saved: true }, { ok: false, message: BLUEPRINT_NOT_WRITTEN_MESSAGE }, { ok: true, saved: false } ], false, true, 'Guard' ]);
    });
  });
});

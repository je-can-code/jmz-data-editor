import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueprintCopyCounter } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { deleteBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { SyncPeer } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { storedBlueprints } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { MemoryChannelNetwork } from '../../support/standIns.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * A copy of a blueprint placed in one window and not saved yet stands on a map another window may never have opened,
 * and that other window must still count it: a delete there trusting the disk alone would take the blueprint away from
 * under it. The windows' own sync answers the question as it is: each window says which maps it holds, and a window can
 * look at another's copy without holding it. So, over the real sync between two windows, window A counts the copy window
 * B placed on map 5, which A never opened, and refuses to delete the blueprint, naming the map; once B lets the map go
 * without saving, A counts map 5 as the disk has it, holding no copy, and the blueprint may go.
 *
 * Both windows hold the blueprints, where "Goblin camp" is k3x9q2mf; map 5 on disk holds one event and no copy.
 */
describe('blueprint copies across windows', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] });
  });

  afterEach(() =>
  {
    vi.useRealTimers();
  });

  /**
   * Delivers messages and settles the promises and timers they start, until the windows are quiet.
   * @param {MemoryChannelNetwork} network The network between the windows.
   */
  const settle = async (network: MemoryChannelNetwork): Promise<void> =>
  {
    for (let round = 0; round < 10; round++)
    {
      network.flush();
      await vi.advanceTimersByTimeAsync(25);
    }
  };

  /**
   * One window on the network, holding the blueprints as the file has them.
   * @param {MemoryChannelNetwork} network The network.
   * @param {string} clientId The window's id.
   * @returns {{ hub: DocumentHub, peer: SyncPeer }} The window's documents and its link to the others.
   */
  const windowOn = (network: MemoryChannelNetwork, clientId: string) =>
  {
    const hub = new DocumentHub({ clientId });
    hub.adopt(BLUEPRINTS_DOCUMENT, storedBlueprints({ k3x9q2mf: { name: 'Goblin camp', stamp: stampOf({ mapId: 5 }) } }) as JsonValue);
    const peer = new SyncPeer({ hub, channel: network.open('jmz-sync'), heartbeatMs: 0, snapshotTimeoutMs: 50, discoveryMs: 20 });
    peer.start();
    return { hub, peer };
  };

  it('counts a copy another window placed on a map this one never opened, and lets the blueprint go once that window lets the map go', async () =>
  {
    // Arrange: window B opens map 5 and places a copy of the camp there, unsaved; window A counts, never opening map 5.
    const network = new MemoryChannelNetwork();
    const first = windowOn(network, 'window-a');
    const second = windowOn(network, 'window-b');
    second.hub.adopt('map:5', mapWithEvents(4, 3, [ null, [ 0, 0 ] ]) as unknown as JsonValue);
    placeBlueprint(second.hub, 5, 'k3x9q2mf', { at: { x: 2, y: 1 }, shaping: 'auto', mode: 1, linkRefusal: null });
    const counter = new BlueprintCopyCounter({ hub: first.hub, readNotes: async () => [], sync: first.peer });
    await settle(network);

    // Act: A counts; then B lets map 5 go without saving.
    counter.start();
    await settle(network);
    const counted = counter.countOf('k3x9q2mf');
    const refused = deleteBlueprint(first.hub, 'k3x9q2mf', counted, mapId => `Map ${mapId}`);
    second.hub.release('map:5');
    await settle(network);

    // Assert.
    expect([ first.hub.has('map:5'), counted, refused, counter.countOf('k3x9q2mf') ])
      .toStrictEqual([
        false,
        { total: 1, maps: [ { mapId: 5, copies: 1 } ] },
        { ok: false, message: '"Goblin camp" still has 1 copy, on Map 5 (1), so it can\'t be deleted.' },
        { total: 0, maps: [] },
      ]);
    counter.stop();
    first.peer.stop();
    second.peer.stop();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { BlueprintCopyCounter, type BlueprintCopyCount, type EventNote } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { deleteBlueprint, renameBlueprint, saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { blueprintsKeptGuard } from '../../../../src/mapEditor/core/blueprints/blueprintMoves.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { drawsFor, holdBlueprints, storedBlueprints } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * No undo, redo or history jump takes away a blueprint something is still a copy of: every copy names it, and a
 * blueprint gone once the window closes is gone for good, leaving its copies naming nothing. So a move that would take a
 * blueprint away is refused in the very words a delete of it is, since that is what the move would be: undoing its
 * save, redoing its delete, or undoing a change to the blueprints' file made outside the editor that brought it. It is
 * refused while copies stand on any map, and while they are still being counted, or counted again after a map changed
 * on disk, or cannot be, since it could have copies nobody has counted yet; a guard that needs a count starts the
 * counting. A blueprint nothing is a copy of may go. A move that takes no blueprint away passes, whatever the copies, as
 * a rename's undo does, and so does a step that touches no blueprint at all, without asking for a count. A step whose
 * patches no longer fit the blueprints as they stand is the hub's to refuse, in its own words.
 *
 * The window holds the blueprints and map 3; "Goblin camp" is k3x9q2mf.
 */
describe('blueprintsKeptGuard', () =>
{
  /**
   * Names the maps a refusal speaks of.
   * @param {number} mapId The map.
   * @returns {string} Its name.
   */
  const mapName = (mapId: number): string => `Map ${mapId}`;

  /**
   * A window holding the blueprints, with none kept yet, and map 3.
   * @returns {DocumentHub} The window's documents.
   */
  const windowWithBlueprints = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(hub);
    hub.adopt('map:3', mapWithEvents(4, 3, [ null, [ 0, 0 ] ]) as unknown as JsonValue);
    return hub;
  };

  /**
   * Saves the camp as a blueprint in a window.
   * @param {DocumentHub} hub The window's documents.
   * @returns {HistoryStep} The save's step.
   */
  const saveCamp = (hub: DocumentHub): HistoryStep =>
  {
    const outcome = saveBlueprint(hub, stampOf({ mapId: 3 }), 'Goblin camp', drawsFor([ 'k3x9q2mf' ]));
    return (outcome.ok && outcome.step) as HistoryStep;
  };

  /**
   * A count of copies that says the same of every blueprint, writing down whether counting was started.
   * @param {BlueprintCopyCount | null} count What it says; null while the copies cannot be told.
   * @returns {{ start: ReturnType<typeof vi.fn>, countOf: ReturnType<typeof vi.fn> }} The count.
   */
  const counting = (count: BlueprintCopyCount | null) => ({ start: vi.fn(), countOf: vi.fn(() => count) });

  /**
   * Two copies of the camp, both on map 3.
   */
  const TWO_ON_MAP_3: BlueprintCopyCount = { total: 2, maps: [ { mapId: 3, copies: 2 } ] };

  it('refuses undoing a blueprint\'s save while copies name it, in the words a delete of it is refused in', () =>
  {
    // Arrange.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);
    const copies = counting(TWO_ON_MAP_3);

    // Act.
    const refusal = blueprintsKeptGuard(hub, copies, mapName)(save, 'backward');

    // Assert: the counting started, and the camp is still kept.
    expect([ refusal, copies.start.mock.calls.length, copies.countOf.mock.calls ])
      .toStrictEqual([ '"Goblin camp" still has 2 linked events, on Map 3, so it can\'t be deleted', 1, [ [ 'k3x9q2mf' ] ] ]);
  });

  it('refuses redoing a blueprint\'s delete once copies name it again', () =>
  {
    // Arrange: the camp deleted with no copies, the delete undone, and copies placed since.
    const hub = windowWithBlueprints();
    saveCamp(hub);
    const deleted = deleteBlueprint(hub, 'k3x9q2mf', { total: 0, maps: [] }, mapName);
    hub.undo(blueprintHistoryKey('k3x9q2mf'));

    // Act.
    const refusal = blueprintsKeptGuard(hub, counting(TWO_ON_MAP_3), mapName)((deleted.ok && deleted.step) as HistoryStep, 'forward');

    // Assert.
    expect(refusal)
      .toBe('"Goblin camp" still has 2 linked events, on Map 3, so it can\'t be deleted');
  });

  it('refuses taking a blueprint away while its copies are still being counted, or cannot be', () =>
  {
    // Arrange.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);

    // Act.
    const refusal = blueprintsKeptGuard(hub, counting(null), mapName)(save, 'backward');

    // Assert.
    expect(refusal)
      .toBe('"Goblin camp" can\'t be deleted until its linked events have been counted');
  });

  it('lets a blueprint nothing is a copy of go', () =>
  {
    // Arrange.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);

    // Act.
    const refusal = blueprintsKeptGuard(hub, counting({ total: 0, maps: [] }), mapName)(save, 'backward');

    // Assert.
    expect(refusal)
      .toBeNull();
  });

  it('passes every move that takes no blueprint away, whatever its copies: a rename\'s undo and redo, a save\'s redo, a delete\'s undo', () =>
  {
    // Arrange: the camp saved and renamed; then a second blueprint saved and deleted.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);
    const renamed = renameBlueprint(hub, 'k3x9q2mf', 'Goblin den');
    const rename = (renamed.ok && renamed.step) as HistoryStep;
    saveBlueprint(hub, stampOf({ mapId: 3 }), 'Bat roost', drawsFor([ 'aa22aa22' ]));
    const deleted = deleteBlueprint(hub, 'aa22aa22', { total: 0, maps: [] }, mapName);
    const remove = (deleted.ok && deleted.step) as HistoryStep;
    const copies = counting(TWO_ON_MAP_3);
    const guard = blueprintsKeptGuard(hub, copies, mapName);

    // Act: the rename's undo and redo and the delete's undo judged as the histories stand; then the camp's rename and save
    // undone, and the save's redo judged.
    const moves = [ guard(rename, 'backward'), guard(rename, 'forward'), guard(remove, 'backward') ];
    hub.undo(blueprintHistoryKey('k3x9q2mf'));
    hub.undo(blueprintHistoryKey('k3x9q2mf'));
    moves.push(guard(save, 'forward'));

    // Assert: no count was ever needed.
    expect([ moves, copies.start.mock.calls.length ])
      .toStrictEqual([ [ null, null, null, null ], 0 ]);
  });

  it('passes a step that touches no blueprint without asking for any count', () =>
  {
    // Arrange: a map renamed.
    const hub = windowWithBlueprints();
    const step = hub.edit('Rename map', [ mapHistoryKey(3) ], tx => tx.set('map:3', [ 'displayName' ], 'Harbor')) as HistoryStep;
    const copies = counting(TWO_ON_MAP_3);

    // Act.
    const refusal = blueprintsKeptGuard(hub, copies, mapName)(step, 'backward');

    // Assert.
    expect([ refusal, copies.start.mock.calls.length, copies.countOf.mock.calls.length ])
      .toStrictEqual([ null, 0, 0 ]);
  });

  it('refuses undoing a change made outside the editor that brought a blueprint copies now name', () =>
  {
    // Arrange: the blueprints' file gains the camp from somewhere else, taken as one step in the blueprints' own history.
    const hub = windowWithBlueprints();
    hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, storedBlueprints({ k3x9q2mf: { name: 'Goblin camp', stamp: stampOf({ mapId: 3 }) } }) as JsonValue);
    const outside = hub.canUndo(BLUEPRINTS_DOCUMENT);
    const step = (outside.ok && outside.step) as HistoryStep;

    // Act.
    const refusal = blueprintsKeptGuard(hub, counting(TWO_ON_MAP_3), mapName)(step, 'backward');

    // Assert.
    expect([ step.label, refusal ])
      .toStrictEqual([ 'Externally modified', '"Goblin camp" still has 2 linked events, on Map 3, so it can\'t be deleted' ]);
  });

  it('leaves a step whose patches no longer fit the blueprints to the hub, which refuses it in its own words', () =>
  {
    // Arrange: the camp renamed behind the history's back, so undoing its save no longer finds what it saved.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);
    hub.document(BLUEPRINTS_DOCUMENT).apply({ kind: 'set', path: [ 'data', 'blueprints', 'k3x9q2mf', 'name' ], before: 'Goblin camp', after: 'Imp' });

    // Act.
    const refusal = blueprintsKeptGuard(hub, counting(TWO_ON_MAP_3), mapName)(save, 'backward');

    // Assert.
    expect(refusal)
      .toBeNull();
  });

  it('refuses while the copies are counted again after a map changed on disk, then judges by the new count once it lands', async () =>
  {
    // Arrange: the first reading finds no copy; then map 5, which this window does not hold, is saved elsewhere holding
    // one, and the reading asked for then answers only when told.
    const hub = windowWithBlueprints();
    const save = saveCamp(hub);
    const answers: ((notes: readonly EventNote[]) => void)[] = [];
    let readings = 0;
    const counter = new BlueprintCopyCounter({
      hub,
      readNotes: () =>
      {
        readings += 1;
        return readings === 1
          ? Promise.resolve([])
          : new Promise(resolve =>
          {
            answers.push(resolve);
          });
      },
    });
    counter.start();
    await counter.settled();
    const guard = blueprintsKeptGuard(hub, counter, mapName);
    const before = guard(save, 'backward');

    // Act.
    counter.fileChanged('data/Map005.json');
    const whileCounting = guard(save, 'backward');
    await vi.waitFor(() => expect(answers)
      .toHaveLength(1));
    answers[0]([ { mapId: 5, eventId: 2, note: '<blueprint:[k3x9q2mf, 1]>' } ]);
    await counter.settled();

    // Assert: free to go before the copy was saved, held while counting, and held by the copy once counted.
    expect([ before, whileCounting, guard(save, 'backward') ])
      .toStrictEqual([
        null,
        '"Goblin camp" can\'t be deleted until its linked events have been counted',
        '"Goblin camp" still has 1 linked event, on Map 5, so it can\'t be deleted',
      ]);
  });
});

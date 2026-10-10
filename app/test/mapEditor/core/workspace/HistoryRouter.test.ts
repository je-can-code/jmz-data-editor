import { describe, expect, it, vi } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey, TREE_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { MapTreeService } from '../../../../src/mapEditor/core/tree/MapTreeService.ts';
import { HistoryRouter, type MoveGuard } from '../../../../src/mapEditor/core/workspace/HistoryRouter.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Undo follows focus, and the router is what makes that safe: it owes every history exactly one owner. The map
 * tree's steps carry whole map files that only the tree service writes, so an undo, redo or jump of the tree
 * history always goes to the tree service and never to the hub directly, which would move the tree without its
 * files. Every other history goes to the hub. An empty direction is a quiet failure a keypress should not nag
 * about; a step a later edit blocks is named, so the history panel can offer to forget it.
 *
 * A step the hub would move must also pass the window's guard, which may refuse it for what moving it would do, such as
 * taking away a blueprint its copies still name: the refusal is worded and reported as a blocked step's is, the step
 * named as stuck, and nothing moves. The guard is asked only about steps the hub would move, so the hub's own refusals
 * keep their words. A jump moves one undo or redo at a time through the same checks, stopping at the first step that
 * cannot move, having moved those before it.
 *
 * A step that leaves parts of itself as they stand, a blueprint's change leaving copies changed since, moves all the
 * same: the guard is asked about the part that would move, and the author is told what was left, in the window's words.
 */
describe('HistoryRouter', () =>
{
  /**
   * A hub holding two maps, and a tree service stand-in whose every call is a spy.
   * @returns {object} The router, the hub and the stand-in.
   */
  const buildRouter = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    hub.adopt('mapinfos', [ null, { id: 1, expanded: false, name: 'A', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ]);
    const tree = {
      undo: vi.fn(async () => ({ ok: true, step: null, selection: [] })),
      redo: vi.fn(async () => ({ ok: false, message: 'map 4 has changed since' })),
      jumpTo: vi.fn(async () => ({ ok: true, step: null, selection: [] })),
    };
    const router = new HistoryRouter(hub, tree as unknown as MapTreeService);
    return { router, hub, tree };
  };

  /**
   * Records a tree step straight on the hub, standing in for one the tree service made.
   * @param {DocumentHub} hub The hub.
   */
  const recordTreeStep = (hub: DocumentHub): void =>
  {
    hub.edit('Rename "A"', [ TREE_HISTORY_KEY ], tx => tx.set('mapinfos', [ 1, 'name' ], 'B'));
  };

  it('sends the tree\'s undo to the tree service and leaves the hub\'s history alone', async () =>
  {
    // Arrange.
    const { router, hub, tree } = buildRouter();
    recordTreeStep(hub);

    // Act.
    const outcome = await router.undo(TREE_HISTORY_KEY);

    // Assert: the hub never moved the step itself.
    expect([ outcome, tree.undo.mock.calls.length, hub.history(TREE_HISTORY_KEY).position ])
      .toStrictEqual([ { ok: true }, 1, 1 ]);
  });

  it('passes on the tree service\'s refusal of a redo, in its words', async () =>
  {
    // Arrange.
    const { router, hub } = buildRouter();
    recordTreeStep(hub);
    hub.undo(TREE_HISTORY_KEY);

    // Act.
    const outcome = await router.redo(TREE_HISTORY_KEY);

    // Assert.
    expect(outcome)
      .toStrictEqual({ ok: false, nothing: false, message: 'map 4 has changed since', stuckStepId: null });
  });

  it('passes on the tree service\'s alarm, so a failed write it could not put back stays on screen', async () =>
  {
    // Arrange.
    const { router, hub, tree } = buildRouter();
    recordTreeStep(hub);
    tree.undo.mockResolvedValueOnce({ ok: false, message: 'map 2 is missing', alarm: true } as never);

    // Act.
    const outcome = await router.undo(TREE_HISTORY_KEY);

    // Assert.
    expect(outcome)
      .toStrictEqual({ ok: false, nothing: false, message: 'map 2 is missing', stuckStepId: null, alarm: true });
  });

  it('keeps an empty tree history quiet without asking the tree service', async () =>
  {
    // Arrange.
    const { router, tree } = buildRouter();

    // Act.
    const outcome = await router.undo(TREE_HISTORY_KEY);

    // Assert.
    expect([ outcome, tree.undo.mock.calls.length ])
      .toStrictEqual([ { ok: false, nothing: true, message: 'Nothing to undo.', stuckStepId: null }, 0 ]);
  });

  it('sends a tree jump to the tree service', async () =>
  {
    // Arrange.
    const { router, tree } = buildRouter();

    // Act.
    const outcome = await router.jumpTo(TREE_HISTORY_KEY, null);

    // Assert.
    expect([ outcome, tree.jumpTo.mock.calls ])
      .toStrictEqual([ { ok: true }, [ [ null ] ] ]);
  });

  it('undoes and redoes a map\'s history on the hub, never touching the tree service', async () =>
  {
    // Arrange.
    const { router, hub, tree } = buildRouter();
    hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));

    // Act.
    const undone = await router.undo(mapHistoryKey(1));
    const nameAfterUndo = hub.map('map:1').property('displayName');
    const redone = await router.redo(mapHistoryKey(1));

    // Assert.
    expect([ undone, nameAfterUndo, redone, hub.map('map:1').property('displayName'), tree.undo.mock.calls.length ])
      .toStrictEqual([ { ok: true }, 'Test Town', { ok: true }, 'Harbor', 0 ]);
  });

  it('names the later edit that blocks an undo, and the step that is stuck', async () =>
  {
    // Arrange: two histories on one map change the same field.
    const { router, hub } = buildRouter();
    const stuck = hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    hub.edit('Rename from the event', [ 'event:1:1' ], tx => tx.set('map:1', [ 'displayName' ], 'Port'));

    // Act.
    const outcome = await router.undo(mapHistoryKey(1));

    // Assert.
    expect(outcome)
      .toStrictEqual({
        ok: false,
        nothing: false,
        message: '"Rename map" cannot be undone: "Rename from the event" later changed what "Rename map" changed.',
        stuckStepId: stuck?.id,
      });
  });

  it('says which other document a step needs open to undo', async () =>
  {
    // Arrange: a step across both maps, one of which this window then lets go.
    const { router, hub } = buildRouter();
    hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
    {
      tx.set('map:1', [ 'displayName' ], 'Near side');
      tx.set('map:2', [ 'displayName' ], 'Far side');
    });
    hub.release('map:2');

    // Act.
    const outcome = await router.undo(mapHistoryKey(1));

    // Assert.
    expect(outcome)
      .toStrictEqual({ ok: false, nothing: false, message: '"Place door pair" also changed Map 2; open it to have it undone.', stuckStepId: null });
  });

  it('jumps a map\'s history on the hub, and reports a jump forward that stops partway as a redo', async () =>
  {
    // Arrange: the second step is blocked from redoing by an edit made after both were undone.
    const { router, hub } = buildRouter();
    hub.edit('First', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'note' ], 'one'));
    const second = hub.edit('Second', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    await router.jumpTo(mapHistoryKey(1), null);
    hub.edit('Elsewhere', [ 'event:1:1' ], tx => tx.set('map:1', [ 'displayName' ], 'Port'));

    // Act.
    const outcome = await router.jumpTo(mapHistoryKey(1), second?.id ?? null);

    // Assert: the first step redid; the second could not.
    expect([ outcome.ok === false && outcome.message, hub.map('map:1').property('note') ])
      .toStrictEqual([ '"Second" cannot be redone: "Elsewhere" changed what "Second" changes.', 'one' ]);
  });

  it('forgets a stuck step on request', async () =>
  {
    // Arrange.
    const { router, hub } = buildRouter();
    const step = hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));

    // Act.
    const forgotten = [ router.forget(step?.id ?? ''), router.forget('never#1') ];

    // Assert.
    expect([ forgotten, hub.history(mapHistoryKey(1)).rows ])
      .toStrictEqual([ [ true, false ], [] ]);
  });

  /**
   * A guard refusing every move of one step, in fixed words, and writing down every step and way it was asked about.
   * @param {() => string | undefined} refused The id of the step it refuses, read when asked.
   * @returns {{ guard: MoveGuard, asked: string[] }} The guard, and what it was asked, as "label way".
   */
  const guardRefusing = (refused: () => string | undefined) =>
  {
    const asked: string[] = [];
    const guard: MoveGuard = (step, direction) =>
    {
      asked.push(`${step.label} ${direction}`);
      return step.id === refused() ? '"Goblin camp" still has 2 copies, on Map 3 (2), so it can\'t be deleted' : null;
    };

    return { guard, asked };
  };

  it('refuses an undo and a redo its guard refuses, naming the step as stuck in the guard\'s words, and moves nothing', async () =>
  {
    // Arrange: a map rename the guard refuses to move either way; its redo is reached by undoing it on the hub itself.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    const step = hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    const { guard } = guardRefusing(() => step?.id);
    const router = new HistoryRouter(hub, null, guard);

    // Act.
    const undo = await router.undo(mapHistoryKey(1));
    const named = hub.map('map:1').property('displayName');
    hub.undo(mapHistoryKey(1));
    const redo = await router.redo(mapHistoryKey(1));

    // Assert.
    const words = '"Goblin camp" still has 2 copies, on Map 3 (2), so it can\'t be deleted.';
    expect([ undo, named, redo, hub.map('map:1').property('displayName') ])
      .toStrictEqual([
        { ok: false, nothing: false, message: `"Rename map" cannot be undone: ${words}`, stuckStepId: step?.id },
        'Harbor',
        { ok: false, nothing: false, message: `"Rename map" cannot be redone: ${words}`, stuckStepId: step?.id },
        'Test Town',
      ]);
  });

  it('asks its guard only about a step the hub would move, leaving the hub\'s own refusals in its words', async () =>
  {
    // Arrange: a map rename a later edit blocks, and an empty history beside it.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    hub.edit('Rename from the event', [ 'event:1:1' ], tx => tx.set('map:1', [ 'displayName' ], 'Port'));
    const { guard, asked } = guardRefusing(() => undefined);
    const router = new HistoryRouter(hub, null, guard);

    // Act.
    const blocked = await router.undo(mapHistoryKey(1));
    const empty = await router.redo(mapHistoryKey(1));

    // Assert.
    expect([ blocked.ok === false && blocked.message, empty.ok === false && empty.nothing, asked ])
      .toStrictEqual([ '"Rename map" cannot be undone: "Rename from the event" later changed what "Rename map" changed.', true, [] ]);
  });

  it('stops a jump at the step its guard refuses, having moved every step after it, and asking about none before it', async () =>
  {
    // Arrange: three steps on map 1, the guard refusing to undo the second.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.edit('First', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'note' ], 'one'));
    const second = hub.edit('Second', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    hub.edit('Third', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'note' ], 'three'));
    const { guard, asked } = guardRefusing(() => second?.id);
    const router = new HistoryRouter(hub, null, guard);

    // Act: a jump back to the start.
    const outcome = await router.jumpTo(mapHistoryKey(1), null);

    // Assert: the third undone, the second refused, the first never reached.
    expect([ outcome.ok === false && outcome.stuckStepId === second?.id, hub.history(mapHistoryKey(1)).position, hub.map('map:1').property('note'), asked ])
      .toStrictEqual([ true, 2, 'one', [ 'Third backward', 'Second backward' ] ]);
  });

  it('jumps forward one redo at a time through its guard, and finds nothing to jump to for a step its history does not hold', async () =>
  {
    // Arrange: two steps on map 1, both undone.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.edit('First', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'note' ], 'one'));
    const second = hub.edit('Second', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    hub.undo(mapHistoryKey(1));
    hub.undo(mapHistoryKey(1));
    const { guard, asked } = guardRefusing(() => undefined);
    const router = new HistoryRouter(hub, null, guard);

    // Act.
    const forward = await router.jumpTo(mapHistoryKey(1), second?.id ?? null);
    const unknown = await router.jumpTo(mapHistoryKey(1), 'never#1');

    // Assert.
    expect([ forward, hub.history(mapHistoryKey(1)).position, asked, unknown ])
      .toStrictEqual([
        { ok: true },
        2,
        [ 'First forward', 'Second forward' ],
        { ok: false, nothing: true, message: 'Nothing to undo.', stuckStepId: null },
      ]);
  });

  /**
   * A hub holding two maps, with a step renaming both maps' doors that marks both maps as following it, as a blueprint's
   * change does, and map 1's door renamed again by hand since, so undoing the step leaves map 1's door as it stands.
   * @returns {DocumentHub} The hub.
   */
  const buildLeavingHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    hub.edit('Rename doors', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
    {
      tx.set('map:1', [ 'events', 1, 'name' ], 'Gate');
      tx.set('map:2', [ 'events', 1, 'name' ], 'Gate');
      tx.markFollower('map:1');
      tx.markFollower('map:2');
    });
    hub.edit('Rename by hand', [ 'event:1:1' ], tx => tx.set('map:1', [ 'events', 1, 'name' ], 'Front door'));
    return hub;
  };

  it('moves a step that leaves parts of itself, and tells the author what it left, in the window\'s words', async () =>
  {
    // Arrange.
    const hub = buildLeavingHub();
    const told: unknown[] = [];
    const router = new HistoryRouter(hub, null, null, (step, left, direction) =>
    {
      told.push([ step.entries.map(entry => entry.document), left.map(part => part.document), direction ]);
      return 'Undone, except on 1 copy changed since.';
    });

    // Act.
    const outcome = await router.undo(mapHistoryKey(2));

    // Assert.
    expect([ outcome, told, hub.map('map:2').event(1)?.name, hub.map('map:1').event(1)?.name ])
      .toStrictEqual([ { ok: true, message: 'Undone, except on 1 copy changed since.' }, [ [ [ 'map:2' ], [ 'map:1' ], 'backward' ] ], 'Door', 'Front door' ]);
  });

  it('asks its guard about the part of a step that would move, not the whole of it', async () =>
  {
    // Arrange.
    const hub = buildLeavingHub();
    const asked: string[][] = [];
    const router = new HistoryRouter(hub, null, step =>
    {
      asked.push(step.entries.map(entry => entry.document));
      return null;
    });

    // Act.
    const outcome = await router.undo(mapHistoryKey(2));

    // Assert: with no words given, the move is told as any other.
    expect([ outcome, asked ])
      .toStrictEqual([ { ok: true }, [ [ 'map:2' ] ] ]);
  });

  it('tells what the last move of a jump to leave parts of its step left', async () =>
  {
    // Arrange: a plain step on map 2 after the step that leaves parts.
    const hub = buildLeavingHub();
    hub.edit('Note', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'note' ], 'later'));
    const router = new HistoryRouter(hub, null, null, (_step, left) => `left ${left.length}`);

    // Act.
    const outcome = await router.jumpTo(mapHistoryKey(2), null);

    // Assert.
    expect([ outcome, hub.history(mapHistoryKey(2)).position ])
      .toStrictEqual([ { ok: true, message: 'left 1' }, 0 ]);
  });

  /*
   * A refusal naming a map names it as the map tree shows it, by the name the window gives it, never by the key the
   * window keeps it under: "map:3" means nothing to the author, and "Map 3" makes them look the map up by its id. A map
   * the tree gives no name is named by its id, as the tree shows it, and anything else by its label.
   */
  describe('naming maps', () =>
  {
    /**
     * Names maps 1 and 2 as a tree would, giving map 3 no name.
     * @param {number} mapId The map.
     * @returns {string} Its name; nothing for map 3, or any map the tree does not list.
     */
    const treeName = (mapId: number): string => ({ 1: 'Riverside Stroll', 2: 'Harbor Inn', 3: ' ' } as Record<number, string>)[mapId] ?? '';

    /**
     * Records a door pair across maps 1 and 2 on a hub holding both, and the blueprints.
     * @returns {DocumentHub} The hub.
     */
    const buildPairedHub = (): DocumentHub =>
    {
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
      hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set('map:1', [ 'displayName' ], 'Near side');
        tx.set('map:2', [ 'displayName' ], 'Far side');
      });
      return hub;
    };

    it('names every other document a step needs open, a map as the tree shows it, one the tree names nothing by its id', async () =>
    {
      // Arrange: a step across three maps and the blueprints, all but map 1 then let go of.
      const hub = new DocumentHub({ clientId: 'window-a' });
      const maps: DocumentKey[] = [ 'map:1', 'map:2', 'map:3' ];
      const letGo: DocumentKey[] = [ 'map:2', 'map:3', 'editor-data:blueprints' ];
      maps.forEach(key => hub.adopt(key, buildMapJson() as unknown as JsonValue));
      hub.adopt('editor-data:blueprints', { schemaVersion: 1, data: { blueprints: {} } });
      hub.edit('Place doors', [ mapHistoryKey(1) ], tx =>
      {
        maps.forEach(key => tx.set(key, [ 'note' ], 'door'));
        tx.set('editor-data:blueprints', [ 'data', 'blueprints', 'k3x9q2mf' ], { name: 'Door' });
      });
      letGo.forEach(key => hub.release(key));
      const router = new HistoryRouter(hub, null, null, null, treeName);

      // Act.
      const outcome = await router.undo(mapHistoryKey(1));

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, nothing: false, message: '"Place doors" also changed Harbor Inn, Map 3, Blueprints; open it to have it undone.', stuckStepId: null });
    });

    it('names a map whose copy does not record a step it would undo as the tree shows it, and by its label with no naming given', async () =>
    {
      // Arrange: map 1 let go of and opened again from its file, which records nothing of the pair.
      const hub = buildPairedHub();
      const onDisk = hub.committedContent('map:1');
      hub.release('map:1');
      hub.adopt('map:1', onDisk);
      const named = new HistoryRouter(hub, null, null, null, treeName);
      const unnamed = new HistoryRouter(hub, null);

      // Act.
      const outcomes = [ await named.undo(mapHistoryKey(2)), await unnamed.undo(mapHistoryKey(2)) ];

      // Assert.
      expect(outcomes.map(outcome => outcome.ok === false && outcome.message))
        .toStrictEqual([
          '"Place door pair" cannot be undone: this window cannot tell what changed in Riverside Stroll after "Place door pair".',
          '"Place door pair" cannot be undone: this window cannot tell what changed in Map 1 after "Place door pair".',
        ]);
    });

    it('names a map whose record does not reach back to a step\'s undo as the tree shows it, for a redo', async () =>
    {
      // Arrange: the pair undone, then map 2 taken back from a copy recording nothing since.
      const hub = buildPairedHub();
      hub.undo(mapHistoryKey(1));
      hub.adoptSnapshot({ ...structuredClone(hub.snapshot('map:2')), moves: [] });
      const router = new HistoryRouter(hub, null, null, null, treeName);

      // Act.
      const outcome = await router.redo(mapHistoryKey(1));

      // Assert.
      expect(outcome.ok === false && outcome.message)
        .toBe('"Place door pair" cannot be redone: this window cannot tell what changed in Harbor Inn since "Place door pair" was undone.');
    });

    it('hands its guard how it names a map, so the guard\'s refusal names one as the tree shows it', async () =>
    {
      // Arrange: a guard refusing every move, naming map 2 by what it is handed.
      const hub = buildPairedHub();
      const router = new HistoryRouter(hub, null, (_step, _direction, mapName) => `${mapName(2)} changed on disk since this was written to it`, null, treeName);

      // Act.
      const outcome = await router.undo(mapHistoryKey(1));

      // Assert.
      expect(outcome.ok === false && outcome.message)
        .toBe('"Place door pair" cannot be undone: Harbor Inn changed on disk since this was written to it.');
    });
  });

  it('refuses to move the tree without a tree service', async () =>
  {
    // Arrange.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('mapinfos', [ null, { id: 1, expanded: false, name: 'A', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ]);
    recordTreeStep(hub);
    const router = new HistoryRouter(hub, null);

    // Act.
    const attempt = router.undo(TREE_HISTORY_KEY);

    // Assert.
    await expect(attempt)
      .rejects.toThrow('the map tree cannot change without a server to write it to');
  });
});

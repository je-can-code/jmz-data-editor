import { describe, expect, it, vi } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey, TREE_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { MapTreeService } from '../../../../src/mapEditor/core/tree/MapTreeService.ts';
import { HistoryRouter } from '../../../../src/mapEditor/core/workspace/HistoryRouter.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Undo follows focus, and the router is what makes that safe: it owes every history exactly one owner. The map
 * tree's steps carry whole map files that only the tree service writes, so an undo, redo or jump of the tree
 * history always goes to the tree service and never to the hub directly, which would move the tree without its
 * files. Every other history goes to the hub. An empty direction is a quiet failure a keypress should not nag
 * about; a step a later edit blocks is named, so the history panel can offer to forget it.
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

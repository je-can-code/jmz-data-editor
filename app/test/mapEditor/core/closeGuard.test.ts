import { describe, expect, it, vi } from 'vitest';
import { installCloseGuard, unsavedOnlyHere, type CloseTarget } from '../../../src/mapEditor/core/closeGuard.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * A window with unsaved edits asks before it closes, but only when closing would lose them. The same map is often
 * open in two windows at once (a map and its event window), and closing one of them loses nothing while the other
 * holds exactly the same state, so asking there would teach the author to click through the question. But only
 * exactly the same state counts: a window holding an older copy of the map does not hold these edits. The guard
 * is the page's own beforeunload, which NW.js and a plain browser both honour.
 */
describe('closeGuard', () =>
{
  /**
   * A hub holding two maps, the first edited and the second clean.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    return hub;
  };

  /**
   * A window stand-in that keeps its beforeunload listener.
   * @returns {{ target: CloseTarget, fire: () => { prevented: boolean, returnValue: string } }} The window, and a way to close it.
   */
  const buildTarget = () =>
  {
    let listener: ((event: Event) => void) | null = null;
    const target: CloseTarget = {
      addEventListener: (_type, added) =>
      {
        listener = added;
      },
      removeEventListener: (_type, removed) =>
      {
        if (listener === removed)
        {
          listener = null;
        }
      },
    };
    const fire = () =>
    {
      const event = { preventDefault: vi.fn(), returnValue: 'untouched' };
      listener?.(event as unknown as Event);
      return { prevented: event.preventDefault.mock.calls.length > 0, returnValue: event.returnValue };
    };

    return { target, fire };
  };

  describe('unsavedOnlyHere', () =>
  {
    it('lists an edited document no other window holds at this state', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const atRisk = unsavedOnlyHere(hub, { sharesLatest: () => false });

      // Assert.
      expect(atRisk)
        .toStrictEqual([ 'map:1' ]);
    });

    it('lists a clean map whose file was removed from disk, its copy here the only one left, and not the clean map beside it', () =>
    {
      // Arrange: map 3 clean, its file removed outside the editor.
      const hub = buildHub();
      hub.adopt('map:3', buildMapJson() as unknown as JsonValue);
      hub.applyOutsideContent('map:3', null);

      // Act.
      const atRisk = unsavedOnlyHere(hub, { sharesLatest: () => false });

      // Assert.
      expect(atRisk)
        .toStrictEqual([ 'map:1', 'map:3' ]);
    });

    it('leaves out an edited document another window holds at exactly this state', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const atRisk = unsavedOnlyHere(hub, { sharesLatest: key => key === 'map:1' });

      // Assert.
      expect(atRisk)
        .toStrictEqual([]);
    });
  });

  describe('installCloseGuard', () =>
  {
    it('asks when something would be lost', () =>
    {
      // Arrange.
      const { target, fire } = buildTarget();
      installCloseGuard(target, () => true);

      // Act.
      const closed = fire();

      // Assert.
      expect(closed)
        .toStrictEqual({ prevented: true, returnValue: '' });
    });

    it('lets the window close when nothing would be lost', () =>
    {
      // Arrange.
      const { target, fire } = buildTarget();
      installCloseGuard(target, () => false);

      // Act.
      const closed = fire();

      // Assert.
      expect(closed)
        .toStrictEqual({ prevented: false, returnValue: 'untouched' });
    });

    it('stops asking once removed', () =>
    {
      // Arrange.
      const { target, fire } = buildTarget();
      const remove = installCloseGuard(target, () => true);

      // Act.
      remove();
      const closed = fire();

      // Assert.
      expect(closed.prevented)
        .toBe(false);
    });
  });
});

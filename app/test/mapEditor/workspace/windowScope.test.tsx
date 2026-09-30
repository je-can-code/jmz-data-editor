/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { IDockviewPanelProps } from 'dockview-react';
import { usePanelVisible } from '../../../src/mapEditor/workspace/windowScope.tsx';

/*
 * A map panel lets its GPU context go while it is a tab behind another, since a window keeps only so many, so it must
 * know from its first render whether dockview has it on screen (a layout comes back with most of its tabs hidden) and
 * follow every change after it. The hook reads the panel's visibility as it renders, keeps up with its visibility
 * events, and stops listening once the panel goes, so a closed panel is never told anything.
 */
describe('usePanelVisible', () =>
{
  /**
   * Builds a stand-in for a dock panel's api whose visibility can be changed, as dockview changes it.
   * @param {boolean} isVisible Whether the panel starts on screen.
   * @returns {object} The api, a way to change its visibility, and its listeners.
   */
  const buildPanel = (isVisible: boolean) =>
  {
    const state = { isVisible };
    const listeners = new Set<(event: { isVisible: boolean }) => void>();
    const api = {
      get isVisible()
      {
        return state.isVisible;
      },
      onDidVisibilityChange: (listener: (event: { isVisible: boolean }) => void) =>
      {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    } as unknown as IDockviewPanelProps['api'];

    /**
     * Shows or hides the panel and says so, as dockview does when a tab is picked.
     * @param {boolean} next Whether it shows.
     */
    const change = (next: boolean) =>
    {
      state.isVisible = next;
      listeners.forEach(listener => listener({ isVisible: next }));
    };

    return { api, change, listeners };
  };

  /**
   * Writes out what the hook answers for a panel.
   * @param {{ api: IDockviewPanelProps['api'] }} props The panel's api.
   * @returns {React.JSX.Element} The answer.
   */
  const Probe = (props: { api: IDockviewPanelProps['api'] }) => <div data-testid={'probe'}>{String(usePanelVisible(props.api))}</div>;

  it('starts from whether the panel shows, and follows it behind another tab and back', () =>
  {
    // Arrange: a panel restored as a tab behind another.
    const { api, change } = buildPanel(false);
    render(<Probe api={api}/>);
    const first = screen.getByTestId('probe').textContent;

    // Act.
    act(() => change(true));
    const shown = screen.getByTestId('probe').textContent;
    act(() => change(false));

    // Assert.
    expect([ first, shown, screen.getByTestId('probe').textContent ])
      .toStrictEqual([ 'false', 'true', 'false' ]);
  });

  it('stops listening once the panel goes', () =>
  {
    // Arrange.
    const { api, listeners } = buildPanel(true);
    const { unmount } = render(<Probe api={api}/>);
    const whileMounted = listeners.size;

    // Act.
    unmount();

    // Assert.
    expect([ whileMounted, listeners.size ])
      .toStrictEqual([ 1, 0 ]);
  });
});

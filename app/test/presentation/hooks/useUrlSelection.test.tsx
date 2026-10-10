/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';

/**
 * `useUrlSelection` ties a board's selection to its address. A link names a row by the board's key, such as
 * `/enemies?enemyId=12`, whether it comes from the board itself, another board, the bottom bar's search or the map
 * editor, and the board lands on that row. The hook selects the row a link names whenever the link changes, and tells
 * the board which row that is, so the board holds off choosing its first row for itself while a link names one. The
 * link is read from the router's query, never the page's own: the data editor routes inside the hash, where the page's
 * own query is always empty. A link naming a row the list lacks, or another board's key, names no row, and the board
 * chooses its first row as it would with no link at all.
 */
describe('useUrlSelection', () =>
{
  /**
   * A board's rows: enemy 2 sits before enemy 3, so selecting the wrong one of them shows.
   */
  const ROWS = [ { id: 1 }, { id: 2 }, { id: 3 }, { id: 5 } ];

  afterEach(() =>
  {
    window.history.replaceState(null, '', '/');
  });

  /**
   * Runs the hook for the enemies board, routed to an address, beside the router's own navigate.
   * @param {string} address Where the router stands.
   * @param {(index: number) => void} onSelect What the board does with a selection.
   * @returns The hook's result, with navigate beside it.
   */
  const renderAt = (address: string, onSelect: (index: number) => void) =>
  {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[ address ]}>{children}</MemoryRouter>
    );

    return renderHook(() => ({
      selection: useUrlSelection('enemyId', ROWS, row => row.id, onSelect, () => {}),
      navigate: useNavigate(),
    }), { wrapper });
  };

  it('hands the board the row a link names, from the router\'s query and not the page\'s own, and selects it', () =>
  {
    // Arrange: the page's own query names enemy 2, as nothing in the data editor ever does.
    window.history.replaceState(null, '', '/?enemyId=2');
    const onSelect = vi.fn();

    // Act.
    const { result } = renderAt('/enemies?enemyId=3', onSelect);

    // Assert.
    expect([ result.current.selection.linkedIndex, onSelect.mock.calls ])
      .toStrictEqual([ 2, [ [ 2 ] ] ]);
  });

  it('follows the link to another row of the same board', () =>
  {
    // Arrange.
    const onSelect = vi.fn();
    const { result } = renderAt('/enemies?enemyId=3', onSelect);

    // Act.
    act(() =>
    {
      result.current.navigate('/enemies?enemyId=5');
    });

    // Assert.
    expect([ result.current.selection.linkedIndex, onSelect.mock.calls ])
      .toStrictEqual([ 3, [ [ 2 ], [ 3 ] ] ]);
  });

  it('names no row for an id the list lacks, another board\'s key, or no link at all, and selects nothing', () =>
  {
    // Arrange: the skills board's key names an id the enemies hold.
    const addresses = [ '/enemies?enemyId=4', '/enemies?skillId=3', '/enemies' ];
    const onSelect = vi.fn();

    // Act.
    const linked = addresses.map(address => renderAt(address, onSelect).result.current.selection.linkedIndex);

    // Assert.
    expect([ linked, onSelect.mock.calls.length ])
      .toStrictEqual([ [ -1, -1, -1 ], 0 ]);
  });
});

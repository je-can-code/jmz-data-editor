/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { MAP_INFOS_KEY } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { useCharacterSheets, useDatabaseNames, useMapRows } from '../../../../src/mapEditor/views/quickPanel/quickResources.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The quick panel's pickers read what arrives from the server: the project's names, the map tree and the character
 * sheets. Each reads as nothing until it arrives, and without a server stays nothing, so a picker falls back to a
 * plain input. The map tree the window already holds is read live, so a map renamed a moment ago reads with its new
 * name, and the server is only asked when the window does not hold it.
 */
describe('quickResources', () =>
{
  /**
   * Shows what the hooks hand back, as text.
   * @param {{ hub: DocumentHub, api: MapEditorApi | null }} props The window's documents and the server.
   * @returns {React.JSX.Element} The readout.
   */
  const Readout = (props: { hub: DocumentHub; api: MapEditorApi | null }) =>
  {
    const { hub, api } = props;
    const names = useDatabaseNames(api);
    const rows = useMapRows(hub, api);
    const sheets = useCharacterSheets(api);
    return (
      <p data-testid={'readout'}>
        {JSON.stringify([ names?.items ?? null, rows?.filter(row => row !== null).map(row => row?.name) ?? null, sheets ])}
      </p>
    );
  };

  it('reads the names, the tree and the sheets from the server once they arrive', async () =>
  {
    // Arrange.
    const api = {
      loadDatabaseNames: async () => ({ items: [ '', 'Potion' ] }),
      loadCommandUsage: async () => ({}),
      loadMapInfos: vi.fn(async () => buildTreeRows()),
      listImages: async () => [ '!Chest' ],
    } as unknown as MapEditorApi;

    // Act.
    render(<Readout hub={new DocumentHub({ clientId: 'window-a' })} api={api}/>);
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect(screen.getByTestId('readout').textContent)
      .toBe(JSON.stringify([ [ '', 'Potion' ], [ 'World', 'Town', 'Inn', 'Cave', 'Test' ], [ '!Chest' ] ]));
  });

  it('reads the tree the window holds without asking the server', async () =>
  {
    // Arrange: a server that cannot name anything or list sheets.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt(MAP_INFOS_KEY, buildTreeRows() as unknown as JsonValue);
    const loadMapInfos = vi.fn(async () => []);
    const api = {
      loadDatabaseNames: async () => { throw new Error('no names'); },
      loadCommandUsage: async () => ({}),
      loadMapInfos,
    } as unknown as MapEditorApi;

    // Act.
    render(<Readout hub={hub} api={api}/>);
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.getByTestId('readout').textContent, loadMapInfos.mock.calls.length ])
      .toStrictEqual([ JSON.stringify([ null, [ 'World', 'Town', 'Inn', 'Cave', 'Test' ], null ]), 0 ]);
  });

  it('leaves the sheets as nothing when the server cannot list them', async () =>
  {
    // Arrange: a server whose folder listing fails.
    const api = {
      loadDatabaseNames: async () => ({ items: [ '', 'Potion' ] }),
      loadCommandUsage: async () => ({}),
      loadMapInfos: async () => buildTreeRows(),
      listImages: async () => Promise.reject(new Error('no folder')),
    } as unknown as MapEditorApi;

    // Act.
    render(<Readout hub={new DocumentHub({ clientId: 'window-a' })} api={api}/>);
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect(screen.getByTestId('readout').textContent)
      .toBe(JSON.stringify([ [ '', 'Potion' ], [ 'World', 'Town', 'Inn', 'Cave', 'Test' ], null ]));
  });

  it('drops a tree that lands after the panel has gone', async () =>
  {
    // Arrange: a tree the server answers only when the test says, the panel gone before then.
    let answer: (rows: unknown) => void = () => undefined;
    const api = {
      loadDatabaseNames: async () => ({ items: [] }),
      loadCommandUsage: async () => ({}),
      loadMapInfos: () => new Promise(resolve =>
      {
        answer = resolve;
      }),
    } as unknown as MapEditorApi;
    const shown = render(<Readout hub={new DocumentHub({ clientId: 'window-a' })} api={api}/>);
    shown.unmount();

    // Act.
    await act(async () =>
    {
      answer(buildTreeRows());
      await Promise.resolve();
    });

    // Assert: nothing to see but the absence of a warning about updating a panel that has gone.
    expect(shown.container.textContent)
      .toBe('');
  });

  it('reads nothing at all without a server', () =>
  {
    // Arrange: an empty window.
    const hub = new DocumentHub({ clientId: 'window-a' });

    // Act.
    render(<Readout hub={hub} api={null}/>);

    // Assert.
    expect(screen.getByTestId('readout').textContent)
      .toBe(JSON.stringify([ null, null, null ]));
  });
});

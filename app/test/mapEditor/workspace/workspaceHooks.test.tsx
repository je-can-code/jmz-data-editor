/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MapEditorApiError, type MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { MAP_INFOS_KEY, mapDocumentKey, type DocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { useHeldMap, WorkspaceProvider } from '../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../support/fixtures.ts';
import { buildTreeRows } from '../support/treeFixtures.ts';

/*
 * A panel holds its map for as long as the tree lists it, and owes the author the map as soon as it can be had. The
 * tree lists a map only once the map's file is written, but a panel can still ask a moment too soon (another
 * window's write in flight, a disk that failed once), so a map that could not be opened is tried again each time the
 * tree's file settles, rather than staying "could not be opened" for good. A map the tree does not list is never
 * asked for at all.
 */
describe('useHeldMap', () =>
{
  /**
   * Shows what the hook knows about one map: held, why it could not be opened, or still waiting.
   * @param {{ mapId: number }} props The map.
   * @returns {React.JSX.Element} The line.
   */
  const Probe = (props: { mapId: number }) =>
  {
    const { mapId } = props;
    const held = useHeldMap(mapId);
    return (
      <div data-testid={'held-map'}>
        {held.map === null ? held.failure ?? 'waiting' : 'held'}
      </div>
    );
  };

  /**
   * Renders the probe for a map over a hub whose map files the test puts on disk, counting every time a map is asked
   * for.
   * @param {number} mapId The map.
   * @returns {object} The hub, the files on disk and the asks.
   */
  const renderProbe = (mapId: number) =>
  {
    const files = new Map<number, JsonValue>();
    const asked: DocumentKey[] = [];
    const hub = new DocumentHub({ clientId: 'window-a', store: { load: async () => null, save: async () => undefined } });
    const openDocument = async (key: DocumentKey) =>
    {
      if (key === MAP_INFOS_KEY)
      {
        return hub.adopt(key, buildTreeRows() as unknown as JsonValue);
      }

      asked.push(key);
      const file = files.get(mapId);
      if (key !== mapDocumentKey(mapId) || file === undefined)
      {
        throw new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);
      }

      return hub.adopt(key, file);
    };
    const services = { hub, api: {} as MapEditorApi, openDocument } as unknown as MapEditorServices;
    render(
      <WorkspaceProvider controller={new WorkspaceController(services)}>
        <Probe mapId={mapId}/>
      </WorkspaceProvider>
    );

    return { hub, files, asked };
  };

  it('opens a map it could not open once the tree\'s file settles with the map on disk', async () =>
  {
    // Arrange: the tree lists the town, whose file is not there yet.
    const { hub, files } = renderProbe(2);
    await screen.findByText('GET /api/maps/2 answered 404');

    // Act.
    files.set(2, buildMapJson() as unknown as JsonValue);
    await act(async () =>
    {
      await hub.save(MAP_INFOS_KEY);
    });

    // Assert.
    expect(await screen.findByText('held'))
      .toBeInTheDocument();
  });

  it('never asks for a map the tree does not list, however often the tree settles', async () =>
  {
    // Arrange: slot 4 is free in the tree.
    const { hub, asked } = renderProbe(4);

    // Act.
    await act(async () =>
    {
      await hub.save(MAP_INFOS_KEY);
    });

    // Assert.
    expect([ asked, screen.getByTestId('held-map').textContent ])
      .toStrictEqual([ [], 'waiting' ]);
  });
});

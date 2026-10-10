/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BlueprintCopyCounter } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { deleteBlueprint, saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { HistoryPanel } from '../../../../src/mapEditor/workspace/panels/HistoryPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { drawsFor, holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The history panel says why a step cannot move the way it says it for a step a later edit blocks: in a warning over the
 * list, naming the step, with the choice to forget it. Undoing a blueprint's save while a copy of it stands on a map is
 * such a step, since the undo would take away a blueprint the copy still names, and it is refused in the words a delete
 * of the blueprint is refused in, from a click on the panel's rows as from Ctrl+Z, the blueprint staying where it was.
 *
 * The window holds the blueprints, an empty record of where their tiles are placed, and map 1, where one copy of "Goblin
 * camp" (k3x9q2mf) stands, unsaved.
 */
describe('HistoryPanel', () =>
{
  /**
   * Renders the panel for the camp's history, in a window whose copies have been counted.
   * @returns {Promise<{ hub: DocumentHub, controller: WorkspaceController }>} The window's documents and its controller.
   */
  const renderCampHistory = async () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(hub);
    holdBlueprintUses(hub);
    hub.adopt('map:1', mapWithEvents(4, 3, [ null, [ 0, 0 ] ]) as unknown as JsonValue);
    saveBlueprint(hub, stampOf({ mapId: 1 }), 'Goblin camp', drawsFor([ 'k3x9q2mf' ]));
    placeBlueprint(hub, 1, 'k3x9q2mf', { at: { x: 2, y: 1 }, shaping: 'auto', mode: 1, linkRefusal: null });
    const blueprintCopies = new BlueprintCopyCounter({ hub, readNotes: async () => [] });
    blueprintCopies.start();
    await blueprintCopies.settled();

    const services = { hub, api: null, blueprintCopies } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    controller.focusHistory(blueprintHistoryKey('k3x9q2mf'));
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <HistoryPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    return { hub, controller };
  };

  /**
   * What the author is told when the camp's save would be undone.
   */
  const REFUSED = '"Save blueprint "Goblin camp"" cannot be undone: "Goblin camp" still has 1 linked event, on Map 1, so it can\'t be deleted.';

  it('says why a click back to the start cannot undo a blueprint\'s save while a copy names it, offering to forget the step', async () =>
  {
    // Arrange.
    const { hub } = await renderCampHistory();

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByText('Start'));
    });

    // Assert.
    expect([ screen.getByRole('alert').textContent, blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), 'k3x9q2mf')?.name ])
      .toStrictEqual([ `${REFUSED}Forget it`, 'Goblin camp' ]);
  });

  it('says the same when Ctrl+Z would undo the save', async () =>
  {
    // Arrange.
    const { hub, controller } = await renderCampHistory();

    // Act.
    await act(async () =>
    {
      await controller.undo();
    });

    // Assert.
    expect([ controller.getState().notice?.text, blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), 'k3x9q2mf')?.name ])
      .toStrictEqual([ REFUSED, 'Goblin camp' ]);
  });
});

/*
 * A change to a blueprint is listed in the history of every map it reached, where it is named for its blueprint, so a
 * stroke made in the blueprint's tab never reads as one painted on the map; the map's own steps keep their names. A
 * blueprint deleted, or its save undone, keeps the name it had in its history's title, never falling back to its id.
 *
 * The window holds the blueprints, with "Needler nest" (k3x9q2mf) saved and open as a map, and map 1.
 */
describe('HistoryPanel: blueprints\' names', () =>
{
  /**
   * Builds the window's documents with the nest saved and open as a map.
   * @returns {DocumentHub} The documents.
   */
  const nestWindow = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(hub);
    hub.adopt('map:1', mapWithEvents(4, 3, [ null, [ 0, 0 ] ]) as unknown as JsonValue);
    saveBlueprint(hub, stampOf({ mapId: 1, tiles: { layers: [ 0 ], values: [ 1 ], calledFor: [ -1 ] } }), 'Needler nest', drawsFor([ 'k3x9q2mf' ]));
    holdBlueprintMap(hub, 'k3x9q2mf');
    return hub;
  };

  /**
   * Renders the panel for a history.
   * @param {DocumentHub} hub The window's documents.
   * @param {string} key The history.
   */
  const renderHistory = (hub: DocumentHub, key: string): void =>
  {
    const services = { hub, api: null } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    controller.focusHistory(key);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <HistoryPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
  };

  /**
   * Reads the panel's rows, the start left out.
   * @returns {string[]} Each row's words.
   */
  const rows = (): string[] => screen.getAllByRole('button').map(row => row.textContent ?? '').filter(text => text !== 'Start');

  it('names a blueprint\'s change for its blueprint among a map\'s steps, and the map\'s own steps as they are', () =>
  {
    // Arrange: the nest painted in its tab, reaching map 1, then map 1's event renamed there.
    const hub = nestWindow();
    hub.edit('Paint tiles', [ blueprintHistoryKey('k3x9q2mf'), mapHistoryKey(1) ], tx =>
    {
      tx.tiles(blueprintMapKey('k3x9q2mf'), [ [ 0, 2 ] ]);
      tx.set('map:1', [ 'events', 1, 'name' ], 'Needler');
    });
    hub.edit('Rename event', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 1, 'name' ], 'Nest'));

    // Act.
    renderHistory(hub, mapHistoryKey(1));

    // Assert.
    expect(rows())
      .toStrictEqual([ 'Blueprint "Needler nest": Paint tiles', 'Rename event' ]);
  });

  it('keeps a deleted blueprint\'s name in its history\'s title', () =>
  {
    // Arrange.
    const hub = nestWindow();
    deleteBlueprint(hub, 'k3x9q2mf', { total: 0, maps: [] }, mapId => `Map ${mapId}`);

    // Act.
    renderHistory(hub, blueprintHistoryKey('k3x9q2mf'));

    // Assert: its rows name it too, as its steps were named when made.
    expect([ screen.getByText(/^Blueprint: /).textContent, rows() ])
      .toStrictEqual([ 'Blueprint: Needler nest', [ 'Save blueprint "Needler nest"', 'Delete blueprint "Needler nest"' ] ]);
  });
});

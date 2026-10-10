/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { CopyPanel } from '../../../../src/mapEditor/views/blueprintCopy/CopyPanel.tsx';
import { holdBlueprints, storedBlueprints, storedUses } from '../../support/blueprintFixtures.ts';
import { copyOf, NEST_ID, needler, needlerNest } from '../../support/copyFixtures.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * A copy's panel reads the copy against the blueprints as its window holds them, and holds them for the purpose when the
 * window has a server and does not hold them yet, saying it is opening them meanwhile and why when they cannot be had; a
 * blueprint the blueprints keep something else under reads as gone. It finds the copy's group from the record of where
 * blueprints are placed, the window's own when it holds one, or else a look at it, never held. And it tells nothing while
 * the project's plugin list cannot be read, saying why.
 */
describe('useCopyView', () =>
{
  /**
   * The nest's needler, whose page turns its event 3, standing beside it, as a nest of tiles.
   */
  const turn = (eventId: number) => command(205, [ eventId, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: false } ]);
  const TILED_NEST = {
    ...needlerNest(),
    stamp: stampOf({
      width: 2,
      height: 1,
      tiles: { layers: [ 0 ], values: [ 1, 2 ], calledFor: [ -1, -1 ] },
      events: [ { ...event(2, [ page([ turn(3) ]) ], { name: 'Needler' }), x: 0, y: 0 }, { ...needler(), id: 3, x: 1, y: 0 } ],
    }),
  };

  /**
   * Renders a copy's panel over a window holding map 1, with the copy as event 12 placed at (6, 8) beside 3's copy, 13,
   * at (7, 8).
   * @param {object} options What the window holds and reads: the copy, whether the blueprints are held, what opening a
   * document does, the record a look at it finds, whether the plugins are read, and why their list cannot be.
   * @returns {object} The hub, and what opening a document was asked.
   */
  const renderPanel = (options: {
    copy?: RmmzMapEvent;
    held?: boolean;
    open?: (key: DocumentKey) => Promise<unknown>;
    record?: JsonValue;
    plugins?: boolean;
    listProblem?: string;
  } = {}) =>
  {
    const { copy = { ...copyOf(event(2, [ page([ turn(13) ]) ], { name: 'Needler' })), x: 6, y: 8 }, held = true, plugins = true } = options;
    const file = mapWithEvents(16, 12, Array.from({ length: 14 }, () => null));
    file.events[12] = copy;
    file.events[13] = { ...copyOf({ ...needler(), id: 3 }), id: 13, x: 7, y: 8 };
    const hub = new DocumentHub({
      clientId: 'event-window',
      store: {
        load: async (key: DocumentKey) =>
        {
          if (key === BLUEPRINT_USES_DOCUMENT && options.record !== undefined)
          {
            return options.record;
          }

          throw new Error(`no file backs ${key}`);
        },
        save: async () => undefined,
      },
    });
    hub.adopt('map:1', file as unknown as JsonValue);
    if (held)
    {
      holdBlueprints(hub, { [NEST_ID]: TILED_NEST });
    }

    const modules = new PluginModuleRegistry(new CommandCatalog());
    modules.noteListProblem(options.listProblem ?? null);
    if (plugins)
    {
      modules.activate([], []);
    }

    const openDocument = vi.fn(options.open ?? (async (key: DocumentKey) => hub.document(key)));
    const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
    const services = { hub, modules, sync, api: {} as MapEditorApi, openDocument } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <CopyPanel target={{ mapId: 1, eventId: 12, history: eventHistoryKey(1, 12) }} event={copy} pageIndex={0} onEdit={() => undefined} onNotice={() => undefined}/>
      </MapEditorServicesProvider>
    );
    return { hub, openDocument };
  };

  /**
   * Lets every load on its way land.
   */
  const settle = async (): Promise<void> =>
  {
    await act(async () =>
    {
      for (let round = 0; round < 6; round++)
      {
        await Promise.resolve();
      }
    });
  };

  /**
   * Reads where the copy's commands stand, as its row says.
   * @returns {string | null} The standing, or null when the panel shows no such row.
   */
  const commandsStanding = (): string | null =>
  {
    return screen.queryAllByTestId('copy-field').find(row => row.textContent?.startsWith('Commands') === true)?.querySelector('[data-testid="copy-field-state"]')?.textContent ?? null;
  };

  it('opens the blueprints when the window does not hold them, saying so meanwhile, then reads the copy against them', async () =>
  {
    // Arrange: opening the blueprints takes them up, as a server's answer would.
    let finish = () => undefined as void;
    const arrived = new Promise<void>(resolve =>
    {
      finish = resolve;
    });
    const { hub, openDocument } = renderPanel({
      held: false,
      open: async () =>
      {
        await arrived;
        hub.adopt(BLUEPRINTS_DOCUMENT, storedBlueprints({ [NEST_ID]: TILED_NEST }) as JsonValue);
        return hub.document(BLUEPRINTS_DOCUMENT);
      },
    });
    const waiting = screen.getByTestId('copy-panel-waiting').textContent;

    // Act.
    finish();
    await settle();

    // Assert.
    expect([ waiting, openDocument.mock.calls.map(([ key ]) => key), screen.getByTestId('copy-panel').querySelector('p')?.textContent ])
      .toStrictEqual([ 'Opening the blueprints', [ BLUEPRINTS_DOCUMENT ], 'Copy of "Needler nest" (event 2)' ]);
  });

  it('says why the blueprints could not be opened', async () =>
  {
    // Arrange.
    renderPanel({ held: false, open: async () => Promise.reject(new Error('the server is down')) });

    // Act.
    await settle();

    // Assert.
    expect(screen.getByTestId('copy-panel-waiting').textContent)
      .toBe('The blueprints could not be read: the server is down');
  });

  it('finds the copy\'s group by a look at the record of placements, never holding it, so its commands follow', async () =>
  {
    // Arrange: the record places the nest at (6, 8), and the window does not hold it.
    const { hub } = renderPanel({ record: storedUses([ { blueprintId: NEST_ID, mapId: 1, x: 6, y: 8 } ]) as JsonValue });
    const before = commandsStanding();

    // Act.
    await settle();

    // Assert: until the look landed, the turn naming 13 was kept as the copy's own.
    expect([ before, commandsStanding(), hub.has(BLUEPRINT_USES_DOCUMENT) ])
      .toStrictEqual([ 'These commands name other events in the blueprint, so this copy keeps its own', null, false ]);
  });

  it('reads the copy\'s group as unknown when the record cannot be had, or is no record of placements', async () =>
  {
    // Arrange: one window whose record cannot be read, one whose record holds words where map 1's placements should be.
    renderPanel();
    await settle();
    const unreadable = commandsStanding();
    document.body.innerHTML = '';
    renderPanel({ record: { schemaVersion: 2, data: { maps: { 1: 'placed somewhere' } } } });

    // Act.
    await settle();

    // Assert.
    expect([ unreadable, commandsStanding() ])
      .toStrictEqual([
        'These commands name other events in the blueprint, so this copy keeps its own',
        'These commands name other events in the blueprint, so this copy keeps its own',
      ]);
  });

  it('reads a copy whose blueprint the blueprints keep something else under as a copy of a blueprint that is gone', () =>
  {
    // Arrange: an entry under the nest's id holding no stamp.
    const hub = new DocumentHub({ clientId: 'event-window' });
    hub.adopt(BLUEPRINTS_DOCUMENT, { schemaVersion: 1, data: { blueprints: { [NEST_ID]: { name: 'Needler nest' } } } });
    const file = mapWithEvents(16, 12, Array.from({ length: 13 }, () => null));
    file.events[12] = copyOf(needler());
    hub.adopt('map:1', file as unknown as JsonValue);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    modules.activate([], []);
    const services = { hub, modules, api: null, openDocument: vi.fn() } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <CopyPanel target={{ mapId: 1, eventId: 12, history: eventHistoryKey(1, 12) }} event={copyOf(needler())} pageIndex={0} onEdit={() => undefined} onNotice={() => undefined}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect([ screen.getByTestId('copy-panel').querySelector('p')?.textContent, screen.getByTestId('copy-summary').textContent ])
      .toStrictEqual([ 'Copy of a blueprint that is gone', 'Its blueprint is gone.' ]);
  });

  it('tells nothing while the project\'s plugin list cannot be read, saying why', () =>
  {
    // Arrange: nothing beyond the list's problem.

    // Act.
    renderPanel({ plugins: false, listProblem: 'js/plugins.js is missing' });

    // Assert.
    expect(screen.getByTestId('copy-panel-waiting').textContent)
      .toBe('The project\'s plugin list can\'t be read (js/plugins.js is missing), so what this copy follows can\'t be told.');
  });
});

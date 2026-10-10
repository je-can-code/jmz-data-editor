/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { WindowPageRule } from '../../../../src/mapEditor/core/pageRule/WindowPageRule.ts';
import { WindowPreview } from '../../../../src/mapEditor/core/preview/WindowPreview.ts';
import { WindowClock } from '../../../../src/mapEditor/core/time/WindowClock.ts';
import { pixelModule } from '../../../../src/mapEditor/modules/pixel/pixelModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickPanelHost } from '../../../../src/mapEditor/views/quickPanel/QuickPanelHost.tsx';
import { command, event, hubWith, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * While J-Pixelistics is on, the quick panel says of each picked event whose area runs past the map's edge how far it
 * runs, where the player can never go, whatever kind the event is, an exit or one no kind claims, so the panel says what
 * the map marks in red. The area is read from the page every map view shows the event with, at the window's clock and
 * preview, and the panel follows the preview as it changes. An area wholly on the map says nothing, and nothing is said
 * at all while J-Pixelistics is off. Several picked events are each named.
 */
describe('AreaAlerts', () =>
{
  /**
   * Renders the quick panel over the fixture map, 3 tiles by 2, holding the given events, with the core's kinds and
   * J-Pixelistics' module on or off, and the window's clock, preview and page rule.
   * @param {RmmzMapEvent[]} events The map's events.
   * @param {number[]} eventIds The picked events.
   * @param {boolean} pixelistics Whether J-Pixelistics is enabled.
   * @returns {{ preview: WindowPreview }} The window's preview.
   */
  const renderPanel = (events: RmmzMapEvent[], eventIds: number[], pixelistics = true) =>
  {
    const { hub } = hubWith(events);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    modules.activate([ pixelModule ], [ { name: 'j/pixel/J-Pixelistics', status: pixelistics, description: '', parameters: {} } ]);
    const preview = new WindowPreview();
    const services = { hub, api: null, modules, clock: new WindowClock(), preview, pages: new WindowPageRule(modules) } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <QuickPanelHost document={hub.map('map:1')} eventIds={eventIds}/>
      </MapEditorServicesProvider>
    );
    return { preview };
  };

  /**
   * Builds an exit at a tile whose page covers an area, sending the player up.
   * @param {number} id The event id.
   * @param {number} x The column.
   * @param {string} area The area tag.
   * @returns {RmmzMapEvent} The exit.
   */
  const exitAt = (id: number, x: number, area: string): RmmzMapEvent =>
  {
    return event(id, [ transferPage([ 0, 5, 3, 4, 8, 0 ], [ command(108, [ area ]) ]) ], { name: `exit ${id}`, x, y: 0 });
  };

  it('says how far a picked exit\'s area runs past the map\'s edge, above its settings', () =>
  {
    // Arrange: a 5 by 1 strip from 1, 0, three tiles past the right edge of the 3-wide map.

    // Act.
    renderPanel([ exitAt(1, 1, '<areaEvent:[5, 1]>') ], [ 1 ]);

    // Assert: the alert, and the transfer's own section below it.
    expect([ screen.getByTestId('area-alert').textContent, screen.getAllByTestId(/^quick-kind-/u).length ])
      .toStrictEqual([ 'The trigger area runs 3 tiles past the right edge of the map, where the player can never go.', 1 ]);
  });

  it('says so of an event no kind claims too, beside saying it has no quick settings', () =>
  {
    // Arrange: chatter that talks across a 1 by 4 strip from 2, 0, two tiles past the bottom edge of the 2-high map.
    const chatter = event(1, [ page([ command(108, [ '<areaEvent:[1, 4]>' ]), ...text([ 'Another cave!' ]) ]) ], { name: 'chatter', x: 2, y: 0 });

    // Act.
    renderPanel([ chatter ], [ 1 ]);

    // Assert.
    expect([ screen.getByTestId('area-alert').textContent, screen.getByText('chatter has no quick settings.') !== null ])
      .toStrictEqual([ 'The trigger area runs 2 tiles past the bottom edge of the map, where the player can never go.', true ]);
  });

  it('says nothing of an area wholly on the map', () =>
  {
    // Arrange: a 2 by 1 strip from 1, 0, ending on the map's last column.

    // Act.
    renderPanel([ exitAt(1, 1, '<areaEvent:[2, 1]>') ], [ 1 ]);

    // Assert: the transfer's section shows, and no alert.
    expect([ screen.queryByTestId('area-alert'), screen.getAllByTestId(/^quick-kind-/u).length ])
      .toStrictEqual([ null, 1 ]);
  });

  it('says nothing while J-Pixelistics is off', () =>
  {
    // Arrange: the strip running past the edge.

    // Act.
    renderPanel([ exitAt(1, 1, '<areaEvent:[5, 1]>') ], [ 1 ], false);

    // Assert.
    expect([ screen.queryByTestId('area-alert'), screen.getAllByTestId(/^quick-kind-/u).length ])
      .toStrictEqual([ null, 1 ]);
  });

  it('names each of several picked events whose area runs past the edge, and says nothing of the rest', () =>
  {
    // Arrange: two strips running past, one that fits, picked in that order.
    const events = [ exitAt(1, 1, '<areaEvent:[5, 1]>'), exitAt(2, 0, '<areaEvent:[2, 1]>'), exitAt(3, 2, '<areaEvent:[2, 1]>') ];

    // Act.
    renderPanel(events, [ 1, 2, 3 ]);

    // Assert.
    expect(screen.getAllByTestId('area-alert').map(alert => alert.textContent))
      .toStrictEqual([
        'exit 1: The trigger area runs 3 tiles past the right edge of the map, where the player can never go.',
        'exit 3: The trigger area runs 1 tile past the right edge of the map, where the player can never go.',
      ]);
  });

  it('follows the page the window shows the event with as the preview changes', () =>
  {
    // Arrange: an exit covering its own tile on its first page, and a 5 by 1 strip on its second, once switch 4 is on.
    const first = transferPage([ 0, 5, 3, 4, 8, 0 ]);
    const gated = {
      ...transferPage([ 0, 5, 3, 4, 8, 0 ], [ command(108, [ '<areaEvent:[5, 1]>' ]) ]),
      conditions: { ...createEventPage().conditions, switch1Valid: true, switch1Id: 4 },
    };
    const { preview } = renderPanel([ event(1, [ first, gated ], { x: 1, y: 0 }) ], [ 1 ]);
    const fresh = screen.queryByTestId('area-alert');

    // Act.
    act(() => preview.setSwitch(4, true));

    // Assert: nothing on a fresh save; the strip's run past the edge once the switch is on.
    expect([ fresh, screen.getByTestId('area-alert').textContent ])
      .toStrictEqual([ null, 'The trigger area runs 3 tiles past the right edge of the map, where the player can never go.' ]);
  });
});

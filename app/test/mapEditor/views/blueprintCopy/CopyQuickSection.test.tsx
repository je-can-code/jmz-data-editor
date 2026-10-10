/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell } from '../../../../src/core/infrastructure/shell/WindowShell.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { WindowPageRule } from '../../../../src/mapEditor/core/pageRule/WindowPageRule.ts';
import { WindowClock } from '../../../../src/mapEditor/core/time/WindowClock.ts';
import { jabsModule } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickPanelHost } from '../../../../src/mapEditor/views/quickPanel/QuickPanelHost.tsx';
import { holdBlueprints } from '../../support/blueprintFixtures.ts';
import { copyOf, NEST_ID, needler, needlerNest, turnOf } from '../../support/copyFixtures.ts';
import { event, hubWith, oreChest, page } from '../../support/eventKindFixtures.ts';

/*
 * A copy of a blueprint picked alone on a map shows in the quick panel, above its own settings, what it is a copy of and
 * how far it stands apart, or why no change to the blueprint reaches it, with a way to follow the blueprint again in
 * everything, one step in the map's history that one undo takes back byte for byte, and a way to open the blueprint's
 * event in its own window. Several events picked together, or a plain event, show nothing of blueprints. A follow that
 * cannot be made says why, and a window that could not open says so.
 */
describe('CopyQuickSection', () =>
{
  /**
   * Renders the quick panel over a map holding the given events, with the nest kept, the core's kinds and the plugins
   * J-ABS and J-Lighting read.
   * @param {RmmzMapEvent[]} events The map's events.
   * @param {number[]} eventIds The picked events.
   * @param {object} options What opening a window comes to, and the nest the window keeps.
   * @returns {object} The hub, the map file it started from, and every window asked for.
   */
  const renderPick = (events: RmmzMapEvent[], eventIds: number[], options: { blocked?: boolean; nest?: ReturnType<typeof needlerNest>; plugins?: boolean } = {}) =>
  {
    const { blocked = false, nest = needlerNest(), plugins = true } = options;
    const held = hubWith(events);
    holdBlueprints(held.hub, { [NEST_ID]: nest });
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    if (plugins)
    {
      modules.activate([ jabsModule, lightingModule ], [
        { name: 'j/abs/J-ABS', status: true, description: '', parameters: { actionMapId: '9' } },
        { name: 'j/lighting/J-Lighting', status: true, description: '', parameters: {} },
      ]);
    }
    const opened: string[] = [];
    const openWindow = (_url: string, name: string) =>
    {
      opened.push(name);
      return blocked ? null : { location: { href: 'about:blank' }, focus: () => undefined } as unknown as Window;
    };
    const shell = new WindowShell({ channel: null, origin: 'http://ui', openWindow, readClipboardText: async () => '' });
    // the battler's own panel follows the page a new game shows, by the window's clock and page rule.
    const services = { hub: held.hub, api: null, modules, shell, pages: new WindowPageRule(modules), clock: new WindowClock(840) } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <QuickPanelHost document={held.hub.map('map:1')} eventIds={eventIds}/>
      </MapEditorServicesProvider>
    );
    return { ...held, opened };
  };

  /**
   * A copy of the needler standing apart: its speed pinned at 5, and its trigger set by hand.
   * @returns {RmmzMapEvent} The copy, event 12.
   */
  const apartCopy = (): RmmzMapEvent => copyOf(needler({ moveSpeed: 5, trigger: 2 }), [ 'p1.speed=5' ]);

  it('shows what a copy picked alone copies and how far it stands apart, above its own settings', () =>
  {
    // Arrange: a chest beside it, not picked.

    // Act.
    renderPick([ oreChest(3), apartCopy() ], [ 12 ]);

    // Assert: the battler's own kind follows below.
    const section = screen.getByTestId('copy-quick-section');
    expect([
      section.querySelector('h6')?.textContent,
      screen.getByTestId('copy-summary').textContent,
      section.compareDocumentPosition(screen.getByTestId('quick-kind-jabs.battler')) === Node.DOCUMENT_POSITION_FOLLOWING,
    ])
      .toStrictEqual([ 'Event 12 · Copy of event 2 of "Needler nest"', '1 field set by hand, 1 pinned.', true ]);
  });

  it('follows the blueprint again as one step in the map\'s history, which one undo takes back byte for byte', () =>
  {
    // Arrange.
    const { hub } = renderPick([ apartCopy() ], [ 12 ]);
    const before = JSON.stringify(hub.document('map:1').toJson());

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Follow the blueprint again' }));
    const followed = [ hub.map('map:1').event(12)?.pages[0].moveSpeed, hub.map('map:1').event(12)?.note, screen.getByTestId('copy-summary').textContent ];
    hub.undo(mapHistoryKey(1));

    // Assert.
    expect([ followed, hub.history(mapHistoryKey(1)).rows.map(row => row.label), JSON.stringify(hub.document('map:1').toJson()) === before ])
      .toStrictEqual([ [ 3, '<blueprint:[k3x9q2mf, 2]>', 'Follows the blueprint in everything.' ], [ 'Follow "Needler nest" again' ], true ]);
  });

  it('shows nothing of blueprints for several events picked together, or for a plain event picked alone', () =>
  {
    // Arrange.
    renderPick([ oreChest(3), apartCopy() ], [ 12, 3 ]);
    const together = screen.queryByTestId('copy-quick-section');

    // Act.
    document.body.innerHTML = '';
    renderPick([ oreChest(3), apartCopy() ], [ 3 ]);

    // Assert.
    expect([ together, screen.queryByTestId('copy-quick-section') ])
      .toStrictEqual([ null, null ]);
  });

  it('opens the blueprint\'s event in its own window, and says when the window was blocked', () =>
  {
    // Arrange.
    const { opened } = renderPick([ apartCopy() ], [ 12 ]);
    fireEvent.click(screen.getByRole('button', { name: 'Open blueprint' }));
    document.body.innerHTML = '';
    renderPick([ apartCopy() ], [ 12 ], { blocked: true });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Open blueprint' }));

    // Assert.
    expect([ opened, screen.getByRole('alert').textContent ])
      .toStrictEqual([ [ 'jmz-blueprint-event-k3x9q2mf-2' ], 'The blueprint\'s window was blocked; allow pop-ups for the editor to open it.' ]);
  });

  it('says why a copy could not follow, and leaves the map as it was', () =>
  {
    // Arrange: the nest's needler turns its event 3, standing beside it, whose copy here nobody knows; the copy's turn
    // names 15, and its trigger is set by hand.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3, x: 0, y: 0 } ]);
    const { hub } = renderPick([ copyOf(event(2, [ page([ turnOf(15) ], { trigger: 2 }) ], { name: 'Needler' })) ], [ 12 ], { nest });
    const before = JSON.stringify(hub.document('map:1').toJson());

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Follow the blueprint again' }));

    // Assert: in the words the copy's commands are said in everywhere.
    expect([ screen.getByRole('alert').textContent, JSON.stringify(hub.document('map:1').toJson()) === before ])
      .toStrictEqual([
        'It can\'t follow in everything: its commands name other events in the blueprint, so this copy keeps its own. Follow its other fields one by one.',
        true,
      ]);
  });

  it('offers no follow to a copy apart only in commands naming other events of the blueprint, and says why', () =>
  {
    // Arrange: the nest's needler turns its event 3, whose copy here nobody knows; the copy, as placed, turns 15.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3, x: 0, y: 0 } ]);

    // Act.
    renderPick([ copyOf(event(2, [ page([ turnOf(15) ]) ], { name: 'Needler' })) ], [ 12 ], { nest });

    // Assert.
    expect([ screen.getByTestId('copy-summary').textContent, (screen.getByRole('button', { name: 'Follow the blueprint again' }) as HTMLButtonElement).disabled ])
      .toStrictEqual([ 'Follows the blueprint, but its commands name other events in the blueprint, so this copy keeps its own.', true ]);
  });

  it('puts away why a follow could not be made once the author closes it', () =>
  {
    // Arrange: the follow refused, as above.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3, x: 0, y: 0 } ]);
    renderPick([ copyOf(event(2, [ page([ turnOf(15) ], { trigger: 2 }) ], { name: 'Needler' })) ], [ 12 ], { nest });
    fireEvent.click(screen.getByRole('button', { name: 'Follow the blueprint again' }));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert.
    expect(screen.queryByRole('alert'))
      .toBeNull();
  });

  it('says it is reading the project\'s plugins before they are read', () =>
  {
    // Arrange: nothing beyond the plugins unread.

    // Act.
    renderPick([ apartCopy() ], [ 12 ], { plugins: false });

    // Assert.
    expect([ screen.getByText('Reading the project\'s plugins') !== null, screen.queryByTestId('copy-quick-section') ])
      .toStrictEqual([ true, null ]);
  });

  it('says why no change reaches a drifted copy, and offers no following for a copy whose blueprint is gone', () =>
  {
    // Arrange: a copy of two pages.
    renderPick([ copyOf(event(2, [ needler().pages[0], needler().pages[0] ], { name: 'Needler' })) ], [ 12 ]);
    const drifted = [ screen.getByTestId('copy-summary').textContent, (screen.getByRole('button', { name: 'Follow the blueprint again' }) as HTMLButtonElement).disabled ];

    // Act: a copy of a blueprint the window no longer keeps.
    document.body.innerHTML = '';
    renderPick([ { ...apartCopy(), note: '<blueprint:[zz99zz99, 2]>' } ], [ 12 ]);

    // Assert.
    expect([ drifted, screen.getByTestId('copy-summary').textContent, screen.queryByRole('button', { name: 'Follow the blueprint again' }), screen.queryByRole('button', { name: 'Open blueprint' }) ])
      .toStrictEqual([ [ 'No change to the blueprint reaches it: it has 2 pages and its blueprint has 1 page.', false ], 'Its blueprint is gone.', null, null ]);
  });
});

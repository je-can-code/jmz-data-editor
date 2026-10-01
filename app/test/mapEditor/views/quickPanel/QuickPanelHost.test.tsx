/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { readChest } from '../../../../src/mapEditor/core/eventKinds/chestKind.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickPanelHost } from '../../../../src/mapEditor/views/quickPanel/QuickPanelHost.tsx';
import { CLOSED_GLASS, command, event, eventIn, hubWith, oreChest, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * The quick panel is what a single click on the map shows: for the picked events, each one's kind by its detector
 * and that kind's panel, a section per kind in the order the selection first names each, with the events no kind
 * knows counted beneath. Every change applies at once as one step in the map's history, the panel following the map
 * as it changes (an undo, or an event becoming another kind), and several events of a kind show the settings they
 * share, holding their common value or saying they differ. The host takes a map and the picked ids and nothing
 * else, so whatever selects events can drive it. A value half typed when the pick moves to other events, or to
 * another map, is dropped with the section it was typed in: it is never written to events it was not typed for.
 */
describe('QuickPanelHost', () =>
{
  /**
   * Renders the quick panel over a hub holding the given events, with the core's kinds registered.
   * @param {RmmzMapEvent[]} events The map's events.
   * @param {number[]} eventIds The picked events.
   * @returns {ReturnType<typeof hubWith> & { show: (document: MapDocument, ids: number[]) => void }} The hub, the map
   * it started from, and a way to show another pick, on that map or another.
   */
  const renderHost = (events: RmmzMapEvent[], eventIds: number[]) =>
  {
    const held = hubWith(events);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    const services = { hub: held.hub, api: null, modules } as unknown as MapEditorServices;
    const host = (document: MapDocument, ids: number[]) => (
      <MapEditorServicesProvider services={services}>
        <QuickPanelHost document={document} eventIds={ids}/>
      </MapEditorServicesProvider>
    );
    const { rerender } = render(host(held.hub.map('map:1'), eventIds));
    return { ...held, show: (document: MapDocument, ids: number[]) => rerender(host(document, ids)) };
  };

  it('asks for a pick when nothing is picked, or no map is open', () =>
  {
    // Arrange.
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const services = { hub: hubWith([]).hub, api: null, modules } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <QuickPanelHost document={null} eventIds={[ 1 ]}/>
        <QuickPanelHost document={services.hub.map('map:1')} eventIds={[]}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect(screen.getAllByText('Pick an event on a map to change its settings here.'))
      .toHaveLength(2);
  });

  it('says when the picked event is no longer on the map', () =>
  {
    // Arrange: slot 4 is empty.

    // Act.
    renderHost([ oreChest(3) ], [ 4 ]);

    // Assert.
    expect(screen.getByText('The picked event is no longer on the map.'))
      .toBeInTheDocument();
  });

  it('shows a chest by name and tile with what it gives, and changes the amount as one step one undo takes back', () =>
  {
    // Arrange.
    const { hub } = renderHost([ oreChest(3) ], [ 3 ]);
    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    const shown = [ screen.getByText('Chest').textContent, screen.getByText('chest-ore · 1, 1').textContent, amount.value ];

    // Act.
    fireEvent.change(amount, { target: { value: '25' } });
    fireEvent.blur(amount);
    const given = readChest(eventIn(hub, 3) as RmmzMapEvent)?.rewards[0].reward.amount;
    act(() =>
    {
      hub.undo(mapHistoryKey(1));
    });

    // Assert: the box follows the undo back to ten.
    expect([ shown, given, hub.history(mapHistoryKey(1)).rows.map(row => row.label), (screen.getByLabelText('Amount') as HTMLInputElement).value ])
      .toStrictEqual([ [ 'Chest', 'chest-ore · 1, 1', '10' ], 25, [ 'Change chest reward' ], '10' ]);
  });

  it('shows a section per kind in the order picked, and counts the events no kind knows', () =>
  {
    // Arrange: a door, a chest and a battler, picked in that order.
    const battler = event(5, [ page([ command(108, [ '<enemyId:3>' ]) ]) ], { name: 'yellow ghosty' });

    // Act.
    renderHost([ event(1, [ transferPage() ], { name: 'door' }), oreChest(3), battler ], [ 1, 5, 3 ]);

    // Assert.
    expect([ screen.getAllByTestId(/^quick-kind-/u).map(section => section.dataset['testid']), screen.getByText('yellow ghosty has no quick settings.').textContent ])
      .toStrictEqual([ [ 'quick-kind-core.transfer', 'quick-kind-core.chest' ], 'yellow ghosty has no quick settings.' ]);
  });

  it('counts several events no kind knows without naming them', () =>
  {
    // Arrange: two battlers beside a door.
    const battlers = [ 5, 6 ].map(id => event(id, [ page([ command(108, [ '<enemyId:3>' ]) ]) ]));

    // Act.
    renderHost([ event(1, [ transferPage() ]), ...battlers ], [ 1, 5, 6 ]);

    // Assert.
    expect(screen.getByText('2 of the picked events have no quick settings.'))
      .toBeInTheDocument();
  });

  it('shows what several transfers hold differently as mixed, and gives all of them a new fade in one step', () =>
  {
    // Arrange: two doors to different maps, both fading to black.
    const doors = [ event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]), event(3, [ transferPage([ 0, 6, 3, 9, 2, 0 ]) ]) ];
    const { hub } = renderHost(doors, [ 1, 3 ]);
    const shown = [
      screen.getByText('2 events').textContent,
      (screen.getByLabelText('Map') as HTMLInputElement).placeholder,
      (screen.getByLabelText('X') as HTMLInputElement).value,
      (screen.getByLabelText('Y') as HTMLInputElement).placeholder,
    ];

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Fade'));
    fireEvent.click(screen.getByRole('option', { name: 'No fade' }));

    // Assert.
    expect([ shown, [ 1, 3 ].map(id => eventIn(hub, id)?.pages[0].list[1].parameters[5]), hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([ [ '2 events', 'Mixed', '3', 'Mixed' ], [ 2, 2 ], 1 ]);
  });

  it('makes a placed chest graphic a chest at a click, and follows it to its new kind', () =>
  {
    // Arrange.
    const { hub } = renderHost([ event(2, [ page([], { image: { ...CLOSED_GLASS } }) ], { name: 'loot' }) ], [ 2 ]);
    const before = screen.getByText('Decor').textContent;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Make it a chest' }));

    // Assert.
    expect([ before, screen.getByText('Chest').textContent, readChest(eventIn(hub, 2) as RmmzMapEvent)?.rewards[0].reward, hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
      .toStrictEqual([ 'Decor', 'Chest', { kind: 'item', id: 1, amount: 1 }, [ 'Make a chest' ] ]);
  });

  it('commits a message only once it is left, and Escape puts back what it said', () =>
  {
    // Arrange.
    const { hub } = renderHost([ event(2, [ page(text([ 'North: Harbor' ])) ], { name: 'sign' }) ], [ 2 ]);
    const box = screen.getByLabelText('Message 1') as HTMLTextAreaElement;

    // Act: type and escape, then type and leave.
    fireEvent.change(box, { target: { value: 'North: Mines' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    const escaped = [ box.value, hub.history(mapHistoryKey(1)).rows.length ];
    fireEvent.change(box, { target: { value: 'North: Mines\nSouth: Harbor' } });
    const typed = hub.history(mapHistoryKey(1)).rows.length;
    fireEvent.blur(box);

    // Assert.
    expect([ escaped, typed, eventIn(hub, 2)?.pages[0].list.map(each => each.parameters[0]) ])
      .toStrictEqual([ [ 'North: Harbor', 0 ], 0, [ '', 'North: Mines', 'South: Harbor', undefined ] ]);
  });

  it('drops a value half typed when the pick moves to other events, rather than writing it to them', () =>
  {
    // Arrange: two doors sending the player to the same column; the first is picked and a new column half typed.
    const doors = [ event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]), event(3, [ transferPage([ 0, 6, 3, 9, 2, 0 ]) ]) ];
    const { hub, show } = renderHost(doors, [ 1 ]);
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '12' } });

    // Act: the pick moves to the second door, then the box is left.
    show(hub.map('map:1'), [ 3 ]);
    fireEvent.blur(screen.getByLabelText('X'));

    // Assert: neither door moved and nothing was recorded; the box shows the second door's own column.
    expect([ eventIn(hub, 1), eventIn(hub, 3), hub.history(mapHistoryKey(1)).rows.length, (screen.getByLabelText('X') as HTMLInputElement).value ])
      .toStrictEqual([ doors[0], doors[1], 0, '3' ]);
  });

  it('drops a message half typed when another map comes into focus, rather than writing it to the event of that id there', () =>
  {
    // Arrange: two maps, each with the same sign in slot 2; the first map's is picked and new text half typed.
    const sign = event(2, [ page(text([ 'North: Harbor' ])) ], { name: 'sign' });
    const { hub, map, show } = renderHost([ sign ], [ 2 ]);
    hub.adopt('map:2', cloneJson({ ...map, events: [ null, null, sign ] }) as unknown as JsonValue);
    fireEvent.change(screen.getByLabelText('Message 1'), { target: { value: 'North: Mines' } });

    // Act: the second map comes into focus with its sign picked, then the box is left.
    show(hub.map('map:2'), [ 2 ]);
    fireEvent.blur(screen.getByLabelText('Message 1'));

    // Assert: both signs still say what they said, and neither map recorded a step.
    expect([ eventIn(hub, 2), hub.map('map:2').event(2), hub.history(mapHistoryKey(1)).rows.length, hub.history(mapHistoryKey(2)).rows.length ])
      .toStrictEqual([ sign, sign, 0, 0 ]);
  });

  it('shows why a change could not be made', () =>
  {
    // Arrange: another edit is still open, so the hub refuses a second.
    const { hub } = renderHost([ oreChest(3) ], [ 3 ]);
    const open = hub.begin('Paint', [ mapHistoryKey(1) ]);
    const amount = screen.getByLabelText('Amount');

    // Act.
    fireEvent.change(amount, { target: { value: '25' } });
    fireEvent.blur(amount);
    open.cancel();

    // Assert.
    expect(screen.getByRole('alert').textContent)
      .toBe('That change could not be made: finish "Paint" first');
  });
});

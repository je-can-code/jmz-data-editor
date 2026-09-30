/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { commonEventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { SoundPlayerContext } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { CommonEventsView } from '../../../../src/mapEditor/views/commonEvents/CommonEventsView.tsx';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * The common events view is a panel the workspace can mount anywhere: the list of common events, and the chosen
 * one's name, trigger, switch and commands, in the same command list event pages use. It owes the author the file's
 * common events once the document opens (from another window's copy or the file), every change as a step in that
 * common event's own history, a save that writes the document when there is something to save, and a clear message
 * when the common events cannot be opened at all.
 */
describe('CommonEventsView', () =>
{
  /**
   * A common events file: two common events and an empty slot.
   * @returns {JsonValue} The file.
   */
  const buildCommonEvents = (): JsonValue => [
    null,
    { id: 1, list: [ cmd(230, 0, [ 30 ]), cmd(0, 0) ] as never, name: 'Heal Party', switchId: 1, trigger: 0 },
    null,
    { id: 3, list: [ cmd(0, 0) ] as never, name: 'Night Falls', switchId: 12, trigger: 2 },
  ];

  /**
   * Renders the view over a real hub.
   * @param {object} options Whether the hub holds the document already, what opening it does, and the store.
   * @returns {object} The hub, the store and the opener.
   */
  const renderView = (options: { held?: boolean; open?: () => Promise<unknown>; store?: DocumentStore } = {}) =>
  {
    const store = options.store ?? { load: vi.fn(async () => buildCommonEvents()), save: vi.fn(async () => undefined) };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    if (options.held !== false)
    {
      hub.adopt('common-events', buildCommonEvents());
    }

    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const openDocument = vi.fn(options.open ?? (async () => hub.load('common-events')));
    const services = { hub, catalog, commandEditors: new CommandEditorRegistry(), api: null, openDocument } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <SoundPlayerContext.Provider value={vi.fn()}>
          <CommonEventsView/>
        </SoundPlayerContext.Provider>
      </MapEditorServicesProvider>
    );
    return { hub, store, openDocument };
  };

  it('lists the common events and shows the first one\'s commands', () =>
  {
    // Arrange: nothing beyond the render.

    // Act.
    renderView();

    // Assert.
    expect([
      screen.getByRole('button', { name: /^0001 Heal Party/u }) instanceof HTMLElement,
      screen.getByRole('button', { name: /^0003 Night Falls/u }) instanceof HTMLElement,
      screen.getByText('Wait 30 frames') instanceof HTMLElement,
      (screen.getByLabelText('Name') as HTMLInputElement).value,
    ])
      .toStrictEqual([ true, true, true, 'Heal Party' ]);
  });

  it('shows another common event when it is chosen, with its switch while it runs by itself', () =>
  {
    // Arrange.
    renderView();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: /^0003 Night Falls/u }));

    // Assert.
    expect([ (screen.getByLabelText('Name') as HTMLInputElement).value, screen.queryByText('Wait 30 frames'), screen.queryByLabelText('Runs while switch is ON') !== null ])
      .toStrictEqual([ 'Night Falls', null, true ]);
  });

  it('narrows the list by name', () =>
  {
    // Arrange.
    renderView();

    // Act.
    fireEvent.change(screen.getByPlaceholderText('Find a common event'), { target: { value: 'night' } });

    // Assert.
    expect([ screen.queryByRole('button', { name: /^0001/u }), screen.queryByRole('button', { name: /^0003/u }) !== null ])
      .toStrictEqual([ null, true ]);
  });

  it('renames a common event as a step in its own history, and saves only once there is something to save', async () =>
  {
    // Arrange.
    const { hub, store } = renderView();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    const cleanAtFirst = (saveButton as HTMLButtonElement).disabled;
    const name = screen.getByLabelText('Name');

    // Act.
    fireEvent.change(name, { target: { value: 'Heal Everyone' } });
    fireEvent.blur(name);
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    // Assert.
    expect([
      cleanAtFirst,
      hub.history(commonEventHistoryKey(1)).rows.map(row => row.label),
      vi.mocked(store.save).mock.calls.length,
      hub.isDirty('common-events'),
    ])
      .toStrictEqual([ true, [ 'Rename common event' ], 1, false ]);
  });

  it('undoes and redoes the chosen common event from its header', () =>
  {
    // Arrange.
    const { hub } = renderView();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Heal Everyone' } });
    fireEvent.blur(name);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const undone = hub.document('common-events').valueAt([ 1, 'name' ]);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));

    // Assert.
    expect([ undone, hub.document('common-events').valueAt([ 1, 'name' ]) ])
      .toStrictEqual([ 'Heal Party', 'Heal Everyone' ]);
  });

  it('changes how a common event starts', () =>
  {
    // Arrange.
    const { hub } = renderView();

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Trigger'));
    fireEvent.click(screen.getByRole('option', { name: 'Autorun' }));

    // Assert.
    expect([ hub.document('common-events').valueAt([ 1, 'trigger' ]), hub.history(commonEventHistoryKey(1)).rows.map(row => row.label) ])
      .toStrictEqual([ 1, [ 'Change common event trigger' ] ]);
  });

  it('opens the common events when the window does not hold them yet', async () =>
  {
    // Arrange.
    const { openDocument } = renderView({ held: false });
    const loadingShown = screen.queryByLabelText('Opening the common events') !== null;

    // Act.
    await act(async () =>
    {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert.
    expect([ loadingShown, openDocument.mock.calls.length, screen.queryByText('Wait 30 frames') !== null ])
      .toStrictEqual([ true, 1, true ]);
  });

  it('says so when the common events cannot be opened', async () =>
  {
    // Arrange.
    renderView({ held: false, open: async () => Promise.reject(new Error('the server is down')) });

    // Act.
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect(screen.getByText('The common events could not be opened: the server is down'))
      .toBeInTheDocument();
  });

  it('says so when a save fails', async () =>
  {
    // Arrange.
    const store: DocumentStore = { load: vi.fn(async () => buildCommonEvents()), save: vi.fn(async () => Promise.reject(new Error('disk full'))) };
    renderView({ store });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Heal Everyone' } });
    fireEvent.blur(name);

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    // Assert.
    expect(screen.getByText('The common events were not saved: disk full'))
      .toBeInTheDocument();
  });
});

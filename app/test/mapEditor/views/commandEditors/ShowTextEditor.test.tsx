/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzEventCommand, RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { registerHandBuiltEditors } from '../../../../src/mapEditor/views/commandEditors/registerHandBuiltEditors.tsx';
import { TYPING_PAUSE_MS } from '../../../../src/mapEditor/views/commandEditors/TypingBurst.ts';
import { CommandList } from '../../../../src/mapEditor/views/commandList/CommandList.tsx';
import { SoundPlayerContext, type SoundPlayer } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { cmd } from '../../support/commandFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Typing in Show Text lands in the event's history the way typing in its Name box does: one step per burst of typing,
 * never one per key, so one undo takes back what was typed rather than its last letter. A burst ends when the typing
 * pauses, or when the author leaves the box, as clicking anywhere else does; the next key then starts a step of its own.
 * Each case runs the real command list over a real history, with the hand-built editors registered as the app does.
 */
describe('ShowTextEditor', () =>
{
  /**
   * The path to event 1's first page's list.
   */
  const PATH = [ 'events', 1, 'pages', 0, 'list' ] as const;

  /**
   * The event's own history, where every edit to its list lands.
   */
  const HISTORY = eventHistoryKey(1, 1);

  afterEach(() =>
  {
    vi.useRealTimers();
  });

  /**
   * Renders the list holding one message, "Hello", over a real hub, opens the message's editor, and holds the clock.
   * @returns {Promise<{ hub: DocumentHub, text: HTMLElement }>} The hub and the message's text box.
   */
  const openMessage = async () =>
  {
    const map: RmmzMap = buildMapJson();
    const list: RmmzEventCommand[] = [ cmd(101, 0, [ '', 0, 0, 2, 'Harold' ]), cmd(401, 0, [ 'Hello' ]), cmd(0, 0) ];
    (map.events[1] as NonNullable<RmmzMap['events'][number]>).pages[0].list = list;
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', map as never);
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const commandEditors = new CommandEditorRegistry();
    registerHandBuiltEditors(commandEditors, { api: null, headers: new PluginHeaderStore() });
    const services = {
      hub,
      catalog,
      commandEditors,
      api: { loadDatabaseNames: async () => { throw new Error('no names here'); }, loadCommandUsage: async () => { throw new Error('no counts here'); } } as unknown as MapEditorApi,
      pluginHeaders: new PluginHeaderStore(),
      loadCommandResources: async () => undefined,
      shell: { readClipboard: async () => null },
    } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <SoundPlayerContext.Provider value={vi.fn<SoundPlayer>()}>
          <CommandList documentKey={'map:1'} path={PATH} histories={[ HISTORY ]} label={'Page 1'}/>
        </SoundPlayerContext.Provider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText(/Hello/));
    vi.useFakeTimers();
    return { hub, text: screen.getByLabelText('Text') };
  };

  /**
   * Types into a box a key at a time, each key arriving well inside the pause of the one before.
   * @param {HTMLElement} box The box.
   * @param {readonly string[]} texts The box's text after each key.
   */
  const typeKeys = (box: HTMLElement, texts: readonly string[]) =>
  {
    texts.forEach(text =>
    {
      fireEvent.change(box, { target: { value: text } });
      act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS / 4));
    });
  };

  /**
   * Reads the message's text as the document holds it.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The message's lines.
   */
  const linesOf = (hub: DocumentHub): string[] =>
  {
    const list = hub.document('map:1').valueAt(PATH) as unknown as RmmzEventCommand[];
    return list.filter(command => command.code === 401).map(command => String(command.parameters[0]));
  };

  /**
   * Lists the event's history.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The step names.
   */
  const historyOf = (hub: DocumentHub): string[] => hub.history(HISTORY).rows.map(row => row.label);

  it('lands a burst of typing as one step once the typing pauses', async () =>
  {
    // Arrange.
    const { hub, text } = await openMessage();

    // Act: " Hi!" typed a key at a time, then a pause.
    typeKeys(text, [ 'Hello ', 'Hello H', 'Hello Hi', 'Hello Hi!' ]);
    const whileTyping = historyOf(hub);
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));

    // Assert.
    expect([ whileTyping, historyOf(hub), linesOf(hub) ])
      .toStrictEqual([ [], [ 'Edit Show Text' ], [ 'Hello Hi!' ] ]);
  });

  it('takes the whole burst back with one undo, to the text before it', async () =>
  {
    // Arrange.
    const { hub, text } = await openMessage();
    typeKeys(text, [ 'Hello ', 'Hello H', 'Hello Hi', 'Hello Hi!' ]);
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));

    // Act.
    act(() =>
    {
      hub.undo(HISTORY);
    });

    // Assert: the document and the box are both back where they were before the burst.
    expect([ linesOf(hub), (screen.getByLabelText('Text') as HTMLTextAreaElement).value ])
      .toStrictEqual([ [ 'Hello' ], 'Hello' ]);
  });

  it('starts a new step with typing after a pause', async () =>
  {
    // Arrange.
    const { hub, text } = await openMessage();
    typeKeys(text, [ 'Hello ', 'Hello H', 'Hello Hi' ]);
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));

    // Act.
    typeKeys(text, [ 'Hello Hi!' ]);
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));
    act(() =>
    {
      hub.undo(HISTORY);
    });

    // Assert: two steps, and one undo takes back only the second.
    expect([ historyOf(hub).length, linesOf(hub) ])
      .toStrictEqual([ 2, [ 'Hello Hi' ] ]);
  });

  it('ends the burst at once when the author leaves the box, and starts a new step on coming back', async () =>
  {
    // Arrange.
    const { hub, text } = await openMessage();
    typeKeys(text, [ 'Hello ', 'Hello H', 'Hello Hi' ]);

    // Act: leaving the box, as a click elsewhere does, then typing again and leaving again.
    fireEvent.blur(text);
    const onLeaving = [ historyOf(hub).length, linesOf(hub) ];
    typeKeys(text, [ 'Hello Hi!' ]);
    fireEvent.blur(text);

    // Assert.
    expect([ onLeaving, historyOf(hub).length, linesOf(hub) ])
      .toStrictEqual([ [ 1, [ 'Hello Hi' ] ], 2, [ 'Hello Hi!' ] ]);
  });

  it('lands the speaker typed as one step too', async () =>
  {
    // Arrange.
    const { hub } = await openMessage();
    const speaker = screen.getByLabelText('Speaker');

    // Act.
    typeKeys(speaker, [ 'Harold ', 'Harold t', 'Harold th', 'Harold the' ]);
    fireEvent.blur(speaker);

    // Assert.
    expect([ historyOf(hub), (hub.document('map:1').valueAt([ ...PATH, 0, 'parameters', 4 ])) ])
      .toStrictEqual([ [ 'Edit Show Text' ], 'Harold the' ]);
  });
});

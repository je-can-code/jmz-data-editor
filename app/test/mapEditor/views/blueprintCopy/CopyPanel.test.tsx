/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell } from '../../../../src/core/infrastructure/shell/WindowShell.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { jabsModule } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { SoundPlayerContext } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { EventWindowView } from '../../../../src/mapEditor/views/EventWindowView.tsx';
import type { Blueprint } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { holdBlueprints } from '../../support/blueprintFixtures.ts';
import { copyOf, later, NEST_ID, needler, needlerNest, turnOf } from '../../support/copyFixtures.ts';
import { event, page } from '../../support/eventKindFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';

// the route preview is proved in its own tests, and draws nothing here.
vi.mock('../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx', () => ({ RoutePreview: () => null }));

/*
 * A copy of a blueprint's event window shows, above its page's settings, what the copy is a copy of, by the blueprint's
 * name and the event it was made from, with a way to open that event of the blueprint in its own window; how it stands
 * against the blueprint as a whole; and field by field, the event's own fields and the shown page's, each with where it
 * stands in plain words: following the blueprint, following it at an offset, pinned at a value, or set by hand. Numbers,
 * which can be pinned, and fields standing apart show from the start; the choices that follow wait behind a toggle.
 *
 * From the panel a number is pinned or unpinned, any field follows the blueprint again, the whole copy follows it again,
 * and the copy is unlinked, each one step in the event's own history, never the map's. Its Note box shows the note's own
 * text, the link kept out of the way, and what is typed there goes back before the link, never losing it; what it
 * refuses stays in the box as typed, with why beneath it, until it is mended or Escape puts the note back. A copy drifted
 * too far for a change to reach it, or whose blueprint is gone, says so and offers what can still be done; and until the
 * project's plugins are read, nothing is told, since a module's numbers would read as comments set by hand.
 */
describe('CopyPanel', () =>
{
  /**
   * The copy's map, the event and the history its window records in.
   */
  const MAP_ID = 1;
  const COPY_ID = 12;
  const HISTORY = eventHistoryKey(MAP_ID, COPY_ID);

  /**
   * A copy of the needler, standing apart in three ways: its speed pinned at 5, its sight two longer in its link, and its
   * trigger set by hand.
   * @returns {RmmzMapEvent} The copy.
   */
  const apartCopy = (): RmmzMapEvent =>
  {
    const source = needler({ moveSpeed: 5, trigger: 2 });
    source.pages[0].list[1] = later('<sight:6>');
    return copyOf(source, [ 'p1.speed=5', 'p1.sight+2' ]);
  };

  /**
   * Renders the copy's event window over a hub holding its map and the nest, the plugins J-ABS and J-Lighting read
   * unless told not to be.
   * @param {object} options The copy, whether the plugins have been read, whether the nest is kept and what it holds, and
   * whether pop-ups are blocked.
   * @returns {object} The hub, and every window the window asked to open.
   */
  const renderCopy = (options: { copy?: RmmzMapEvent; plugins?: boolean; nest?: boolean; nestOf?: Blueprint; blocked?: boolean } = {}) =>
  {
    const { copy = apartCopy(), plugins = true, nest = true, nestOf = needlerNest(), blocked = false } = options;
    const file = mapWithEvents(16, 12, Array.from({ length: COPY_ID + 1 }, () => null));
    file.events[COPY_ID] = copy;
    const hub = new DocumentHub({ clientId: 'event-window' });
    hub.adopt('map:1', file as unknown as JsonValue);
    holdBlueprints(hub, nest ? { [NEST_ID]: nestOf } : {});
    const modules = new PluginModuleRegistry(new CommandCatalog());
    if (plugins)
    {
      modules.activate([ jabsModule, lightingModule ], [
        { name: 'j/abs/J-ABS', status: true, description: '', parameters: { actionMapId: '9' } },
        { name: 'j/lighting/J-Lighting', status: true, description: '', parameters: {} },
      ]);
    }

    // every window asked for is noted, and opens blank, as a new browser window does, unless pop-ups are blocked.
    const opened: string[] = [];
    const openWindow = (_url: string, name: string) =>
    {
      const target = { location: { href: 'about:blank' }, focus: () => undefined };
      opened.push(name);
      return blocked ? null : target as unknown as Window;
    };
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const services = {
      hub,
      catalog,
      modules,
      commandEditors: new CommandEditorRegistry(),
      api: null,
      pluginHeaders: new PluginHeaderStore(),
      loadCommandResources: async () => undefined,
      openDocument: async (key: DocumentKey) => hub.document(key),
      shell: new WindowShell({ channel: null, origin: 'http://ui', openWindow, readClipboardText: async () => '' }),
    } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <SoundPlayerContext.Provider value={vi.fn()}>
          <EventWindowView mapId={MAP_ID} eventId={COPY_ID}/>
        </SoundPlayerContext.Provider>
      </MapEditorServicesProvider>
    );
    return { hub, modules, opened };
  };

  /**
   * Reads the copy as the window's map holds it.
   * @param {DocumentHub} hub The hub.
   * @returns {RmmzMapEvent} The copy.
   */
  const copyIn = (hub: DocumentHub): RmmzMapEvent => hub.map('map:1').event(COPY_ID) as RmmzMapEvent;

  /**
   * Reads each row the panel shows: the field's name and where it stands.
   * @returns {string[]} The rows, top to bottom.
   */
  const rows = (): string[] => screen.queryAllByTestId('copy-field').map(row => [ ...row.querySelectorAll('p, span') ]
    .filter(each => each.closest('button') === null)
    .map(each => each.textContent)
    .join(' | '));

  /**
   * Reads the steps of the copy's own history, oldest first.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The steps' names.
   */
  const steps = (hub: DocumentHub): string[] => hub.history(HISTORY).rows.map(row => row.label);

  /**
   * Reads what a field says beneath it, as the words it is described by.
   * @param {HTMLElement} field The field.
   * @returns {string | null} The words, or null when it says nothing beneath it.
   */
  const describedBy = (field: HTMLElement): string | null =>
  {
    const id = field.getAttribute('aria-describedby');
    return id === null ? null : document.getElementById(id)?.textContent ?? null;
  };

  it('says what the copy copies, how it stands as a whole, and where its numbers and the fields standing apart stand', () =>
  {
    // Arrange: nothing beyond the copy standing apart.

    // Act.
    renderCopy();

    // Assert: the choices that follow wait behind the toggle.
    expect([
      screen.getByTestId('copy-panel').querySelector('p')?.textContent,
      screen.getByTestId('copy-summary').textContent,
      rows(),
      screen.getByRole('button', { name: 'Show 16 more that follow the blueprint' }) !== null,
    ])
      .toStrictEqual([
        'Event 12 · Copy of event 2 of "Needler nest"',
        '1 field set by hand, 1 pinned, 1 at an offset.',
        [
          'Movement speed | Pinned at 5',
          'Movement frequency | Follows the blueprint',
          'Trigger | Set by hand',
          'Sight | Follows the blueprint, +2',
          'Light 1 radius | Follows the blueprint',
          'Light 1 intensity | Follows the blueprint',
        ],
        true,
      ]);
  });

  it('shows every field once asked, the event\'s own among them, and the numbers and fields apart alone again after', () =>
  {
    // Arrange.
    renderCopy();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Show 16 more that follow the blueprint' }));
    const every = rows();
    const own = within(screen.getByRole('group', { name: 'This event' })).queryAllByTestId('copy-field').length;
    fireEvent.click(screen.getByRole('button', { name: 'Hide the ones that follow the blueprint' }));

    // Assert: with nothing of the event's own apart, its group goes once the rest are hidden.
    expect([ every.length, every.slice(0, 3), own, rows().length, screen.queryByRole('group', { name: 'This event' }) ])
      .toStrictEqual([ 22, [ 'Name | Follows the blueprint', 'Note | Follows the blueprint', 'Movement speed | Pinned at 5' ], 2, 6, null ]);
  });

  it('pins, unpins and follows from a field\'s row, each one step in the event\'s own history, never the map\'s', () =>
  {
    // Arrange.
    const { hub } = renderCopy();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pin movement frequency' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpin movement speed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow trigger' }));

    // Assert: the trigger, following again, goes behind the toggle.
    expect([ steps(hub), hub.history(mapHistoryKey(MAP_ID)).rows.length, copyIn(hub).note, copyIn(hub).pages[0].trigger, rows().slice(0, 3) ])
      .toStrictEqual([
        [ 'Pin movement frequency (page 1)', 'Unpin movement speed (page 1)', 'Follow the blueprint\'s trigger (page 1)' ],
        0,
        '<blueprint:[k3x9q2mf, 2, p1.speed+2, p1.sight+2, p1.frequency=3]>',
        0,
        [ 'Movement speed | Follows the blueprint, +2', 'Movement frequency | Pinned at 3', 'Sight | Follows the blueprint, +2' ],
      ]);
  });

  it('says commands naming other events of the blueprint are kept as the copy\'s own, offering nothing to follow', () =>
  {
    // Arrange: the nest's needler turns its event 3, standing beside it, whose copy here nobody knows; the copy, as placed,
    // turns 15.
    const nestOf = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3, x: 0, y: 0 } ]);
    const copy = copyOf(event(2, [ page([ turnOf(15) ]) ], { name: 'Needler' }));

    // Act.
    renderCopy({ copy, nestOf });

    // Assert: the commands' row offers no action, and nothing else stands apart to follow.
    const commandsRow = screen.getAllByTestId('copy-field').find(row => row.textContent?.startsWith('Commands') === true) as HTMLElement;
    expect([
      screen.getByTestId('copy-summary').textContent,
      within(commandsRow).getByTestId('copy-field-state').textContent,
      within(commandsRow).queryAllByRole('button').length,
      (screen.getByRole('button', { name: 'Follow the blueprint again' }) as HTMLButtonElement).disabled,
    ])
      .toStrictEqual([
        'Follows the blueprint, but its commands name other events in the blueprint, so this copy keeps its own.',
        'These commands name other events in the blueprint, so this copy keeps its own',
        0,
        true,
      ]);
  });

  it('follows the blueprint again in everything, then unlinks the copy, which then shows no panel at all', () =>
  {
    // Arrange.
    const { hub } = renderCopy();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Follow the blueprint again' }));
    const followed = [ screen.getByTestId('copy-summary').textContent, (screen.getByRole('button', { name: 'Follow the blueprint again' }) as HTMLButtonElement).disabled ];
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));

    // Assert.
    expect([ followed, steps(hub), copyIn(hub).note, screen.queryByTestId('copy-panel'), screen.queryByRole('region', { name: 'Blueprint' }) ])
      .toStrictEqual([
        [ 'Follows the blueprint in everything.', true ],
        [ 'Follow "Needler nest" again', 'Unlink from "Needler nest"' ],
        '',
        null,
        null,
      ]);
  });

  it('shows the note\'s own text in the Note box, and writes what is typed there before the link, kept exactly', () =>
  {
    // Arrange: a copy noting "Guards the gate".
    const { hub } = renderCopy({ copy: copyOf({ ...needler(), note: 'Guards the gate' }, [ 'p1.speed+1' ]) });
    const note = screen.getByLabelText('Note') as HTMLInputElement;
    const shown = note.value;

    // Act.
    fireEvent.change(note, { target: { value: 'Guards the west gate' } });
    fireEvent.blur(note);

    // Assert.
    expect([ shown, copyIn(hub).note, steps(hub), (screen.getByLabelText('Note') as HTMLInputElement).value ])
      .toStrictEqual([
        'Guards the gate',
        'Guards the west gate\n<blueprint:[k3x9q2mf, 2, p1.speed+1]>',
        [ 'Edit event note' ],
        'Guards the west gate',
      ]);
  });

  it('refuses a second link typed in the Note box, keeping what was typed there with why beneath it, and the note', () =>
  {
    // Arrange.
    const { hub } = renderCopy({ copy: copyOf(needler()) });
    const note = screen.getByLabelText('Note') as HTMLInputElement;

    // Act.
    fireEvent.change(note, { target: { value: 'Guards the gate\n<blueprint:[aa22, 1]>' } });
    fireEvent.blur(note);

    // Assert: the refusal sits beside the box, never in a passing notice.
    expect([ copyIn(hub).note, steps(hub), note.value, describedBy(note), note.getAttribute('aria-invalid'), screen.queryByRole('alert') ])
      .toStrictEqual([
        '<blueprint:[k3x9q2mf, 2]>',
        [],
        'Guards the gate\n<blueprint:[aa22, 1]>',
        'This event\'s link to its blueprint is kept for you, so the note can\'t hold a second one.',
        'true',
        null,
      ]);
  });

  it('keeps a stray < typed in the Note box with why beneath it, and puts the note\'s own text back on Escape', () =>
  {
    // Arrange: a copy noting "Guards the gate", the stray < typed and refused.
    const { hub } = renderCopy({ copy: copyOf({ ...needler(), note: 'Guards the gate' }) });
    const note = screen.getByLabelText('Note') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'Guards the <north gate' } });
    fireEvent.blur(note);
    const refused = [ note.value, describedBy(note) ];

    // Act.
    fireEvent.keyDown(note, { key: 'Escape' });

    // Assert.
    expect([ refused, note.value, describedBy(note), note.getAttribute('aria-invalid'), copyIn(hub).note, steps(hub) ])
      .toStrictEqual([
        [
          'Guards the <north gate',
          'The note can\'t be written: a stray < in it gets mixed up with the blueprint link; take that < out, or finish its tag with a >, then try again.',
        ],
        'Guards the gate',
        null,
        'false',
        'Guards the gate\n<blueprint:[k3x9q2mf, 2]>',
        [],
      ]);
  });

  it('writes the Note box once the refused text is mended, and the refusal goes', () =>
  {
    // Arrange: a second link typed and refused.
    const { hub } = renderCopy({ copy: copyOf(needler()) });
    const note = screen.getByLabelText('Note') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'Guards the gate <blueprint:[aa22, 1]>' } });
    fireEvent.blur(note);

    // Act: the link taken out again, and the box left.
    fireEvent.change(note, { target: { value: 'Guards the gate' } });
    fireEvent.blur(note);

    // Assert.
    expect([ copyIn(hub).note, steps(hub), note.value, describedBy(note) ])
      .toStrictEqual([ 'Guards the gate\n<blueprint:[k3x9q2mf, 2]>', [ 'Edit event note' ], 'Guards the gate', null ]);
  });

  it('opens the event of the blueprint the copy was made from in its own window', () =>
  {
    // Arrange.
    const { opened } = renderCopy();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Open blueprint' }));

    // Assert.
    expect(opened)
      .toStrictEqual([ 'jmz-blueprint-event-k3x9q2mf-2' ]);
  });

  it('says so when the blueprint\'s window was blocked', () =>
  {
    // Arrange.
    renderCopy({ blocked: true });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Open blueprint' }));

    // Assert.
    expect(screen.getByRole('alert').textContent)
      .toBe('The blueprint\'s window was blocked; allow pop-ups for the editor to open it.');
  });

  it('says why no change reaches a drifted copy, offering to follow again, and why a lost one has nothing to follow', () =>
  {
    // Arrange: a copy of two pages, and, in a window keeping no blueprint, a copy of a blueprint gone.
    renderCopy({ copy: copyOf(event(2, [ needler().pages[0], needler().pages[0] ], { name: 'Needler' })) });
    const drifted = [ screen.getByTestId('copy-summary').textContent, (screen.getByRole('button', { name: 'Follow the blueprint again' }) as HTMLButtonElement).disabled, rows() ];

    // Act.
    document.body.innerHTML = '';
    renderCopy({ nest: false });

    // Assert.
    expect([
      drifted,
      screen.getByTestId('copy-panel').querySelector('p')?.textContent,
      screen.getByTestId('copy-summary').textContent,
      screen.queryByRole('button', { name: 'Follow the blueprint again' }),
      screen.queryByRole('button', { name: 'Open blueprint' }),
      screen.queryByRole('button', { name: 'Unlink' }) !== null,
    ])
      .toStrictEqual([
        [ 'No change to the blueprint reaches it: it has 2 pages and its blueprint has 1 page.', false, [] ],
        'Event 12 · Copy of a blueprint that is gone',
        'Its blueprint is gone.',
        null,
        null,
        true,
      ]);
  });

  it('tells nothing until the project\'s plugins are read, then reads the copy once they are', () =>
  {
    // Arrange.
    const { modules } = renderCopy({ plugins: false });
    const waiting = screen.getByTestId('copy-panel-waiting').textContent;

    // Act.
    act(() =>
    {
      modules.activate([ jabsModule, lightingModule ], [
        { name: 'j/abs/J-ABS', status: true, description: '', parameters: { actionMapId: '9' } },
        { name: 'j/lighting/J-Lighting', status: true, description: '', parameters: {} },
      ]);
    });

    // Assert.
    expect([ waiting, screen.getByTestId('copy-summary').textContent ])
      .toStrictEqual([ 'Reading the project\'s plugins', '1 field set by hand, 1 pinned, 1 at an offset.' ]);
  });
});

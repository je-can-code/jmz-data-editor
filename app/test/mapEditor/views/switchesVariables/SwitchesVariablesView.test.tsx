/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DocumentHub, type DocumentStore, type HistoryCheck } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { SYSTEM_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { SYSTEM_KEY } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { SystemDocument } from '../../../../src/mapEditor/core/model/JsonDocument.ts';
import { WindowPreview } from '../../../../src/mapEditor/core/preview/WindowPreview.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { SwitchesVariablesView } from '../../../../src/mapEditor/views/switchesVariables/SwitchesVariablesView.tsx';

/*
 * The Switches & Variables window lists every switch and every variable by number and name, unnamed ones included, each
 * list searchable by number or name. A name is a real edit to System.json: one step in the names' own history, which the
 * window's Undo and Redo, and Ctrl+Z and Ctrl+Y, step through, and which its Save, or Ctrl+S, writes the way the editor
 * writes everything. The maximum adds or takes away switches and variables at the end, as one step too.
 *
 * Beside each name sits the preview, which is never written into the game: a switch's on and off toggle and a variable's
 * value, both changing the window's preview at once, which every map judges its events' pages against. The window says
 * what the preview sets, and "Back to a fresh save" clears all of it. Whatever fails, a save or an undo something else
 * stands in the way of, is said in the window rather than lost; the window opens its names from another window's copy or
 * the file, and says so plainly when they cannot be opened at all.
 */
describe('SwitchesVariablesView', () =>
{
  /**
   * System.json: three switches, the second unnamed, and two variables.
   * @returns {JsonValue} The settings.
   */
  const buildSystem = (): JsonValue => ({
    gameTitle: 'Chef Adventure',
    switches: [ '', 'partner-visible', '', 'after the vampire' ],
    variables: [ '', 'Enemies Defeated', 'Parries' ],
  });

  /**
   * Renders the window over a real hub and a window preview.
   * @param {object} options Whether the hub holds the names already, what opening them does, and the store.
   * @returns {object} The hub, the store, the preview and the opener.
   */
  const renderView = (options: { held?: boolean; open?: () => Promise<unknown>; store?: DocumentStore } = {}) =>
  {
    const store = options.store ?? { load: vi.fn(async () => buildSystem()), save: vi.fn(async () => undefined) };
    const hub = new DocumentHub({ clientId: 'window-names', store });
    if (options.held !== false)
    {
      hub.adopt(SYSTEM_KEY, buildSystem());
    }

    const preview = new WindowPreview();
    const openDocument = vi.fn(options.open ?? (async () => hub.load(SYSTEM_KEY)));
    const services = { hub, preview, openDocument } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <SwitchesVariablesView/>
      </MapEditorServicesProvider>
    );
    return { hub, store, preview, openDocument };
  };

  /**
   * Reads the names a hub holds for one list.
   * @param {DocumentHub} hub The hub.
   * @param {'switches' | 'variables'} list Which list.
   * @returns {readonly string[]} The names.
   */
  const namesIn = (hub: DocumentHub, list: 'switches' | 'variables'): readonly string[] => (hub.document(SYSTEM_KEY) as SystemDocument).names(list);

  /**
   * Types a name into a field and leaves it, as the author does.
   * @param {string} label The field's label.
   * @param {string} value What is typed.
   */
  const typeAndLeave = (label: string, value: string) =>
  {
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
  };

  it('lists every switch and variable by number and name, the unnamed ones too, and a fresh save', () =>
  {
    // Arrange: nothing beyond the render.

    // Act.
    renderView();

    // Assert.
    const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect([
      [ 'Name of switch 1', 'Name of switch 2', 'Name of switch 3', 'Name of variable 1', 'Name of variable 2' ].map(value),
      screen.getByTestId('switch-row-3').textContent?.startsWith('0003'),
      screen.getByTestId('preview-words').textContent,
      (screen.getByRole('button', { name: 'Back to a fresh save' }) as HTMLButtonElement).disabled,
    ])
      .toStrictEqual([ [ 'partner-visible', '', 'after the vampire', 'Enemies Defeated', 'Parries' ], true, 'Maps show: Fresh save', true ]);
  });

  it('finds a switch by its number and a variable by its name, and says when nothing has either', () =>
  {
    // Arrange.
    renderView();

    // Act: switch 3 by number, the variables by "parr", then the switches by a name none has.
    fireEvent.change(screen.getByPlaceholderText('Find a switch by number or name'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('Find a variable by number or name'), { target: { value: 'parr' } });
    const found = [ screen.queryByTestId('switch-row-1'), screen.queryByTestId('switch-row-3') !== null, screen.queryByTestId('variable-row-1'), screen.queryByTestId('variable-row-2') !== null ];
    fireEvent.change(screen.getByPlaceholderText('Find a switch by number or name'), { target: { value: 'castle' } });

    // Assert.
    expect([ found, screen.getByText('No switch has that number or name.') instanceof HTMLElement ])
      .toStrictEqual([ [ null, true, null, true ], true ]);
  });

  it('renames a switch as a step in the names\' history, and saves only once there is something to save', async () =>
  {
    // Arrange.
    const { hub, store } = renderView();
    const cleanAtFirst = (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled;

    // Act: switch 2 named, then saved.
    typeAndLeave('Name of switch 2', 'mayor wolf defeated.');
    const unsaved = screen.getByText('Unsaved names').textContent;
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    // Assert.
    expect([
      cleanAtFirst,
      hub.history(SYSTEM_HISTORY_KEY).rows.map(row => row.label),
      unsaved,
      vi.mocked(store.save).mock.calls.map(([ key, content ]) => [ key, (content as { switches: string[] }).switches ]),
      screen.getByText('Names saved') instanceof HTMLElement,
    ])
      .toStrictEqual([
        true,
        [ 'Rename switch 2' ],
        'Unsaved names',
        [ [ SYSTEM_KEY, [ '', 'partner-visible', 'mayor wolf defeated.', 'after the vampire' ] ] ],
        true,
      ]);
  });

  it('undoes and redoes a rename with its buttons, and saves with Ctrl+S from anywhere', async () =>
  {
    // Arrange: variable 2 renamed.
    const { hub, store } = renderView();
    typeAndLeave('Name of variable 2', 'Parries (all kinds)');

    // Act: undone, then redone, then saved with the keys.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const [ , , undone ] = namesIn(hub, 'variables');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await act(async () =>
    {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await Promise.resolve();
    });

    // Assert.
    expect([ undone, namesIn(hub, 'variables')[2], vi.mocked(store.save).mock.calls.length ])
      .toStrictEqual([ 'Parries', 'Parries (all kinds)', 1 ]);
  });

  it('saves a name still being typed with Ctrl+S in its box, leaving the box focused', async () =>
  {
    // Arrange: switch 2's name typed, the box never left.
    const { hub, store } = renderView();
    const field = screen.getByLabelText('Name of switch 2');
    field.focus();
    fireEvent.change(field, { target: { value: 'mayor wolf defeated.' } });

    // Act.
    await act(async () =>
    {
      fireEvent.keyDown(field, { key: 's', ctrlKey: true });
      await Promise.resolve();
    });

    // Assert.
    expect([
      vi.mocked(store.save).mock.calls.map(([ , content ]) => (content as { switches: string[] }).switches[2]),
      hub.isDirty(SYSTEM_KEY),
      document.activeElement === field,
    ])
      .toStrictEqual([ [ 'mayor wolf defeated.' ], false, true ]);
  });

  it('steps through the names\' history with Ctrl+Z and Ctrl+Y outside a text box', () =>
  {
    // Arrange: switch 1 renamed.
    const { hub } = renderView();
    typeAndLeave('Name of switch 1', 'partner');

    // Act.
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    const [ , undone ] = namesIn(hub, 'switches');
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    // Assert.
    expect([ undone, namesIn(hub, 'switches')[1] ])
      .toStrictEqual([ 'partner-visible', 'partner' ]);
  });

  it('says why an undo cannot happen, and nothing when there is merely nothing to undo', () =>
  {
    // Arrange: an undo refused by an edit in its way, after one refused for having nothing.
    const { hub } = renderView();
    typeAndLeave('Name of switch 1', 'partner');
    const refusal = { ok: false, reason: 'conflict', step: null, blockedBy: null, message: '"Rename switch 1" later changed what this changed' } as unknown as HistoryCheck;
    vi.spyOn(hub, 'undo').mockReturnValueOnce({ ok: false, reason: 'nothing', historyKey: SYSTEM_HISTORY_KEY })
      .mockReturnValueOnce(refusal);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const quiet = screen.queryByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // Assert.
    expect([ quiet, screen.getByRole('alert').textContent ])
      .toStrictEqual([ null, '"Rename switch 1" later changed what this changed' ]);
  });

  it('says why a save failed, keeping the names unsaved', async () =>
  {
    // Arrange: a server refusing the save.
    const store: DocumentStore = { load: vi.fn(async () => buildSystem()), save: vi.fn(async () => Promise.reject(new Error('disk full'))) };
    const { hub } = renderView({ store });
    typeAndLeave('Name of switch 1', 'partner');

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.getByRole('alert').textContent, hub.isDirty(SYSTEM_KEY) ])
      .toStrictEqual([ 'The names were not saved: disk full', true ]);
  });

  it('holds back a save while the names wait for a choice about changes made elsewhere, saying so', async () =>
  {
    // Arrange: switch 1 renamed while System.json changed on disk.
    const { hub, store } = renderView();
    typeAndLeave('Name of switch 1', 'partner');
    act(() => hub.flagConflict(SYSTEM_KEY, { kind: 'disk', content: buildSystem() }));

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.getByRole('alert').textContent, vi.mocked(store.save).mock.calls.length, hub.isDirty(SYSTEM_KEY) ])
      .toStrictEqual([ 'The names were not saved: they are waiting for a choice about changes made elsewhere.', 0, true ]);
  });

  it('puts a problem away once it is dismissed', async () =>
  {
    // Arrange: a save that failed.
    const store: DocumentStore = { load: vi.fn(async () => buildSystem()), save: vi.fn(async () => Promise.reject(new Error('disk full'))) };
    renderView({ store });
    typeAndLeave('Name of switch 1', 'partner');
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });
    const shown = screen.queryByRole('alert') !== null;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert.
    expect([ shown, screen.queryByRole('alert') ])
      .toStrictEqual([ true, null ]);
  });

  it('fills the height its window gives each list, drawing only the rows in sight', () =>
  {
    // Arrange: thirty named switches, and lists that measure 88 pixels, two rows' worth.
    const disconnected: string[] = [];
    vi.stubGlobal('ResizeObserver', class
    {
      #callback: (entries: { contentRect: { height: number } }[]) => void;

      constructor(callback: (entries: { contentRect: { height: number } }[]) => void)
      {
        this.#callback = callback;
      }

      observe(): void
      {
        this.#callback([ { contentRect: { height: 88 } } ]);
      }

      disconnect(): void
      {
        disconnected.push('list');
      }
    });
    const switches = [ '', ...Array.from({ length: 30 }, (_, index) => `switch ${index + 1}`) ];
    const store: DocumentStore = { load: vi.fn(async () => ({ switches, variables: [ '' ] })), save: vi.fn(async () => undefined) };
    const hub = new DocumentHub({ clientId: 'window-names', store });
    hub.adopt(SYSTEM_KEY, { switches, variables: [ '', 'Gold' ] });
    const services = { hub, preview: new WindowPreview(), openDocument: vi.fn() } as unknown as MapEditorServices;

    // Act.
    const shown = render(
      <MapEditorServicesProvider services={services}>
        <SwitchesVariablesView/>
      </MapEditorServicesProvider>
    );
    const rows = screen.getAllByTestId(/^switch-row-/u).length;
    shown.unmount();
    vi.unstubAllGlobals();

    // Assert: the two rows in sight and eight beyond them, then each list let go of its measuring.
    expect([ rows, disconnected ])
      .toStrictEqual([ 10, [ 'list', 'list' ] ]);
  });

  it('says why a rename failed rather than losing it', () =>
  {
    // Arrange: a hub refusing every edit.
    const { hub } = renderView();
    vi.spyOn(hub, 'edit').mockImplementation(() =>
    {
      throw new Error('another edit is open');
    });

    // Act.
    typeAndLeave('Name of switch 1', 'partner');

    // Assert.
    expect(screen.getByRole('alert').textContent)
      .toBe('another edit is open');
  });

  it('turns a switch on for every map, counting it, and back to a fresh save', () =>
  {
    // Arrange.
    const { preview } = renderView();

    // Act: switch 3 on.
    fireEvent.click(screen.getByLabelText('Show switch 3 on'));
    const turnedOn = [ preview.preview().switchesOn(), screen.getByTestId('preview-words').textContent, screen.getByText('1 on') instanceof HTMLElement ];
    fireEvent.click(screen.getByRole('button', { name: 'Back to a fresh save' }));

    // Assert.
    expect([ turnedOn, preview.preview().isFresh, (screen.getByLabelText('Show switch 3 on') as HTMLInputElement).checked ])
      .toStrictEqual([ [ [ 3 ], 'Maps show: 1 switch on', true ], true, false ]);
  });

  it('sets a variable for every map as soon as its box holds a whole number, and goes back to it on leaving', () =>
  {
    // Arrange.
    const { preview } = renderView();
    const box = screen.getByLabelText('Show variable 2 at') as HTMLInputElement;

    // Act: 9, then 99, then a lone minus sign on the way to a negative number, then leaving the box.
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '9' } });
    fireEvent.change(box, { target: { value: '99' } });
    fireEvent.change(box, { target: { value: '-' } });
    const typing = [ box.value, preview.preview().variable(2) ];
    fireEvent.blur(box);

    // Assert.
    expect([ typing, box.value, screen.getByTestId('preview-words').textContent, screen.getByText('1 set') instanceof HTMLElement ])
      .toStrictEqual([ [ '-', 99 ], '99', 'Maps show: 1 variable set', true ]);
  });

  it('follows a preview changed in another window in a box nobody is typing in', () =>
  {
    // Arrange.
    const { preview } = renderView();

    // Act: variable 1 set elsewhere.
    act(() => preview.setVariable(1, 12));

    // Assert.
    expect((screen.getByLabelText('Show variable 1 at') as HTMLInputElement).value)
      .toBe('12');
  });

  it('adds switches at the end when the maximum rises, and ignores a maximum that is no number', () =>
  {
    // Arrange.
    const { hub } = renderView();
    const [ switchMaximum ] = screen.getAllByLabelText('Maximum');

    // Act: "lots", then 5.
    fireEvent.change(switchMaximum, { target: { value: 'lots' } });
    fireEvent.blur(switchMaximum);
    const ignored = namesIn(hub, 'switches').length;
    fireEvent.change(switchMaximum, { target: { value: '5' } });
    fireEvent.blur(switchMaximum);

    // Assert.
    expect([ ignored, namesIn(hub, 'switches'), screen.getByTestId('switch-row-5') instanceof HTMLElement ])
      .toStrictEqual([ 4, [ '', 'partner-visible', '', 'after the vampire', '', '' ], true ]);
  });

  it('refuses a maximum that would take a name with it, saying why, and puts the field back', () =>
  {
    // Arrange: switch 3 named last.
    const { hub } = renderView();
    const [ switchMaximum ] = screen.getAllByLabelText('Maximum');

    // Act: down to 2.
    fireEvent.change(switchMaximum, { target: { value: '2' } });
    fireEvent.blur(switchMaximum);

    // Assert.
    expect([ screen.getByRole('alert').textContent, namesIn(hub, 'switches'), (switchMaximum as HTMLInputElement).value ])
      .toStrictEqual([
        'Switch 3 is still named "after the vampire", so the switches cannot go below 3. Clear the names above the new maximum first.',
        [ '', 'partner-visible', '', 'after the vampire' ],
        '3',
      ]);
  });

  it('opens the names when the window does not hold them yet, waiting with a spinner', async () =>

  {
    // Arrange: a window holding nothing, its open answering when the test says.
    let finish: () => void = () => undefined;
    const { hub, openDocument } = renderView({
      held: false,
      open: () => new Promise<void>(resolve =>
      {
        finish = resolve;
      }),
    });
    const waiting = screen.getByLabelText('Opening the switches and variables') instanceof HTMLElement;

    // Act.
    await act(async () =>
    {
      hub.adopt(SYSTEM_KEY, buildSystem());
      finish();
      await Promise.resolve();
    });

    // Assert.
    expect([ waiting, openDocument.mock.calls.length, (screen.getByLabelText('Name of switch 1') as HTMLInputElement).value ])
      .toStrictEqual([ true, 1, 'partner-visible' ]);
  });

  it('says plainly when the names cannot be opened', async () =>
  {
    // Arrange: an open that fails.
    renderView({ held: false, open: async () => Promise.reject(new Error('System.json does not exist')) });

    // Act.
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect(screen.getByRole('alert').textContent)
      .toBe('The switches and variables could not be opened: System.json does not exist');
  });
});

/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { GeneratedCommandForm } from '../../../../src/mapEditor/views/commandList/GeneratedCommandForm.tsx';
import type { LocationPickerDialogProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx';
import { cmd } from '../../support/commandFixtures.ts';

/**
 * Where the stand-in picker was last asked to start.
 */
const stand = vi.hoisted(() => ({
  starts: [] as unknown[],
}));

// the picker itself is proved in its own tests; here it stands in as one button picking tile 4, 3 on map 5, and notes
// where it was asked to start.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx', () =>
{
  /**
   * Stands in for the picker.
   * @param {LocationPickerDialogProps} props Where it starts, and who hears how it ends.
   * @returns {React.JSX.Element} A button picking a tile.
   */
  const LocationPickerDialog = (props: LocationPickerDialogProps) =>
  {
    const { start, onClose } = props;
    stand.starts.push(start);
    return <button type={'button'} onClick={() => onClose({ mapId: 5, x: 4, y: 3 })}>Pick tile 4, 3 on map 5</button>;
  };

  return { LocationPickerDialog };
});

/*
 * A command's generated form offers the location picker for any place among its inputs: Set Vehicle Location's map and
 * tile. It owes the author the button right where the place's fields are, only while all three show (a place given by
 * variables has nothing on a map to click), and only with a project server to read maps from. The picker starts on the
 * place the command holds now, and the place picked becomes the command's map and tile, with the vehicle and the way
 * the place is given left as they were. A command with no place offers no picker at all.
 */
describe('GeneratedCommandForm', () =>
{
  /**
   * Finds a built-in entry by code.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entryOf = (code: number): CommandCatalogEntry => BUILT_IN_ENTRIES.find(entry => entry.code === code) as CommandCatalogEntry;

  /**
   * Renders a command's form, with a server behind it unless told otherwise.
   * @param {CommandCatalogEntry} entry The command's entry.
   * @param {CommandDraft} draft The command.
   * @param {boolean} served Whether there is a server.
   * @returns {ReturnType<typeof vi.fn>} What the form handed over.
   */
  const renderForm = (entry: CommandCatalogEntry, draft: CommandDraft, served = true) =>
  {
    const onChange = vi.fn<(draft: CommandDraft) => void>();
    const api = served ? {} as MapEditorApi : null;
    render(<GeneratedCommandForm entry={entry} draft={draft} onChange={onChange} names={null} api={api} playSound={vi.fn()}/>);
    return onChange;
  };

  /**
   * The airship, parked on map 12 at 7, 8, the place given directly.
   */
  const PARKED: CommandDraft = { command: cmd(202, 0, [ 2, 0, 12, 7, 8 ]), continuation: [] };

  it('picks a vehicle\'s place on the map, starting from where it is now, and writes the map and the tile picked', () =>
  {
    // Arrange.
    stand.starts.splice(0);
    const onChange = renderForm(entryOf(202), PARKED);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick tile 4, 3 on map 5' }));

    // Assert: the vehicle and the way the place is given stay.
    expect([ stand.starts, onChange.mock.calls ])
      .toStrictEqual([ [ { mapId: 12, x: 7, y: 8 } ], [ [ { command: cmd(202, 0, [ 2, 0, 5, 4, 3 ]), continuation: [] } ] ] ]);
  });

  it('offers no picker for a place given by variables', () =>
  {
    // Arrange: the airship's place comes from variables 3, 4 and 5.
    const fromVariables: CommandDraft = { command: cmd(202, 0, [ 2, 1, 3, 4, 5 ]), continuation: [] };

    // Act.
    renderForm(entryOf(202), fromVariables);

    // Assert: the variables show, and nothing to pick.
    expect([ screen.getByLabelText('Map from') !== null, screen.queryByRole('button', { name: 'Pick on the map' }) ])
      .toStrictEqual([ true, null ]);
  });

  it('offers no picker without a server', () =>
  {
    // Arrange: nothing beyond the form, over no server.

    // Act.
    renderForm(entryOf(202), PARKED, false);

    // Assert: the place shows, and nothing to pick it with.
    expect([ (screen.getByLabelText('X') as HTMLInputElement).value, screen.queryByRole('button', { name: 'Pick on the map' }) ])
      .toStrictEqual([ '7', null ]);
  });

  it('offers no picker for a command with no place', () =>
  {
    // Arrange: a wait of 30 frames.
    const wait: CommandDraft = { command: cmd(230, 0, [ 30 ]), continuation: [] };

    // Act.
    renderForm(entryOf(230), wait);

    // Assert: its field shows, and nothing to pick.
    expect([ screen.getAllByRole('spinbutton').length > 0, screen.queryByRole('button', { name: 'Pick on the map' }) ])
      .toStrictEqual([ true, null ]);
  });
});

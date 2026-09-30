/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { CommandField } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { SoundPlayer } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { FieldControl, isWideField } from '../../../../src/mapEditor/views/commandList/FieldControl.tsx';

/*
 * Each input of a generated form is drawn by the control its kind asks for, and every control owes the command the
 * same two things: showing a value never changes it (a value no option names is offered as it is), and a change is
 * handed over whole, once the author is done, in the shape the command keeps (bounded numbers, ids, text for fields
 * kept as text). Picking by name needs the project's names; without them, ids are typed as numbers. No sound plays:
 * the player is a stub.
 */
describe('FieldControl', () =>
{
  /**
   * The project's names: two switches, one actor.
   * @returns {DatabaseNamesJson} The names.
   */
  const buildNames = (): DatabaseNamesJson => ({
    switches: [ '', 'Door Open', 'Gate' ],
    variables: [],
    actors: [ '', 'Harold' ],
    classes: [],
    skills: [],
    items: [],
    weapons: [],
    armors: [],
    enemies: [],
    troops: [],
    states: [],
    animations: [],
    tilesets: [],
    commonEvents: [],
    maps: [],
    equipTypes: [],
  });

  /**
   * Draws one control and records what it hands over.
   * @param {CommandField} field The field.
   * @param {JsonValue | undefined} value Its value.
   * @param {object} options The names, the server and the player.
   * @returns {{ onChange: ReturnType<typeof vi.fn>, playSound: ReturnType<typeof vi.fn> }} The records.
   */
  const renderControl = (
    field: CommandField,
    value: JsonValue | undefined,
    options: { names?: DatabaseNamesJson | null; api?: MapEditorApi | null } = {},
  ) =>
  {
    const onChange = vi.fn<(value: JsonValue) => void>();
    const playSound = vi.fn<SoundPlayer>();
    render(
      <FieldControl
        field={field}
        value={value}
        onChange={onChange}
        names={options.names ?? null}
        api={options.api ?? null}
        playSound={playSound}
      />
    );
    return { onChange, playSound };
  };

  it('hands over a number once the author leaves it, bounded by the field, and nothing for text that is no number', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'frames', label: 'Frames', param: [ 0 ], kind: 'number', min: 1, max: 999 }, 30);
    const input = screen.getByLabelText('Frames');

    // Act.
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ 999 ] ]);
  });

  it('hands over several lines of text on Ctrl+Enter, and puts the command\'s text back on Escape', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'text', label: 'Text', param: [ 0 ], kind: 'multiline', lines: 'continuation' }, 'Hello.');
    const input = screen.getByLabelText('Text');

    // Act.
    fireEvent.change(input, { target: { value: 'Hello.\nAgain.' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const afterPlainEnter = onChange.mock.calls.length;
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.change(input, { target: { value: 'Oops' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Assert.
    expect([ afterPlainEnter, onChange.mock.calls, (input as HTMLTextAreaElement).value ])
      .toStrictEqual([ 0, [ [ 'Hello.\nAgain.' ] ], 'Hello.' ]);
  });

  it('toggles a checkbox at once, as text for a field kept as text', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'locked', label: 'Locked', param: [ 3, 'locked' ], kind: 'boolean', storage: 'string' }, 'false');

    // Act.
    fireEvent.click(screen.getByLabelText('Locked'));

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ 'true' ] ]);
  });

  it('picks a choice at once, and offers a value no choice names as it is', () =>
  {
    // Arrange.
    const field: CommandField = { key: 'fade', label: 'Fade', param: [ 5 ], kind: 'select', options: [ { value: 0, label: 'Black' }, { value: 1, label: 'White' } ] };
    const { onChange } = renderControl(field, 7);

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Fade'));
    const offered = screen.getAllByRole('option').map(option => option.textContent);
    fireEvent.click(screen.getByRole('option', { name: 'White' }));

    // Assert.
    expect([ offered, onChange.mock.calls ])
      .toStrictEqual([ [ 'Black', 'White', 'Other (7)' ], [ [ 1 ] ] ]);
  });

  it('picks a switch by name once the names arrive', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'switch', label: 'Switch', param: [ 0 ], kind: 'switch' }, 1, { names: buildNames() });
    const input = screen.getByLabelText('Switch') as HTMLInputElement;
    const shown = input.value;

    // Act.
    fireEvent.change(input, { target: { value: 'gate' } });
    fireEvent.click(screen.getByRole('option', { name: '#0002 Gate' }));

    // Assert.
    expect([ shown, onChange.mock.calls ])
      .toStrictEqual([ '#0001 Door Open', [ [ 2 ] ] ]);
  });

  it('offers a field\'s special values beside the rows, and keeps ids as text for a field kept as text', () =>
  {
    // Arrange: the whole party, before the actors.
    const field: CommandField = { key: 'actor', label: 'Actor', param: [ 3, 'actorId' ], kind: 'actor', storage: 'string', options: [ { value: 0, label: 'Entire Party' } ] };
    const { onChange } = renderControl(field, '0', { names: buildNames() });
    const input = screen.getByLabelText('Actor') as HTMLInputElement;
    const shown = input.value;

    // Act.
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByRole('option', { name: '#1 Harold' }));

    // Assert.
    expect([ shown, onChange.mock.calls ])
      .toStrictEqual([ 'Entire Party', [ [ '1' ] ] ]);
  });

  it('types an id as a number until the names arrive', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'switch', label: 'Switch', param: [ 0 ], kind: 'switch' }, 4);
    const input = screen.getByLabelText('Switch') as HTMLInputElement;

    // Act.
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);

    // Assert.
    expect([ input.type, onChange.mock.calls ])
      .toStrictEqual([ 'number', [ [ 12 ] ] ]);
  });

  it('picks the player, this event, or another event by id', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'character', label: 'Character', param: [ 0 ], kind: 'event' }, 5);
    const idShown = (screen.getByLabelText('Event id') as HTMLInputElement).value;

    // Act.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Character' }));
    fireEvent.click(screen.getByRole('option', { name: 'Player' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Character' }));
    fireEvent.click(screen.getAllByRole('option', { name: 'This Event' }).at(-1) as HTMLElement);

    // Assert.
    expect([ idShown, onChange.mock.calls ])
      .toStrictEqual([ '5', [ [ -1 ], [ 0 ] ] ]);
  });

  it('leaves the player out of a character field that starts at this event, as Set Event Location does', () =>
  {
    // Arrange: an event field whose lowest id is this event.
    renderControl({ key: 'character', label: 'Event', param: [ 0 ], kind: 'event', min: 0 }, 0);

    // Act.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Event' }));

    // Assert.
    expect(screen.getAllByRole('option').map(option => option.textContent))
      .toStrictEqual([ 'This Event', 'Another event' ]);
  });

  it('still offers the player in such a field when the command already names the player', () =>
  {
    // Arrange: a command another tool wrote with the player in it.
    renderControl({ key: 'character', label: 'Event', param: [ 0 ], kind: 'event', min: 0 }, -1);

    // Act.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Event' }));

    // Assert.
    expect(screen.getAllByRole('option').map(option => option.textContent))
      .toStrictEqual([ 'Player', 'This Event', 'Another event' ]);
  });

  it('edits a sound\'s name and volume, and plays it as the game would', () =>
  {
    // Arrange.
    const api = { audioUrl: (folder: string, name: string) => `audio/${folder}/${name}` } as unknown as MapEditorApi;
    const field: CommandField = { key: 'audio', label: 'Sound', param: [ 0 ], kind: 'audio', folder: 'se' };
    const { onChange, playSound } = renderControl(field, { name: 'Heal1', volume: 90, pitch: 120, pan: 0 }, { api });

    // Act.
    const volume = screen.getByLabelText('Volume');
    fireEvent.change(volume, { target: { value: '50' } });
    fireEvent.blur(volume);
    fireEvent.click(screen.getByRole('button', { name: 'Play sound' }));

    // Assert.
    expect([ onChange.mock.calls, playSound.mock.calls ])
      .toStrictEqual([ [ [ { name: 'Heal1', volume: 50, pitch: 120, pan: 0 } ] ], [ [ 'audio/se/Heal1', { volume: 90, pitch: 120 } ] ] ]);
  });

  it('offers no playing for a sound with no file, or without a server', () =>
  {
    // Arrange.
    const field: CommandField = { key: 'audio', label: 'Sound', param: [ 0 ], kind: 'audio', folder: 'se' };

    // Act.
    renderControl(field, { name: '', volume: 90, pitch: 100, pan: 0 });

    // Assert.
    expect(screen.getByRole('button', { name: 'Play sound' }))
      .toBeDisabled();
  });

  it('edits a tone channel by channel, naming its fourth channel gray', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'tone', label: 'Tone', param: [ 0 ], kind: 'color', min: -255, max: 255 }, [ 0, 0, 0, 0 ]);
    const blue = screen.getByLabelText('Blue');

    // Act.
    fireEvent.change(blue, { target: { value: '-68' } });
    fireEvent.blur(blue);

    // Assert.
    expect([ screen.queryByLabelText('Gray') !== null, onChange.mock.calls ])
      .toStrictEqual([ true, [ [ [ 0, 0, -68, 0 ] ] ] ]);
  });

  it('names a color\'s fourth channel strength', () =>
  {
    // Arrange.

    // Act.
    renderControl({ key: 'color', label: 'Color', param: [ 0 ], kind: 'color', min: 0, max: 255 }, [ 255, 255, 255, 170 ]);

    // Assert.
    expect([ screen.queryByLabelText('Strength') !== null, screen.queryByLabelText('Gray') ])
      .toStrictEqual([ true, null ]);
  });

  it('edits a list of choices, adding and taking rows away, saying where each entry came from', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'choices', label: 'Choices', param: [ 0 ], kind: 'list' }, [ 'Yes', 'No' ]);

    // Act.
    const second = screen.getByLabelText('#2');
    fireEvent.change(second, { target: { value: 'Never' } });
    fireEvent.blur(second);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove #1' }));

    // Assert: removing the first says the one left was the second.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ [ 'Yes', 'Never' ], [ 0, 1 ] ], [ [ 'Yes', 'No', '' ], [ 0, 1, null ] ], [ [ 'No' ], [ 1 ] ] ]);
  });

  it('edits anything else as JSON, refusing text that is not JSON', () =>
  {
    // Arrange: a list that is not a list of texts.
    const { onChange } = renderControl({ key: 'steps', label: 'Steps', param: [ 1, 'list' ], kind: 'list' }, [ { code: 0 } ]);
    const input = screen.getByLabelText('Steps');

    // Act.
    fireEvent.change(input, { target: { value: '[ oops' } });
    fireEvent.blur(input);
    const refused = screen.queryByText(/that is not JSON/u) !== null;
    fireEvent.change(input, { target: { value: '[ { "code": 1 }, { "code": 0 } ]' } });
    fireEvent.blur(input);

    // Assert.
    expect([ refused, onChange.mock.calls ])
      .toStrictEqual([ true, [ [ [ { code: 1 }, { code: 0 } ] ] ] ]);
  });

  it('edits a file\'s name, saying where it comes from', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'face', label: 'Face', param: [ 0 ], kind: 'face', folder: 'faces' }, 'Actor1');
    const input = screen.getByLabelText('Face');

    // Act.
    fireEvent.change(input, { target: { value: 'Actor2' } });
    fireEvent.blur(input);

    // Assert.
    expect([ screen.queryByText('From img/faces') !== null, onChange.mock.calls ])
      .toStrictEqual([ true, [ [ 'Actor2' ] ] ]);
  });

  it('edits a plugin\'s structured argument as the text it is kept as', () =>
  {
    // Arrange.
    const { onChange } = renderControl({ key: 'ids', label: 'Ids', param: [ 3, 'ids' ], kind: 'list', storage: 'string' }, '["1"]');
    const input = screen.getByLabelText('Ids');

    // Act.
    fireEvent.change(input, { target: { value: '["1","2"]' } });
    fireEvent.blur(input);

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ '["1","2"]' ] ]);
  });

  describe('isWideField', () =>
  {
    it('gives text over lines, sounds, lists, JSON and colors a row of their own', () =>
    {
      // Arrange.
      const kinds = [ 'multiline', 'audio', 'list', 'json', 'color', 'number', 'switch' ] as const;

      // Act.
      const wide = [ ...kinds.map(kind => isWideField({ key: kind, label: kind, param: [ 0 ], kind })), isWideField({ key: 't', label: 't', param: [ 0 ], kind: 'text', lines: 'continuation' }) ];

      // Assert.
      expect(wide)
        .toStrictEqual([ true, true, true, true, true, false, false, true ]);
    });
  });
});

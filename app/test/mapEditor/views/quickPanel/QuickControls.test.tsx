/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import type { QuickControl as QuickControlKind, SharedField } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { LocationPickerDialogProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx';
import { QuickControl } from '../../../../src/mapEditor/views/quickPanel/QuickControls.tsx';
import type { QuickResources } from '../../../../src/mapEditor/views/quickPanel/quickResources.ts';

/**
 * Where the stand-in location picker was asked to start.
 */
const picker = vi.hoisted(() => ({
  starts: [] as unknown[],
}));

// the location picker is proved in its own tests; here it stands in as one button picking tile 4, 3 on map 5, and
// notes where it was asked to start.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx', () =>
{
  /**
   * Stands in for the location picker.
   * @param {LocationPickerDialogProps} props Where it starts, and who hears how it ends.
   * @returns {React.JSX.Element} A button picking a tile.
   */
  const LocationPickerDialog = (props: LocationPickerDialogProps) =>
  {
    const { start, onClose } = props;
    picker.starts.push(start);
    return <button type={'button'} onClick={() => onClose({ mapId: 5, x: 4, y: 3 })}>Pick tile 4, 3 on map 5</button>;
  };

  return { LocationPickerDialog };
});

/*
 * Each control shows one shared setting and hands on a new value only when the author has made one: boxes commit
 * when left or on Enter and refuse what their bounds do not allow, drop-downs and pickers commit on a choice, and a
 * setting the selected events hold differently reads "Mixed" rather than any one of their values. Pickers name rows
 * and maps once the names arrive and take a typed id until then, and keep a value their list lacks. The graphic
 * picker lists the character sheets, picks one of a sheet's eight characters unless it holds one alone, reads a
 * tile as a tile, and previews the frame the engine would cut from the sheet. The place control picks a map and a
 * tile together by clicking the tile on the map, starting from the place the events share, waiting while they go to
 * different places, and offering nothing without a server to read maps from.
 */
describe('QuickControl', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  /**
   * Builds a shared field.
   * @param {QuickControlKind} control The control.
   * @param {JsonValue | null} value The value, or null when mixed.
   * @param {string} label The label.
   * @returns {SharedField} The field.
   */
  const fieldOf = (control: QuickControlKind, value: JsonValue | null, label = 'Setting'): SharedField => ({
    key: 'setting',
    label,
    section: '',
    control,
    step: 'Change',
    value,
    mixed: value === null,
  });

  /**
   * Renders a control with a spy for its changes.
   * @param {SharedField} field The field.
   * @param {Partial<QuickResources>} resources What it reads besides.
   * @returns {{ onChange: ReturnType<typeof vi.fn> }} The spy.
   */
  const renderControl = (field: SharedField, resources: Partial<QuickResources> = {}) =>
  {
    const onChange = vi.fn();
    render(<QuickControl field={field} resources={{ api: null, names: null, mapRows: null, sheets: null, ...resources }} onChange={onChange}/>);
    return { onChange };
  };

  /**
   * Builds the project's names with a few items.
   * @returns {DatabaseNamesJson} The names.
   */
  const buildNames = (): DatabaseNamesJson => ({
    switches: [], variables: [], actors: [], classes: [], skills: [], items: [ '', 'Potion', 'Silver Ore' ], weapons: [], armors: [],
    enemies: [], troops: [], states: [], animations: [], tilesets: [], commonEvents: [], maps: [], equipTypes: [],
  });

  it('commits a number on Enter, and refuses one outside its bounds, putting the value back when left', () =>
  {
    // Arrange.
    const { onChange } = renderControl(fieldOf({ kind: 'number', min: 0, max: 255 }, 14, 'X'));
    const box = screen.getByLabelText('X') as HTMLInputElement;

    // Act.
    fireEvent.change(box, { target: { value: '300' } });
    const refusal = screen.getByText('0 to 255').textContent;
    fireEvent.blur(box);
    const restored = box.value;
    fireEvent.change(box, { target: { value: '20' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    // Assert.
    expect([ refusal, restored, onChange.mock.calls ])
      .toStrictEqual([ '0 to 255', '14', [ [ 20 ] ] ]);
  });

  it('leaves a number alone when left untouched, and Escape puts back what was typed', () =>
  {
    // Arrange.
    const { onChange } = renderControl(fieldOf({ kind: 'number', min: 0, max: 255 }, 14, 'X'));
    const box = screen.getByLabelText('X') as HTMLInputElement;

    // Act.
    fireEvent.blur(box);
    fireEvent.change(box, { target: { value: '3' } });
    fireEvent.keyDown(box, { key: 'Escape' });

    // Assert.
    expect([ box.value, onChange.mock.calls ])
      .toStrictEqual([ '14', [] ]);
  });

  it('reads a mixed drop-down as mixed, and shows a value no choice names as itself', () =>
  {
    // Arrange.
    const options = [ { value: 0, label: 'Black' }, { value: 2, label: 'None' } ];
    renderControl(fieldOf({ kind: 'select', options }, null, 'Fade'));

    // Act.
    render(<QuickControl field={fieldOf({ kind: 'select', options }, 7, 'Other fade')} resources={{ api: null, names: null, mapRows: null, sheets: null }} onChange={vi.fn()}/>);

    // Assert.
    expect([ screen.getByLabelText('Fade').textContent, screen.getByLabelText('Other fade').textContent ])
      .toStrictEqual([ 'Mixed', '7' ]);
  });

  it('picks an item by name once the names arrive, and types its id before then', () =>
  {
    // Arrange.
    const { onChange } = renderControl(fieldOf({ kind: 'row', list: 'item' }, 1, 'Item'), { names: buildNames() });
    const input = screen.getByLabelText('Item') as HTMLInputElement;
    const shown = input.value;

    // Act.
    fireEvent.change(input, { target: { value: 'ore' } });
    fireEvent.click(screen.getByRole('option', { name: '2 Silver Ore' }));
    render(<QuickControl field={fieldOf({ kind: 'row', list: 'item' }, 5, 'Plain item')} resources={{ api: null, names: null, mapRows: null, sheets: null }} onChange={vi.fn()}/>);

    // Assert.
    expect([ shown, onChange.mock.calls, (screen.getByLabelText('Plain item') as HTMLInputElement).value ])
      .toStrictEqual([ '1 Potion', [ [ 2 ] ], '5' ]);
  });

  it('keeps an item the names lack, and reads a mixed item as mixed', () =>
  {
    // Arrange.
    renderControl(fieldOf({ kind: 'row', list: 'item' }, 99, 'Item'), { names: buildNames() });

    // Act.
    render(<QuickControl field={fieldOf({ kind: 'row', list: 'item' }, null, 'Mixed item')} resources={{ api: null, names: buildNames(), mapRows: null, sheets: null }} onChange={vi.fn()}/>);

    // Assert.
    expect([ (screen.getByLabelText('Item') as HTMLInputElement).value, (screen.getByLabelText('Mixed item') as HTMLInputElement).placeholder ])
      .toStrictEqual([ '99', 'Mixed' ]);
  });

  it('picks a map from the tree, listed under its parent, and keeps a map the tree lacks', () =>
  {
    // Arrange.
    const rows: (RmmzMapInfo | null)[] = [
      null,
      { id: 1, expanded: true, name: 'Town', order: 1, parentId: 0, scrollX: 0, scrollY: 0 },
      { id: 2, expanded: true, name: 'Inn', order: 2, parentId: 1, scrollX: 0, scrollY: 0 },
    ];
    const { onChange } = renderControl(fieldOf({ kind: 'map' }, 1, 'Map'), { mapRows: rows });
    const input = screen.getByLabelText('Map') as HTMLInputElement;
    const shown = input.value;

    // Act.
    fireEvent.mouseDown(input);
    const offered = screen.getAllByRole('option').map(option => option.textContent);
    fireEvent.click(screen.getByRole('option', { name: '002 Inn' }));
    render(<QuickControl field={fieldOf({ kind: 'map' }, 40, 'Lost map')} resources={{ api: null, names: null, mapRows: rows, sheets: null }} onChange={vi.fn()}/>);

    // Assert.
    expect([ shown, offered, onChange.mock.calls, (screen.getByLabelText('Lost map') as HTMLInputElement).value ])
      .toStrictEqual([ '001 Town', [ '001 Town', '002 Inn' ], [ [ 2 ] ], '040' ]);
  });

  it('types a map id before the tree arrives', () =>
  {
    // Arrange.
    const { onChange } = renderControl(fieldOf({ kind: 'map' }, 3, 'Map'));
    const box = screen.getByLabelText('Map');

    // Act.
    fireEvent.change(box, { target: { value: '12' } });
    fireEvent.blur(box);

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ 12 ] ]);
  });

  it('reads a mixed map as mixed', () =>
  {
    // Arrange.
    const rows: (RmmzMapInfo | null)[] = [ null, { id: 1, expanded: true, name: 'Town', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ];

    // Act.
    renderControl(fieldOf({ kind: 'map' }, null, 'Map'), { mapRows: rows });

    // Assert.
    expect((screen.getByLabelText('Map') as HTMLInputElement).placeholder)
      .toBe('Mixed');
  });

  it('picks a sheet and a character, resetting the character for a sheet that holds one alone', () =>
  {
    // Arrange.
    const field = fieldOf({ kind: 'graphic' }, { characterName: '!Chest', characterIndex: 3, tileId: 0 }, 'Graphic');
    const { onChange } = renderControl(field, { sheets: [ '!Chest', '$chest-glass-2', 'Actor1' ] });

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Graphic'));
    const offered = screen.getAllByRole('option').map(option => option.textContent);
    fireEvent.click(screen.getByRole('option', { name: '$chest-glass-2' }));
    fireEvent.mouseDown(screen.getByLabelText('Graphic'));
    fireEvent.click(screen.getByRole('option', { name: 'Actor1' }));
    fireEvent.mouseDown(screen.getByLabelText('Character'));
    fireEvent.click(screen.getByRole('option', { name: 'Character 6' }));

    // Assert.
    expect([ offered, onChange.mock.calls ])
      .toStrictEqual([
        [ '(None)', '!Chest', '$chest-glass-2', 'Actor1' ],
        [
          [ { characterName: '$chest-glass-2', characterIndex: 0, tileId: 0 } ],
          [ { characterName: 'Actor1', characterIndex: 3, tileId: 0 } ],
          [ { characterName: '!Chest', characterIndex: 5, tileId: 0 } ],
        ],
      ]);
  });

  it('reads a tile as a tile, offers no character for a single-character sheet, and keeps a sheet the list lacks', () =>
  {
    // Arrange.
    renderControl(fieldOf({ kind: 'graphic' }, { characterName: '', characterIndex: 0, tileId: 423 }, 'Tile picture'), { sheets: [ '!Chest' ] });

    // Act.
    render(<QuickControl field={fieldOf({ kind: 'graphic' }, { characterName: '$gone', characterIndex: 0, tileId: 0 }, 'Gone picture')} resources={{ api: null, names: null, mapRows: null, sheets: [ '!Chest' ] }} onChange={vi.fn()}/>);
    fireEvent.mouseDown(screen.getByLabelText('Gone picture'));

    // Assert.
    expect([ (screen.getByLabelText('Tile picture') as HTMLInputElement).placeholder, screen.queryByLabelText('Character'), screen.getAllByRole('option').map(option => option.textContent) ])
      .toStrictEqual([ 'Tile 423', null, [ '(None)', '$gone', '!Chest' ] ]);
  });

  it('previews the frame the engine cuts from the sheet, shrunk to fit', async () =>
  {
    // Arrange: a sheet that loads at once, 144 by 192, so a big sheet's frame is 48 by 48.
    class LoadingImage
    {
      naturalWidth = 144;

      naturalHeight = 192;

      onload: (() => void) | null = null;

      set src(_url: string)
      {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadingImage);
    const api = { imageUrl: (folder: string, name: string) => `http://api/${folder}/${name}` } as unknown as MapEditorApi;
    const field = {
      ...fieldOf({ kind: 'graphic' }, { characterName: '$chest-glass-2', characterIndex: 0, tileId: 0 }, 'Graphic'),
      preview: { tileId: 0, characterName: '$chest-glass-2', direction: 6, pattern: 2, characterIndex: 0 },
    };

    // Act.
    renderControl(field, { api, sheets: [ '$chest-glass-2' ] });
    await act(async () =>
    {
      await Promise.resolve();
    });
    const frame = screen.getByTestId('graphic-preview').firstElementChild as HTMLElement;

    // Assert: the right-facing row, third frame.
    expect([ frame.style.width, frame.style.height, frame.style.backgroundPosition, frame.style.backgroundSize ])
      .toStrictEqual([ '48px', '48px', '-96px -96px', '144px 192px' ]);
  });

  it('picks a map and a tile together on the map, starting from the place the events share', () =>
  {
    // Arrange: the selected doors all lead to map 20 at 14, 7.
    picker.starts.splice(0);
    const { onChange } = renderControl(fieldOf({ kind: 'place' }, { mapId: 20, x: 14, y: 7 }, 'Pick on the map'), { api: {} as MapEditorApi });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick tile 4, 3 on map 5' }));

    // Assert.
    expect([ picker.starts, onChange.mock.calls ])
      .toStrictEqual([ [ { mapId: 20, x: 14, y: 7 } ], [ [ { mapId: 5, x: 4, y: 3 } ] ] ]);
  });

  it('waits to pick while the selected events go to different places', () =>
  {
    // Arrange: nothing beyond the control, its events disagreeing.

    // Act.
    renderControl(fieldOf({ kind: 'place' }, null, 'Pick on the map'), { api: {} as MapEditorApi });

    // Assert.
    expect(screen.getByRole('button', { name: 'Pick on the map' }))
      .toBeDisabled();
  });

  it('offers nothing to pick with, without a server to read maps from', () =>
  {
    // Arrange: nothing beyond the control, over no server.

    // Act.
    renderControl(fieldOf({ kind: 'place' }, { mapId: 20, x: 14, y: 7 }, 'Pick on the map'), { api: null });

    // Assert.
    expect(screen.queryByRole('button', { name: 'Pick on the map' }))
      .toBeNull();
  });
});

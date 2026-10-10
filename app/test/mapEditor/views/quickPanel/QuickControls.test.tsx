/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import type { QuickControl as QuickControlKind, SharedField, SliderControl as SliderSpec } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { LocationPickerDialogProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx';
import { QuickControl } from '../../../../src/mapEditor/views/quickPanel/QuickControls.tsx';
import type { QuickResources } from '../../../../src/mapEditor/views/quickPanel/quickResources.ts';

/**
 * Where the stand-in location picker was asked to start, and whether each ask was for where the player lands.
 */
const picker = vi.hoisted(() => ({
  starts: [] as unknown[],
  landings: [] as unknown[],
}));

// the location picker is proved in its own tests; here it stands in as one button picking tile 4, 3 on map 5, and
// notes where it was asked to start and whether the player lands there.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx', () =>
{
  /**
   * Stands in for the location picker.
   * @param {LocationPickerDialogProps} props Where it starts, whether the player lands there, and who hears how it ends.
   * @returns {React.JSX.Element} A button picking a tile.
   */
  const LocationPickerDialog = (props: LocationPickerDialogProps) =>
  {
    const { start, landing, onClose } = props;
    picker.starts.push(start);
    picker.landings.push(landing);
    return <button type={'button'} onClick={() => onClose({ mapId: 5, x: 4, y: 3 })}>Pick tile 4, 3 on map 5</button>;
  };

  return { LocationPickerDialog };
});

/*
 * Each control shows one shared setting and hands on a new value only when the author has made one: boxes commit
 * when left or on Enter and refuse what their bounds do not allow, drop-downs and pickers commit on a choice (a
 * drop-down hands on the choice's own value, a number or a name), and a setting the selected events hold differently
 * reads "Mixed" rather than any one of their values, even a drop-down choice named by nothing. Pickers name rows
 * and maps once the names arrive and take a typed id until then, and keep a value their list lacks. The graphic
 * picker lists the character sheets, picks one of a sheet's eight characters unless it holds one alone, reads a
 * tile as a tile, and previews the frame the engine would cut from the sheet. The place control picks a map and a
 * tile together by clicking the tile on the map, starting from the place the events share, waiting while they go to
 * different places, and offering nothing without a server to read maps from; a place the player lands on asks the
 * picker to judge every tile as a landing, and any other place asks for any tile at all.
 *
 * A slider and a colour picker are chosen over time, so they show each value as it is chosen (a preview) and hand on
 * only the value chosen, once: the slider's when it stops moving, never for a press that moved nothing; the picker's
 * when it closes on a new colour or is left, never when left untouched. A swatch is a choice at once. The slider's box
 * takes fractions to its places and refuses anything else, and a value past the track's end shows in the box with the
 * thumb held at the end. A colour that may be unset, such as a dark's, has a button handing on an empty value at once.
 * A tick box hands on its new state at a click, half ticked while the events hold it differently.
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
   * What a control reads besides its field when nothing has arrived: no server, names, map tree or sheets, and no
   * swatches.
   */
  const NO_RESOURCES: QuickResources = { api: null, names: null, mapRows: null, sheets: null, swatches: [] };

  /**
   * Renders a control with spies for its changes and the values it shows while they are still being chosen.
   * @param {SharedField} field The field.
   * @param {Partial<QuickResources>} resources What it reads besides.
   * @returns {{ onChange: ReturnType<typeof vi.fn>, onPreview: ReturnType<typeof vi.fn> }} The spies.
   */
  const renderControl = (field: SharedField, resources: Partial<QuickResources> = {}) =>
  {
    const onChange = vi.fn();
    const onPreview = vi.fn();
    render(<QuickControl field={field} resources={{ ...NO_RESOURCES, ...resources }} onChange={onChange} onPreview={onPreview}/>);
    return { onChange, onPreview };
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
    render(<QuickControl field={fieldOf({ kind: 'select', options }, 7, 'Other fade')} resources={NO_RESOURCES} onChange={vi.fn()} onPreview={vi.fn()}/>);

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
    render(<QuickControl field={fieldOf({ kind: 'row', list: 'item' }, 5, 'Plain item')} resources={NO_RESOURCES} onChange={vi.fn()} onPreview={vi.fn()}/>);

    // Assert.
    expect([ shown, onChange.mock.calls, (screen.getByLabelText('Plain item') as HTMLInputElement).value ])
      .toStrictEqual([ '1 Potion', [ [ 2 ] ], '5' ]);
  });

  it('keeps an item the names lack, and reads a mixed item as mixed', () =>
  {
    // Arrange.
    renderControl(fieldOf({ kind: 'row', list: 'item' }, 99, 'Item'), { names: buildNames() });

    // Act.
    render(<QuickControl field={fieldOf({ kind: 'row', list: 'item' }, null, 'Mixed item')} resources={{ ...NO_RESOURCES, names: buildNames() }} onChange={vi.fn()} onPreview={vi.fn()}/>);

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
    render(<QuickControl field={fieldOf({ kind: 'map' }, 40, 'Lost map')} resources={{ ...NO_RESOURCES, mapRows: rows }} onChange={vi.fn()} onPreview={vi.fn()}/>);

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
    render(<QuickControl field={fieldOf({ kind: 'graphic' }, { characterName: '$gone', characterIndex: 0, tileId: 0 }, 'Gone picture')} resources={{ ...NO_RESOURCES, sheets: [ '!Chest' ] }} onChange={vi.fn()} onPreview={vi.fn()}/>);
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
    picker.landings.splice(0);
    const { onChange } = renderControl(fieldOf({ kind: 'place', landing: true }, { mapId: 20, x: 14, y: 7 }, 'Pick on the map'), { api: {} as MapEditorApi });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick tile 4, 3 on map 5' }));

    // Assert: the picker was asked for where the player lands, since the doors send the player there.
    expect([ picker.starts, picker.landings, onChange.mock.calls ])
      .toStrictEqual([ [ { mapId: 20, x: 14, y: 7 } ], [ true ], [ [ { mapId: 5, x: 4, y: 3 } ] ] ]);
  });

  it('asks the picker for any tile at all for a place the player does not land on', () =>
  {
    // Arrange: a place for something other than the player.
    picker.landings.splice(0);
    renderControl(fieldOf({ kind: 'place', landing: false }, { mapId: 20, x: 14, y: 7 }, 'Pick on the map'), { api: {} as MapEditorApi });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the map' }));

    // Assert.
    expect(picker.landings)
      .toStrictEqual([ false ]);
  });

  it('waits to pick while the selected events go to different places', () =>
  {
    // Arrange: nothing beyond the control, its events disagreeing.

    // Act.
    renderControl(fieldOf({ kind: 'place', landing: true }, null, 'Pick on the map'), { api: {} as MapEditorApi });

    // Assert.
    expect(screen.getByRole('button', { name: 'Pick on the map' }))
      .toBeDisabled();
  });

  it('offers nothing to pick with, without a server to read maps from', () =>
  {
    // Arrange: nothing beyond the control, over no server.

    // Act.
    renderControl(fieldOf({ kind: 'place', landing: true }, { mapId: 20, x: 14, y: 7 }, 'Pick on the map'), { api: null });

    // Assert.
    expect(screen.queryByRole('button', { name: 'Pick on the map' }))
      .toBeNull();
  });

  it('hands on a named choice by its name, and a numbered one by its number', () =>
  {
    // Arrange: looks named by words, among them a choice named by nothing, and fades numbered.
    const looks = [ { value: '', label: 'None of its own' }, { value: 'rain', label: 'rain' } ];
    const fades = [ { value: 0, label: 'Black' }, { value: 2, label: 'None' } ];
    const { onChange: onLook } = renderControl(fieldOf({ kind: 'select', options: looks }, 'rain', 'Look'));
    const { onChange: onFade } = renderControl(fieldOf({ kind: 'select', options: fades }, 0, 'Fade'));

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Look'));
    fireEvent.click(screen.getByRole('option', { name: 'None of its own' }));
    fireEvent.mouseDown(screen.getByLabelText('Fade'));
    fireEvent.click(screen.getByRole('option', { name: 'None' }));

    // Assert.
    expect([ onLook.mock.calls, onFade.mock.calls ])
      .toStrictEqual([ [ [ '' ] ], [ [ 2 ] ] ]);
  });

  it('reads a mixed drop-down as mixed even when one of its choices is named by nothing', () =>
  {
    // Arrange: looks whose first choice is named by nothing, held differently.
    const looks = [ { value: '', label: 'None of its own' }, { value: 'rain', label: 'rain' } ];

    // Act.
    renderControl(fieldOf({ kind: 'select', options: looks }, null, 'Look'));

    // Assert.
    expect(screen.getByLabelText('Look').textContent)
      .toBe('Mixed');
  });

  it('raises a drop-down\'s label over a choice named by nothing, as over any other, so the two never overlap', () =>
  {
    // Arrange: looks whose first choice is named by nothing, showing that choice, showing a named one, and held
    // differently.
    const looks = [ { value: '', label: 'None of its own' }, { value: 'rain', label: 'rain' } ];
    const fields = [ fieldOf({ kind: 'select', options: looks }, '', 'Look'), fieldOf({ kind: 'select', options: looks }, 'rain', 'Named'), fieldOf({ kind: 'select', options: looks }, null, 'Held') ];

    // Act.
    fields.forEach(field => renderControl(field));

    // Assert: MUI marks a raised label as shrunk.
    expect([ 'Look', 'Named', 'Held' ].map(label => screen.getByText(label, { selector: 'label' }).getAttribute('data-shrink')))
      .toStrictEqual([ 'true', 'true', 'true' ]);
  });

  it('shows a drop-down\'s hint under it', () =>
  {
    // Arrange.
    const options = [ { value: 0, label: 'Steady' }, { value: 1, label: 'Flicker' } ];
    const field = { ...fieldOf({ kind: 'select', options }, 1, 'Effect'), hint: 'Erratic, like a torch.' };

    // Act.
    renderControl(field);

    // Assert.
    expect(screen.getByText('Erratic, like a torch.'))
      .toBeInTheDocument();
  });

  describe('slider', () =>
  {
    /**
     * A light's reach: a half-tile track from half a tile to twelve, and a box taking two places up to 99, in tiles.
     */
    const reach: SliderSpec = { kind: 'slider', min: 0.01, max: 99, places: 2, track: [ 0.5, 12 ], step: 0.5, unit: 'tiles' };

    /**
     * A light's intensity: a track and a box from 0 to 100 in whole numbers, each end named, and a line saying what it
     * is.
     */
    const intensity: SliderSpec = {
      kind: 'slider',
      min: 0,
      max: 100,
      places: 0,
      track: [ 0, 100 ],
      step: 1,
      unit: '',
      ends: [ 'Soft pool', 'Hard rim' ],
      about: 'Its shape, not its brightness.',
    };

    it('shows each value as the track moves, and hands on the value it stops at', () =>
    {
      // Arrange: a reach of 4, one half-tile step from 4.5.
      const { onChange, onPreview } = renderControl(fieldOf(reach, 4, 'Radius'));

      // Act.
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Radius' }), { key: 'ArrowRight' });

      // Assert.
      expect([ onPreview.mock.calls, onChange.mock.calls ])
        .toStrictEqual([ [ [ 4.5 ] ], [ [ 4.5 ] ] ]);
    });

    it('hands on nothing for a press that moves nothing', () =>
    {
      // Arrange: already at the start of the track, so Home goes nowhere.
      const { onChange, onPreview } = renderControl(fieldOf(intensity, 0, 'Intensity'));

      // Act.
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Intensity' }), { key: 'Home' });

      // Assert.
      expect([ onPreview.mock.calls, onChange.mock.calls ])
        .toStrictEqual([ [], [] ]);
    });

    it('commits a typed fraction on Enter, and passes over any other key', () =>
    {
      // Arrange.
      const { onChange } = renderControl(fieldOf(reach, 4, 'Radius'));
      const box = screen.getByRole('textbox', { name: 'Radius' });

      // Act.
      fireEvent.change(box, { target: { value: '2.25' } });
      fireEvent.keyDown(box, { key: 'Tab' });
      const beforeEnter = onChange.mock.calls.length;
      fireEvent.keyDown(box, { key: 'Enter' });

      // Assert.
      expect([ beforeEnter, onChange.mock.calls ])
        .toStrictEqual([ 0, [ [ 2.25 ] ] ]);
    });

    it('refuses a number with more places than it takes, saying what it takes, and puts the value back when left', () =>
    {
      // Arrange.
      const { onChange } = renderControl(fieldOf(reach, 4, 'Radius'));
      const box = screen.getByRole('textbox', { name: 'Radius' }) as HTMLInputElement;

      // Act.
      fireEvent.change(box, { target: { value: '2.255' } });
      const refusal = screen.getByText('0.01 to 99').textContent;
      fireEvent.blur(box);

      // Assert.
      expect([ refusal, box.value, onChange.mock.calls ])
        .toStrictEqual([ '0.01 to 99', '4', [] ]);
    });

    it('leaves the value alone when left untouched, and Escape puts back what was typed', () =>
    {
      // Arrange.
      const { onChange } = renderControl(fieldOf(reach, 4, 'Radius'));
      const box = screen.getByRole('textbox', { name: 'Radius' }) as HTMLInputElement;

      // Act.
      fireEvent.blur(box);
      fireEvent.change(box, { target: { value: '6' } });
      fireEvent.keyDown(box, { key: 'Escape' });

      // Assert.
      expect([ box.value, onChange.mock.calls ])
        .toStrictEqual([ '4', [] ]);
    });

    it('shows a value past the end of the track in the box, with the thumb held at that end', () =>
    {
      // Arrange: a reach of 30 tiles, past the track's 12.

      // Act.
      renderControl(fieldOf(reach, 30, 'Radius'));

      // Assert.
      expect([ (screen.getByRole('textbox', { name: 'Radius' }) as HTMLInputElement).value, screen.getByRole('slider', { name: 'Radius' }).getAttribute('aria-valuenow') ])
        .toStrictEqual([ '30', '12' ]);
    });

    it('reads a mixed number as mixed, with the thumb at the start of the track', () =>
    {
      // Arrange: nothing beyond the control, its events disagreeing.

      // Act.
      renderControl(fieldOf(reach, null, 'Radius'));

      // Assert.
      expect([ (screen.getByRole('textbox', { name: 'Radius' }) as HTMLInputElement).placeholder, screen.getByRole('slider', { name: 'Radius' }).getAttribute('aria-valuenow') ])
        .toStrictEqual([ 'Mixed', '0.5' ]);
    });

    it('shows its unit after the box', () =>
    {
      // Arrange: nothing beyond the control.

      // Act.
      renderControl(fieldOf(reach, 4, 'Radius'));

      // Assert.
      expect(screen.getByText('tiles'))
        .toBeInTheDocument();
    });

    it('names what each end of the track means, says what the setting is, and shows its hint', () =>
    {
      // Arrange.
      const field = { ...fieldOf(intensity, 30, 'Intensity'), hint: 'The project\'s default.' };

      // Act.
      renderControl(field);

      // Assert.
      expect([ 'Soft pool', 'Hard rim', 'Its shape, not its brightness.', 'The project\'s default.' ].map(line => screen.getByText(line).textContent))
        .toStrictEqual([ 'Soft pool', 'Hard rim', 'Its shape, not its brightness.', 'The project\'s default.' ]);
    });
  });

  describe('colour', () =>
  {
    /**
     * Finds the colour picker.
     * @param {string} label The setting's name.
     * @returns {HTMLInputElement} The picker.
     */
    const pickerOf = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

    /**
     * Renders the colour control as the quick panel holds it, its value following every colour it shows or hands on,
     * as the map does, and writes both down.
     * @param {string} start The colour the events hold.
     * @returns {{ previews: JsonValue[], changes: JsonValue[] }} The colours shown, and the colours handed on.
     */
    const renderFollowing = (start: string) =>
    {
      const previews: JsonValue[] = [];
      const changes: JsonValue[] = [];

      /**
       * Holds the colour as the map would.
       * @returns {React.JSX.Element} The control.
       */
      const Following = () =>
      {
        const [ value, setValue ] = React.useState<JsonValue>(start);
        const follow = (into: JsonValue[]) => (next: JsonValue) =>
        {
          into.push(next);
          setValue(next);
        };

        return <QuickControl field={fieldOf({ kind: 'color' }, value, 'Colour')} resources={NO_RESOURCES} onChange={follow(changes)} onPreview={follow(previews)}/>;
      };

      render(<Following/>);
      return { previews, changes };
    };

    it('shows each colour as it is picked, and hands on the colour the picker closes on', () =>
    {
      // Arrange.
      const { previews, changes } = renderFollowing('#ffbb73');

      // Act: the picker passes through two colours, then closes on the second.
      fireEvent.input(pickerOf('Colour'), { target: { value: '#112233' } });
      fireEvent.input(pickerOf('Colour'), { target: { value: '#445566' } });
      fireEvent.change(pickerOf('Colour'), { target: { value: '#445566' } });

      // Assert.
      expect([ previews, changes ])
        .toStrictEqual([ [ '#112233', '#445566' ], [ '#445566' ] ]);
    });

    it('hands on the colour picked when the picker is left without closing on it', () =>
    {
      // Arrange.
      const { changes } = renderFollowing('#ffbb73');

      // Act.
      fireEvent.input(pickerOf('Colour'), { target: { value: '#112233' } });
      fireEvent.blur(pickerOf('Colour'));

      // Assert.
      expect(changes)
        .toStrictEqual([ '#112233' ]);
    });

    it('hands on nothing for a picker left or closed untouched', () =>
    {
      // Arrange.
      const { changes } = renderFollowing('#ffbb73');

      // Act.
      fireEvent.blur(pickerOf('Colour'));
      fireEvent.change(pickerOf('Colour'), { target: { value: '#ffbb73' } });

      // Assert.
      expect(changes)
        .toStrictEqual([]);
    });

    it('shows the colour\'s digits, and hands on a swatch\'s colour at once', () =>
    {
      // Arrange.
      const { onChange } = renderControl(fieldOf({ kind: 'color' }, '#ffbb73', 'Colour'), { swatches: [ '#ffbb73', '#bcd9ff' ] });
      const digits = screen.getByText('#ffbb73').textContent;

      // Act.
      fireEvent.click(screen.getByRole('button', { name: '#bcd9ff' }));

      // Assert.
      expect([ digits, pickerOf('Colour').value, onChange.mock.calls ])
        .toStrictEqual([ '#ffbb73', '#ffbb73', [ [ '#bcd9ff' ] ] ]);
    });

    it('reads mixed colours as mixed, starting the picker at grey, with the hint under it', () =>
    {
      // Arrange.
      const field = { ...fieldOf({ kind: 'color' }, null, 'Colour'), hint: 'The project\'s default.' };

      // Act.
      renderControl(field);

      // Assert.
      expect([ screen.getByText('Mixed').textContent, pickerOf('Colour').value, screen.getByText('The project\'s default.').textContent ])
        .toStrictEqual([ 'Mixed', '#808080', 'The project\'s default.' ]);
    });

    it('unsets a colour that may be unset at a click of its button, handing on an empty value', () =>
    {
      // Arrange: the colour of a dark, which plain black unsets.
      const { onChange } = renderControl(fieldOf({ kind: 'color', clear: 'Plain black' }, '#0a2a2a', 'Colour of the dark'));

      // Act.
      fireEvent.click(screen.getByRole('button', { name: 'Plain black' }));

      // Assert.
      expect(onChange.mock.calls)
        .toStrictEqual([ [ '' ] ]);
    });

    it('offers no button to unset a colour that may not be', () =>
    {
      // Arrange: a light's colour, which is always set.

      // Act.
      renderControl(fieldOf({ kind: 'color' }, '#ffbb73', 'Colour'));

      // Assert: the picker is the only control.
      expect(screen.queryAllByRole('button'))
        .toStrictEqual([]);
    });
  });

  describe('check', () =>
  {
    it('ticks or unticks at a click, handing on the new state, with the hint under it', () =>
    {
      // Arrange.
      const field = { ...fieldOf({ kind: 'check' }, true, 'Sky follows the clock'), hint: 'Untick it for caves.' };
      const { onChange } = renderControl(field);
      const box = screen.getByRole('checkbox', { name: 'Sky follows the clock' }) as HTMLInputElement;
      const ticked = box.checked;

      // Act.
      fireEvent.click(box);

      // Assert.
      expect([ ticked, onChange.mock.calls, screen.getByText('Untick it for caves.').textContent ])
        .toStrictEqual([ true, [ [ false ] ], 'Untick it for caves.' ]);
    });

    it('shows a setting held differently half ticked, and a click ticks it for all', () =>
    {
      // Arrange.
      const { onChange } = renderControl(fieldOf({ kind: 'check' }, null, 'Sky follows the clock'));
      const box = screen.getByRole('checkbox', { name: 'Sky follows the clock' }) as HTMLInputElement;
      const half = box.getAttribute('data-indeterminate');

      // Act.
      fireEvent.click(box);

      // Assert.
      expect([ half, onChange.mock.calls ])
        .toStrictEqual([ 'true', [ [ true ] ] ]);
    });
  });
});

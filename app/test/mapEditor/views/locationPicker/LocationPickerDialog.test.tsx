/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import type { LandingGround } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import type { MapLocation } from '../../../../src/mapEditor/core/locations/LocationPicks.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapCell } from '../../../../src/mapEditor/core/renderer/camera.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { LocationPickerDialog } from '../../../../src/mapEditor/views/locationPicker/LocationPickerDialog.tsx';
import type { LocationPickerMapProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerMap.tsx';

/**
 * What the stand-in map was last asked to show, whether it was asked to judge landings, and who hears the map it judged.
 */
const stand = vi.hoisted(() => ({
  shown: null as { mapId: number; picked: MapCell | null; focus: MapCell | null } | null,
  landing: undefined as boolean | undefined,
  onGround: undefined as ((ground: LandingGround | null) => void) | undefined,
}));

// the map itself is the renderer's, proved in its own tests; here it stands in as three buttons, one clicking tile 4, 2,
// one double-clicking tile 6, 1, and one clicking tile 1, 1, which it refuses as blocked; and it notes what it was asked
// to show, whether to judge landings, and who hears the map it judged.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerMap.tsx', () =>
{
  /**
   * Stands in for the picker's map.
   * @param {LocationPickerMapProps} props The map to show, the tile picked, where to centre, and who hears clicks.
   * @returns {React.JSX.Element} Three buttons standing for clicks on the map.
   */
  const LocationPickerMap = (props: LocationPickerMapProps) =>
  {
    const { mapId, picked, focus, landing, onPick, onConfirm, onRefuse, onGround } = props;
    stand.shown = { mapId, picked, focus };
    stand.landing = landing;
    stand.onGround = onGround;
    return (
      <div>
        <button type={'button'} onClick={() => onPick({ x: 4, y: 2 })}>Click tile 4, 2</button>
        <button type={'button'} onClick={() => onConfirm({ x: 6, y: 1 })}>Double-click tile 6, 1</button>
        <button type={'button'} onClick={() => onRefuse?.({ x: 1, y: 1 }, { kind: 'blocked' })}>Click blocked tile 1, 1</button>
      </div>
    );
  };

  return { LocationPickerMap };
});

/*
 * The location picker is MZ's own, made better: the map field, then the map to click a tile on. It owes the author a
 * picker that opens on the map the transfer goes to now with its landing tile picked and centred, so pressing OK
 * straight away changes nothing. A click picks a tile and a double-click picks it and finishes. Choosing another map
 * shows it whole with nothing picked, since the same numbers name an unrelated spot there, and OK waits until a tile is
 * picked; coming back to the first map brings its tile back. Cancel and Escape give up, and a click outside the picker
 * does nothing, so a careful pick is never lost to a stray click. Enter finishes too, but not from the map field, where
 * it chooses the map typed, nor on a button, which Enter presses itself.
 *
 * Choosing where the player lands, it has its map judge every tile, and a tile the map refuses is said why under the
 * map, the tile picked before staying picked, until a tile is taken or another map shown. A transfer landing now where
 * the player cannot stand opens with that tile picked and the reason shown, judged by the map shown and no other, and
 * neither OK nor Enter finishes on it.
 */
describe('LocationPickerDialog', () =>
{
  /**
   * Where a transfer to Room of Sacrifice lands.
   */
  const START: MapLocation = { mapId: 322, x: 22, y: 13 };

  /**
   * Builds the map tree: the cave, its lower floor, and Room of Sacrifice, each at its id.
   * @returns {(RmmzMapInfo | null)[]} The rows.
   */
  const buildInfos = (): (RmmzMapInfo | null)[] =>
  {
    const infos: (RmmzMapInfo | null)[] = Array.from({ length: 323 }, () => null);
    infos[5] = { id: 5, expanded: true, name: 'Cave', order: 1, parentId: 0, scrollX: 0, scrollY: 0 };
    infos[6] = { id: 6, expanded: true, name: 'Cave B1', order: 2, parentId: 5, scrollX: 0, scrollY: 0 };
    infos[322] = { id: 322, expanded: true, name: 'Room of Sacrifice', order: 3, parentId: 0, scrollX: 0, scrollY: 0 };
    return infos;
  };

  /**
   * Renders the picker starting from where the transfer lands now, and lets the map tree arrive.
   * @param {boolean} landing Whether the player lands on the place picked; left out, the picker is asked for any tile.
   * @returns {Promise<{ onClose: ReturnType<typeof vi.fn> }>} Who hears how it ends.
   */
  const renderPicker = async (landing?: boolean) =>
  {
    const onClose = vi.fn();
    const api = { loadMapInfos: async () => buildInfos() } as unknown as MapEditorApi;
    const services = { api, pluginHeaders: new PluginHeaderStore() } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <LocationPickerDialog start={START} landing={landing} onClose={onClose}/>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
    });
    return { onClose };
  };

  /**
   * Chooses a map in the map field.
   * @param {string} label The map as the field lists it.
   */
  const chooseMap = (label: string) =>
  {
    fireEvent.mouseDown(screen.getByLabelText('Map'));
    fireEvent.click(screen.getByRole('option', { name: label }));
  };

  /**
   * Reads what the picker says it will land on.
   * @returns {string | null} The readout.
   */
  const readout = (): string | null =>
  {
    return screen.getByTestId('location-picker-readout').textContent;
  };

  it('opens on the map the transfer goes to now, with its landing tile picked and centred', async () =>
  {
    // Arrange: nothing beyond the picker, opened.

    // Act.
    await renderPicker();

    // Assert.
    expect([ (screen.getByLabelText('Map') as HTMLInputElement).value, stand.shown, readout(), screen.getByRole('button', { name: 'OK' }) ])
      .toStrictEqual([
        '322 Room of Sacrifice',
        { mapId: 322, picked: { x: 22, y: 13 }, focus: { x: 22, y: 13 } },
        'Lands on 22, 13',
        expect.objectContaining({ disabled: false }),
      ]);
  });

  it('finishes with the landing tile as it was when OK is pressed straight away', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    // Assert.
    expect(onClose.mock.calls)
      .toStrictEqual([ [ START ] ]);
  });

  it('picks the tile clicked, and finishes with it', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));
    const said = readout();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    // Assert.
    expect([ said, stand.shown?.picked, onClose.mock.calls ])
      .toStrictEqual([ 'Lands on 4, 2', { x: 4, y: 2 }, [ [ { mapId: 322, x: 4, y: 2 } ] ] ]);
  });

  it('finishes with the tile double-clicked', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Double-click tile 6, 1' }));

    // Assert.
    expect(onClose.mock.calls)
      .toStrictEqual([ [ { mapId: 322, x: 6, y: 1 } ] ]);
  });

  it('shows another map whole with nothing picked, and OK waits for a tile there', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    chooseMap('006 Cave B1');
    const { shown } = stand;
    const said = readout();
    const waiting = (screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled;
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    // Assert.
    expect([ shown, said, waiting, onClose.mock.calls ])
      .toStrictEqual([
        { mapId: 6, picked: null, focus: null },
        'No tile picked on this map yet.',
        true,
        [ [ { mapId: 6, x: 4, y: 2 } ] ],
      ]);
  });

  it('brings the landing tile back on coming back to the first map', async () =>
  {
    // Arrange: a tile was clicked on the cave.
    await renderPicker();
    chooseMap('005 Cave');
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));

    // Act.
    chooseMap('322 Room of Sacrifice');

    // Assert.
    expect([ stand.shown, readout() ])
      .toStrictEqual([ { mapId: 322, picked: { x: 22, y: 13 }, focus: { x: 22, y: 13 } }, 'Lands on 22, 13' ]);
  });

  it('gives up on Cancel', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert.
    expect(onClose.mock.calls)
      .toStrictEqual([ [ null ] ]);
  });

  it('gives up on Escape', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    // Assert.
    expect(onClose.mock.calls)
      .toStrictEqual([ [ null ] ]);
  });

  it('does nothing on a click outside the picker', async () =>
  {
    // Arrange: the backdrop is the dialog's container, outside its paper.
    const { onClose } = await renderPicker();
    const outside = document.querySelector('.MuiDialog-container') as HTMLElement;

    // Act.
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);

    // Assert.
    expect([ onClose.mock.calls, screen.getByRole('dialog') !== null ])
      .toStrictEqual([ [], true ]);
  });

  it('finishes on Enter with the tile picked', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    // Assert.
    expect(onClose.mock.calls)
      .toStrictEqual([ [ START ] ]);
  });

  it('finishes nothing on Enter with no tile picked on the map shown', async () =>
  {
    // Arrange: the cave is shown, with nothing picked on it.
    const { onClose } = await renderPicker();
    chooseMap('005 Cave');

    // Act.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    // Assert: still open on the cave, with nothing to finish with.
    expect([ onClose.mock.calls, stand.shown?.mapId ])
      .toStrictEqual([ [], 5 ]);
  });

  it('leaves Enter in the map field to the field', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.keyDown(screen.getByLabelText('Map'), { key: 'Enter' });

    // Assert: a tile is picked, so only the field kept Enter from finishing.
    expect([ onClose.mock.calls, readout() ])
      .toStrictEqual([ [], 'Lands on 22, 13' ]);
  });

  it('leaves Enter on a button to the button', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter' });

    // Assert: a tile is picked, so only the button kept Enter from finishing.
    expect([ onClose.mock.calls, readout() ])
      .toStrictEqual([ [], 'Lands on 22, 13' ]);
  });

  it('finishes on no other key', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker();

    // Act.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: ' ' });

    // Assert: a tile is picked, so only the key kept it from finishing.
    expect([ onClose.mock.calls, readout() ])
      .toStrictEqual([ [], 'Lands on 22, 13' ]);
  });

  it('has its map judge every tile as a landing when the player lands there, and no tile otherwise', async () =>
  {
    // Arrange: a picker for where the player lands, then one for any place.
    await renderPicker(true);
    const { landing } = stand;
    cleanup();

    // Act.
    await renderPicker();

    // Assert.
    expect([ landing, stand.landing ])
      .toStrictEqual([ true, false ]);
  });

  it('says why its map refused a tile, keeping the tile picked before, until a tile is taken', async () =>
  {
    // Arrange.
    const { onClose } = await renderPicker(true);

    // Act: the blocked tile, then a tile the map takes.
    fireEvent.click(screen.getByRole('button', { name: 'Click blocked tile 1, 1' }));
    const refused = [ readout(), stand.shown?.picked ];
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));

    // Assert: nothing finished along the way.
    expect([ refused, readout(), onClose.mock.calls ])
      .toStrictEqual([
        [ 'The player cannot land on 1, 1. The tiles there let no one through.', { x: 22, y: 13 } ],
        'Lands on 4, 2',
        [],
      ]);
  });

  it('stops saying why a tile was refused once another map is shown', async () =>
  {
    // Arrange: the blocked tile was clicked.
    await renderPicker(true);
    fireEvent.click(screen.getByRole('button', { name: 'Click blocked tile 1, 1' }));

    // Act.
    chooseMap('005 Cave');

    // Assert.
    expect(readout())
      .toBe('No tile picked on this map yet.');
  });

  it('says why the player cannot stand where the transfer lands now, and finishes nothing on it', async () =>
  {
    // Arrange: the map judged, refusing the landing tile at 22, 13.
    const { onClose } = await renderPicker(true);
    const ground = { map: { mapId: 322 } as MapDocument, problemAt: (x: number, y: number) => (x === 22 && y === 13 ? { kind: 'blocked' } : null) };

    // Act.
    act(() => stand.onGround?.(ground as LandingGround));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    // Assert.
    expect([ readout(), (screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled, onClose.mock.calls ])
      .toStrictEqual([ 'Lands on 22, 13, where the player cannot stand. The tiles there let no one through.', true, [] ]);
  });

  it('judges the tile picked by the map shown, never by another map judged before it', async () =>
  {
    // Arrange: a judgement of another map, refusing every tile.
    const { onClose } = await renderPicker(true);
    const elsewhere = { map: { mapId: 5 } as MapDocument, problemAt: () => ({ kind: 'blocked' }) };

    // Act.
    act(() => stand.onGround?.(elsewhere as LandingGround));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    // Assert.
    expect([ readout(), onClose.mock.calls ])
      .toStrictEqual([ 'Lands on 22, 13', [ [ START ] ] ]);
  });
});

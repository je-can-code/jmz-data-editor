/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { LocationPicks, type MapLocation } from '../../../../src/mapEditor/core/locations/LocationPicks.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { LocationPickerHost } from '../../../../src/mapEditor/views/locationPicker/LocationPickerHost.tsx';
import type { LocationPickerMapProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerMap.tsx';

// the map itself is the renderer's, proved in its own tests; here it stands in as one button clicking tile 4, 2, and a
// line saying whether it judges landings.
vi.mock('../../../../src/mapEditor/views/locationPicker/LocationPickerMap.tsx', () =>
{
  /**
   * Stands in for the picker's map.
   * @param {LocationPickerMapProps} props Who hears the click, and whether to judge landings.
   * @returns {React.JSX.Element} A button standing for a click on the map, and what it judges.
   */
  const LocationPickerMap = (props: LocationPickerMapProps) =>
  {
    const { onPick, landing } = props;
    return (
      <div>
        <button type={'button'} onClick={() => onPick({ x: 4, y: 2 })}>Click tile 4, 2</button>
        <span>{landing === true ? 'Judging landings' : 'Judging nothing'}</span>
      </div>
    );
  };

  return { LocationPickerMap };
});

/*
 * Every window has one location picker host, and it is how an editor's ask for a place on a map becomes something the
 * author can see. It owes the window nothing on screen while no ask is open; a picker for each ask, starting where that
 * ask starts; and the ask settled with however the picker ended, the place picked or null, so the editor waiting on it
 * hears. A new ask while a picker shows starts a fresh picker from the new ask's place, never carrying over the tile
 * clicked for the old one, whose editor hears that nothing was picked. An ask for where the player lands has its picker
 * judge every tile as a landing.
 */
describe('LocationPickerHost', () =>
{
  /**
   * Where a transfer to Room of Sacrifice lands.
   */
  const START: MapLocation = { mapId: 322, x: 22, y: 13 };

  /**
   * Renders the host over a window's asks.
   * @returns {{ picks: LocationPicks }} The window's asks.
   */
  const renderHost = () =>
  {
    const picks = new LocationPicks();
    const api = { loadMapInfos: async () => [ null ] } as unknown as MapEditorApi;
    const services = { api, pluginHeaders: new PluginHeaderStore(), locationPicks: picks } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <LocationPickerHost/>
      </MapEditorServicesProvider>
    );
    return { picks };
  };

  /**
   * Makes an ask, letting the picker show and its map tree arrive.
   * @param {LocationPicks} picks The window's asks.
   * @param {MapLocation} start Where it starts.
   * @param {boolean} landing Whether the player lands on the place picked.
   * @returns {Promise<{ answer: Promise<MapLocation | null> }>} The editor's answer, once given.
   */
  const ask = async (picks: LocationPicks, start: MapLocation, landing = false) =>
  {
    let answer: Promise<MapLocation | null> = Promise.resolve(null);
    await act(async () =>
    {
      answer = picks.pick(start, { landing });
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
    });
    return { answer };
  };

  it('shows nothing while no ask is open', () =>
  {
    // Arrange: nothing beyond the host, rendered.

    // Act.
    renderHost();

    // Assert.
    expect(screen.queryByRole('dialog'))
      .toBeNull();
  });

  it('shows a picker for an ask, and answers the editor with the place picked', async () =>
  {
    // Arrange.
    const { picks } = renderHost();
    const { answer } = await ask(picks, START);
    const shown = screen.getByRole('dialog', { name: 'Choose the destination' }) !== null;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    // Assert.
    expect([ shown, await answer, picks.current(), screen.queryByRole('dialog') ])
      .toStrictEqual([ true, { mapId: 322, x: 4, y: 2 }, null, null ]);
  });

  it('answers the editor with null when the author gives up', async () =>
  {
    // Arrange.
    const { picks } = renderHost();
    const { answer } = await ask(picks, START);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert.
    expect([ await answer, picks.current(), screen.queryByRole('dialog') ])
      .toStrictEqual([ null, null, null ]);
  });

  it('starts a fresh picker for a new ask, its own start shown, the ask before answered with null', async () =>
  {
    // Arrange: a tile was clicked in the first ask's picker.
    const { picks } = renderHost();
    const first = await ask(picks, START);
    fireEvent.click(screen.getByRole('button', { name: 'Click tile 4, 2' }));

    // Act.
    await ask(picks, { mapId: 5, x: 1, y: 3 });

    // Assert.
    expect([ await first.answer, screen.getByTestId('location-picker-readout').textContent, screen.getAllByRole('dialog').length ])
      .toStrictEqual([ null, 'Lands on 1, 3', 1 ]);
  });

  it('has the picker judge every tile as a landing for an ask for where the player lands, and none for another', async () =>
  {
    // Arrange: an ask for any place.
    const { picks } = renderHost();
    await ask(picks, START);
    const before = screen.queryByText('Judging nothing') !== null;

    // Act: an ask for where the player lands takes over.
    await ask(picks, START, true);

    // Assert.
    expect([ before, screen.queryByText('Judging landings') !== null ])
      .toStrictEqual([ true, true ]);
  });
});

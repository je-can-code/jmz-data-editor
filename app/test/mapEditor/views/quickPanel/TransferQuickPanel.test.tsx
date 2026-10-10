/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { freshSavePages } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import { TransferLandings } from '../../../../src/mapEditor/core/locations/TransferLandings.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { lookAtDocument } from '../../../../src/mapEditor/core/sync/lookAtDocument.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { TransferQuickPanel } from '../../../../src/mapEditor/views/quickPanel/TransferQuickPanel.tsx';
import { event, hubWith, transferPage } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A transfer's quick panel says, above its settings, where each transfer whose landing fails lands and why the player
 * cannot stand there, so the author reads the problem where they would mend it. It says nothing of a landing that is
 * fine, nothing of one on a map still being read until that map lands, and stops saying it once the landing is mended.
 */
describe('TransferQuickPanel', () =>
{
  /**
   * A tileset letting every tile through but tile 20, which blocks every way: the top layer's tile at 1, 0 on the
   * fixture's 3 by 2 map.
   * @returns {RmmzTileset} The tileset.
   */
  const buildTileset = (): RmmzTileset =>
  {
    const flags = new Array(40).fill(0);
    flags[20] = 0x0f;
    return { id: 4, flags, mode: 1, name: 'Walls', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
  };

  /**
   * Renders the panel for door 1 on map 1, held here with the tilesets, transferring the player to a place; map 5 is the
   * fixture on disk, read once asked for, when the test lets it land.
   * @param {number[]} transfer The door's Transfer Player parameters.
   * @returns {object} The hub, and a way to let map 5's read land.
   */
  const renderPanel = (transfer: number[]) =>
  {
    const { hub } = hubWith([ event(1, [ transferPage(transfer) ], { name: 'door' }) ]);
    hub.adopt('tilesets', [ null, null, null, null, buildTileset() ] as unknown as JsonValue);
    let release = () => undefined as void;
    const read = new Promise<void>(resolve =>
    {
      release = resolve;
    });
    const files = new Map<DocumentKey, JsonValue>([ [ 'map:5', buildMapJson() as unknown as JsonValue ] ]);
    const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
    const look = async (key: DocumentKey) =>
    {
      await read;
      return lookAtDocument({ hub: { ...hub, has: (k: DocumentKey) => hub.has(k), document: (k: DocumentKey) => hub.document(k), readFile: async (k: DocumentKey) => files.get(k) as JsonValue }, sync }, key);
    };
    const landings = new TransferLandings({ hub, look, rules: () => [], pages: () => freshSavePages(null, 0, null), claims: () => true });
    const services = { hub, api: null, landings } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <TransferQuickPanel documentKey={'map:1'} eventIds={[ 1 ]}/>
      </MapEditorServicesProvider>
    );
    const land = () => act(async () =>
    {
      release();
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
    });
    return { hub, land };
  };

  /**
   * Reads what the panel says of landings.
   * @returns {(string | null)[]} Each line.
   */
  const alerts = (): (string | null)[] => screen.queryAllByTestId('landing-alert').map(alert => alert.textContent);

  it('says where the transfer lands and why the player cannot stand there, above its settings', () =>
  {
    // Arrange: the door lands on the wall at 1, 0 of its own map.

    // Act.
    renderPanel([ 0, 1, 1, 0, 2, 0 ]);

    // Assert: the line comes before the settings, which still show.
    const [ alert ] = screen.getAllByTestId('landing-alert');
    const fields = screen.getByTestId('quick-fields');
    expect([ alerts(), alert.compareDocumentPosition(fields) === Node.DOCUMENT_POSITION_FOLLOWING ])
      .toStrictEqual([ [ 'Lands on 1, 0 of Map 1, where the player cannot stand. The tiles there let no one through.' ], true ]);
  });

  it('says nothing of a landing the player can stand on', () =>
  {
    // Arrange: the door lands on open ground at 2, 1.

    // Act.
    renderPanel([ 0, 1, 2, 1, 2, 0 ]);

    // Assert.
    expect([ alerts(), screen.queryByTestId('quick-fields') !== null ])
      .toStrictEqual([ [], true ]);
  });

  it('says nothing of a landing on a map still being read, and says why once it lands', async () =>
  {
    // Arrange: the door lands on the wall at 1, 0 of map 5, on disk.
    const { land } = renderPanel([ 0, 5, 1, 0, 2, 0 ]);
    const early = alerts();

    // Act.
    await land();

    // Assert.
    expect([ early, alerts() ])
      .toStrictEqual([ [], [ 'Lands on 1, 0 of Map 5, where the player cannot stand. The tiles there let no one through.' ] ]);
  });

  it('stops saying it once the landing is mended', () =>
  {
    // Arrange: the door lands on the wall at 1, 0 of its own map.
    const { hub } = renderPanel([ 0, 1, 1, 0, 2, 0 ]);
    const before = alerts().length;

    // Act: its landing moves to open ground at 2, 1.
    act(() =>
    {
      hub.edit('Change transfer destination', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 1, 'pages', 0, 'list', 1, 'parameters' ], [ 0, 1, 2, 1, 2, 0 ]));
    });

    // Assert.
    expect([ before, alerts() ])
      .toStrictEqual([ 1, [] ]);
  });
});

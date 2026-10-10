/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import type { StampFit } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { BattlerBrush, LEVEL_WORDS, lookWords } from '../../../../src/mapEditor/modules/jabs/BattlerBrush.tsx';
import { NEW_BATTLER_LEVELS_DOCUMENT } from '../../../../src/mapEditor/modules/jabs/battlerLevelSetting.ts';
import { commonPage, type BattlerLook } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';
import { pageLevelOf } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { battlerSetupOf } from '../../../../src/mapEditor/modules/jabs/battlerSetup.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The battler brush says what each click places before the author places it: a battler like the enemy's own, and how
 * many of them it is like, or, for an enemy standing nowhere yet, the game's most common battler. While J-LevelMaster is
 * on, it holds the levels set for each map before it takes the battler up, with the fit that places each battler at the
 * level its map calls for, and says the level follows the map, which the pointer then names over each map; levels that
 * cannot be read still leave the brush in hand, each map's battlers alone deciding, and it says why. With J-LevelMaster
 * off, a battler's level is nothing the game reads: the brush reads no levels, fits nothing, and says nothing of a level.
 */
describe('BattlerBrush', () =>
{
  /**
   * What the brush places, like some of the enemy's battlers.
   * @param {number} copies How many it is like.
   * @param {number} of How many the enemy has.
   * @returns {BattlerLook} The look.
   */
  const look = (copies: number, of: number): BattlerLook => ({ name: 'bat', page: commonPage(5), copies, of });

  describe('lookWords', () =>
  {
    it('says how many of the enemy\'s battlers it is like, or that it is like the enemy\'s only one', () =>
    {
      // Arrange: a look like several of the enemy's battlers, and a look like its only one.
      const looks = [ look(41, 49), look(1, 1) ];

      // Act.
      const words = looks.map(lookWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Each click places a battler like 41 of the 49 this enemy already has.',
          'Each click places a battler like the one this enemy already has.',
        ]);
    });

    it('says an enemy standing nowhere yet gets the game\'s most common battler', () =>
    {
      // Arrange: an enemy with no battler placed.
      const nowhere = look(0, 0);

      // Act.
      const words = lookWords(nowhere);

      // Assert.
      expect(words)
        .toBe('No battler of this enemy stands on any saved map yet, so each click places the game\'s most common battler, with no picture.');
    });
  });

  describe('BattlerBrush', () =>
  {
    /**
     * A plugin as js/plugins.js lists it, enabled.
     * @param {string} name Its file name.
     * @returns {PluginsJsEntry} The entry.
     */
    const plugin = (name: string): PluginsJsEntry => ({ name, status: true, description: '', parameters: {} });

    /**
     * What the brush took up with each pick: the stamp, and how it fits itself to a map.
     */
    type TakenUp = { readonly stamp: Stamp; readonly fit: StampFit | null };

    /**
     * Renders the brush over a window holding map 1, whose levels file starts map 1's new battlers at 20, with J-ABS on
     * and J-LevelMaster on or off, and the levels opening from that file, or refused.
     * @param {{ levels: boolean, open?: 'file' | 'refused' }} options Whether J-LevelMaster is on, and how the levels open.
     * @returns {{ hub: DocumentHub, taken: TakenUp[], opened: DocumentKey[] }} The window's documents, every stamp taken
     * up, and every document the brush opened.
     */
    const renderBrush = (options: { readonly levels: boolean; readonly open?: 'file' | 'refused' }) =>
    {
      const { levels, open = 'file' } = options;
      const hub = new DocumentHub({
        clientId: 'window-a',
        store: { load: async () => ({ schemaVersion: 1, data: { maps: { 1: 20 } } }) as unknown as JsonValue, save: async () => undefined },
      });
      hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
      const opened: DocumentKey[] = [];
      const openDocument = (key: DocumentKey): Promise<EditorDocument> =>
      {
        opened.push(key);
        return open === 'file' ? hub.load(key) : Promise.reject(new Error('the file is not JSON'));
      };
      const api = {
        loadEnemies: vi.fn(async () => [ null, null, null, null, null, { id: 5, name: 'Slime', note: '' } ]),
        loadEnemyBattlerPages: vi.fn(async () => []),
      } as unknown as MapEditorApi;
      const services = { hub, api, openDocument } as unknown as MapEditorServices;
      const plugins = new Map([ [ 'J-ABS', plugin('J-ABS') ], ...(levels ? [ [ 'J-LevelMaster', plugin('J-LevelMaster') ] as const ] : []) ]);
      const setup = battlerSetupOf(plugins, null, () => []);
      const taken: TakenUp[] = [];

      /**
       * The Stamps panel's part: the brush, holding whatever it last took up.
       * @returns {React.JSX.Element} The brush.
       */
      const Host = () =>
      {
        const [ inHand, setInHand ] = useState<string | null>(null);
        return (
          <BattlerBrush
            setup={setup}
            takeUp={(stamp, fit) =>
            {
              taken.push({ stamp, fit });
              setInHand(stamp.id);
            }}
            putDown={() => setInHand(null)}
            inHand={inHand}
            newStampId={() => 'window-a:1'}
          />
        );
      };

      render(
        <MapEditorServicesProvider services={services}>
          <Host/>
        </MapEditorServicesProvider>
      );
      return { hub, taken, opened };
    };

    /**
     * Picks the slime in the brush's enemy picker, and waits for the brush to take it up.
     */
    const pickSlime = async (): Promise<void> =>
    {
      const option = await screen.findByLabelText('Enemy');
      fireEvent.change(option, { target: { value: 'Slime' } });
      await act(async () =>
      {
        fireEvent.click(await screen.findByRole('option', { name: '0005 Slime' }));
      });
      await screen.findByTestId('battler-brush-look');
    };

    it('holds the levels, then takes the battler up with a fit placing it at the level each map calls for, saying so', async () =>
    {
      // Arrange: J-LevelMaster on.
      const { hub, taken, opened } = renderBrush({ levels: true });

      // Act.
      await pickSlime();
      const [ { fit } ] = taken;
      const fitted = (fit as StampFit)(hub.map('map:1'));

      // Assert: map 1 starts its new battlers at 20, as its levels file says.
      expect([ opened, taken.length, pageLevelOf(fitted.stamp.events[0].pages[0]), fitted.words, screen.getByTestId('battler-brush-level').textContent ])
        .toStrictEqual([ [ NEW_BATTLER_LEVELS_DOCUMENT ], 1, 20, 'Level 20 · this map\'s setting', LEVEL_WORDS ]);
    });

    it('still takes the battler up when the levels cannot be read, saying why', async () =>
    {
      // Arrange: J-LevelMaster on, the levels file refused.
      const { hub, taken } = renderBrush({ levels: true, open: 'refused' });

      // Act.
      await pickSlime();
      const fitted = (taken[0].fit as StampFit)(hub.map('map:1'));

      // Assert: with no battler on the map giving a level, the battler goes down at its enemy's own.
      expect([ screen.getByTestId('battler-brush-look').textContent, pageLevelOf(fitted.stamp.events[0].pages[0]), fitted.words ])
        .toStrictEqual([
          'The levels set for each map could not be read (the file is not JSON), so each map\'s battlers alone say which level a battler takes.',
          null,
          'The enemy\'s own level',
        ]);
    });

    it('reads no levels, fits nothing and says nothing of a level while J-LevelMaster is off', async () =>
    {
      // Arrange: J-LevelMaster off.
      const { taken, opened } = renderBrush({ levels: false });

      // Act.
      await pickSlime();

      // Assert.
      expect([ opened, taken.map(each => each.fit), screen.queryByTestId('battler-brush-level'), screen.getByTestId('battler-brush-look').textContent ])
        .toStrictEqual([ [], [ null ], null, lookWords({ name: 'slime', page: commonPage(5), copies: 0, of: 0 }) ]);
    });
  });
});

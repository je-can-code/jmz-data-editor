/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { changeBattlers } from '../../../../src/mapEditor/modules/jabs/battlerChanges.ts';
import { levelSetFor } from '../../../../src/mapEditor/modules/jabs/battlerLevelSetting.ts';
import { motionDefaultsFrom } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { NewBattlerLevelProperty } from '../../../../src/mapEditor/modules/jabs/NewBattlerLevelProperty.tsx';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { buildMapJson } from '../../support/fixtures.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * Map Properties shows, while J-ABS and J-LevelMaster are on, the level a map's new battlers start at: a box holding the
 * level set for the map, or nothing, which means the level the map's battlers already use, or the enemy's own, as the
 * words under it say; and under that, the level the next battler gets. A level typed and left, or entered, is set as one
 * step in the map's history and written to the editor's own data at once; an emptied box clears it; text that is no
 * level is refused, saying what the box takes, and put back on leaving. The box follows the level as it changes
 * elsewhere, an undo among them, and the line under it follows the map's battlers as they are given levels. The levels
 * are opened as the setting first shows, which it says meanwhile, and why, when they cannot be read.
 */
describe('NewBattlerLevelProperty', () =>
{
  /**
   * A battler of enemy 5 at a level, standing on the fixture map.
   * @param {number} id The event's id.
   * @param {number} level The level its page gives.
   * @returns {RmmzMapEvent} The battler.
   */
  const battler = (id: number, level: number): RmmzMapEvent => event(id, [ page([ command(108, [ '<enemyId:5>' ]), command(408, [ `<level:${level}>` ]) ]) ]);

  /**
   * Renders the setting for map 1, holding the battlers given, in a window whose levels file holds what is given, opened
   * as the setting asks for it, or never, or refused.
   * @param {Record<number, number>} levels The level set for each map in the file, by map id.
   * @param {{ battlers?: RmmzMapEvent[], open?: 'file' | 'never' | 'refused' }} options The map's battlers, and how the
   * levels open.
   * @returns {{ hub: DocumentHub, written: JsonValue[], unmount: () => void }} The window's documents, every levels file
   * written, and a way to take the setting away.
   */
  const renderSetting = (levels: Record<number, number>, options: { readonly battlers?: RmmzMapEvent[]; readonly open?: 'file' | 'never' | 'refused' } = {}) =>
  {
    const { battlers = [], open = 'file' } = options;
    const written: JsonValue[] = [];
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async () => ({ schemaVersion: 1, data: { maps: levels } }) as unknown as JsonValue,
        save: async (_key, content) =>
        {
          written.push(cloneJson(content));
        },
      },
    });
    const map = buildMapJson();
    map.events = [ null, ...battlers ];
    hub.adopt('map:1', map as unknown as JsonValue);
    const opens: Record<string, (key: DocumentKey) => Promise<EditorDocument>> = {
      file: key => hub.load(key),
      never: () => new Promise<EditorDocument>(() =>
      {
        // a file that never arrives settles nothing.
      }),
      refused: () => Promise.reject(new Error('the file is not JSON')),
    };
    const services = { hub, openDocument: opens[open] } as unknown as MapEditorServices;
    const { unmount } = render(
      <MapEditorServicesProvider services={services}>
        <NewBattlerLevelProperty mapId={1} map={hub.map('map:1')}/>
      </MapEditorServicesProvider>
    );
    return { hub, written, unmount };
  };

  /**
   * Finds the setting's box.
   * @returns {HTMLInputElement} The box.
   */
  const box = (): HTMLInputElement => screen.getByRole('textbox', { name: 'New battlers start at level' }) as HTMLInputElement;

  /**
   * Reads the line under the box saying what the next battler gets.
   * @returns {string | null} The line.
   */
  const nextLine = (): string | null => screen.getByTestId('new-battler-level-next').textContent;

  /**
   * Lists the names of the steps map 1's history holds.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The names, oldest first.
   */
  const stepsIn = (hub: DocumentHub): string[] => hub.history(mapHistoryKey(1)).rows.map(row => row.label);

  it('shows the level set for the map, what an empty box means, and the level the next battler gets', async () =>
  {
    // Arrange: map 1 starts its new battlers at 12, map 2 at 30.

    // Act.
    renderSetting({ 1: 12, 2: 30 });
    await screen.findByRole('textbox', { name: 'New battlers start at level' });

    // Assert.
    expect([ box().value, screen.getByText(/^Empty:/u).textContent, nextLine() ])
      .toStrictEqual([ '12', 'Empty: the level this map\'s battlers already use, or the enemy\'s own.', 'Next battler: level 12, this map\'s setting.' ]);
  });

  it('sets a level typed and left as one step in the map\'s history, written at once, and follows its undo', async () =>
  {
    // Arrange: a map setting none, whose battler stands at level 6.
    const { hub, written } = renderSetting({ 2: 30 }, { battlers: [ battler(1, 6) ] });
    await screen.findByRole('textbox', { name: 'New battlers start at level' });
    const before = nextLine();

    // Act.
    fireEvent.change(box(), { target: { value: '20' } });
    await act(async () =>
    {
      fireEvent.blur(box());
    });
    const set = [ box().value, nextLine(), levelSetFor(hub, 1), stepsIn(hub), cloneJson(written) ];
    act(() =>
    {
      hub.undo(mapHistoryKey(1));
    });

    // Assert.
    expect([ before, set, box().value, nextLine(), levelSetFor(hub, 1) ])
      .toStrictEqual([
        'Next battler: its enemy\'s level here, else level 6, this map\'s level.',
        [ '20', 'Next battler: level 20, this map\'s setting.', 20, [ 'Change new battler level' ], [ { schemaVersion: 1, data: { maps: { 1: 20, 2: 30 } } } ] ],
        '',
        'Next battler: its enemy\'s level here, else level 6, this map\'s level.',
        null,
      ]);
  });

  it('clears the level when the box is emptied and entered, as one step', async () =>
  {
    // Arrange: map 1 at 12.
    const { hub } = renderSetting({ 1: 12 });
    await screen.findByRole('textbox', { name: 'New battlers start at level' });

    // Act.
    fireEvent.change(box(), { target: { value: '' } });
    await act(async () =>
    {
      fireEvent.keyDown(box(), { key: 'Enter' });
    });

    // Assert: no battler on the map gives a level, so the next takes its enemy's own.
    expect([ levelSetFor(hub, 1), stepsIn(hub), nextLine() ])
      .toStrictEqual([ null, [ 'Clear new battler level' ], 'Next battler: the enemy\'s own level.' ]);
  });

  it('refuses text that is no level, saying what the box takes, and puts back the level set on leaving', async () =>
  {
    // Arrange: map 1 at 12.
    const { hub } = renderSetting({ 1: 12 });
    await screen.findByRole('textbox', { name: 'New battlers start at level' });

    // Act.
    fireEvent.change(box(), { target: { value: '2.5' } });
    const refused = screen.getByText(/^A whole number/u).textContent;
    fireEvent.blur(box());

    // Assert.
    expect([ refused, box().value, levelSetFor(hub, 1), stepsIn(hub) ])
      .toStrictEqual([ 'A whole number from -999999 to 999999, or empty.', '12', 12, [] ]);
  });

  it('follows the map\'s battlers as the battler panel gives them levels', async () =>
  {
    // Arrange: a map setting none, whose battler stands at level 6.
    const { hub } = renderSetting({}, { battlers: [ battler(1, 6) ] });
    await screen.findByRole('textbox', { name: 'New battlers start at level' });
    const context = { enemyOf: () => null, defaults: { sight: 4, pursuit: 6, alertedSightBoost: 2, alertedPursuitBoost: 4, alertDuration: 300, canIdle: true, showHpBar: true, showName: true, inanimate: false }, motionDefaults: motionDefaultsFrom(null) };

    // Act.
    act(() =>
    {
      changeBattlers(hub, 1, () => 0, [ 1 ], { row: 'level', value: 8 }, context);
    });

    // Assert.
    expect(nextLine())
      .toBe('Next battler: its enemy\'s level here, else level 8, this map\'s level.');
  });

  it('says it is reading the levels while they open, and why when they cannot be read', async () =>
  {
    // Arrange: one window whose levels never arrive, and one whose levels cannot be read.

    // Act.
    const { unmount } = renderSetting({}, { open: 'never' });
    const waiting = screen.getByTestId('new-battler-level-waiting').textContent;
    unmount();
    renderSetting({}, { open: 'refused' });
    const refused = await screen.findByText(/could not be read/u);

    // Assert.
    expect([ waiting, refused.textContent, screen.queryByRole('textbox') ])
      .toStrictEqual([ 'Reading the levels set for each map…', 'The levels set for each map could not be read: the file is not JSON', null ]);
  });
});

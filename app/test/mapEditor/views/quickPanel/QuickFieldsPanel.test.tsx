/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuickModel, QuickModelSource, QuickPanelOptions } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickFieldsPanel, quickPanelFor } from '../../../../src/mapEditor/views/quickPanel/QuickFieldsPanel.tsx';
import { event, eventIn, hubWith, page } from '../../support/eventKindFixtures.ts';

/*
 * The shared panel every kind with settings shows. It files the settings its events share under their headings, and
 * says so when they share none, which a plugin kind whose events differ in shape can produce. It shows nothing for a
 * map the window does not hold, and the panel made for a kind carries that kind's name, so it can be told apart from
 * the others in the developer tools.
 *
 * A value still being chosen, as a colour picker passes through colours, shows on the map as it goes and becomes one
 * step once chosen; one still showing when another setting changes, an action runs, or the panel goes is kept as its
 * own step first, so no change is ever lost or merged into another. A value that cannot be shown says why. A kind may
 * say something about the selection as a whole above its settings, and offer swatches to its colour settings.
 */
describe('QuickFieldsPanel', () =>
{
  /**
   * A kind whose every event offers a setting of its own, so no two events share one.
   * @param {RmmzMapEvent} each The event.
   * @returns {QuickModel} A setting keyed by the event's id.
   */
  const ownSettings: QuickModelSource = (each: RmmzMapEvent): QuickModel => ({
    fields: [ { key: `own.${each.id}`, label: `Own ${each.id}`, section: 'Mine', control: { kind: 'number', min: 0, max: 9 }, value: 1, step: 'Change', write: () => [] } ],
    actions: [],
  });

  /**
   * A kind offering a tint, kept in the event's note as a colour (#bbaadd cannot be written), a glow kept in its name
   * the same way, a speed for its first page, and an action that renames it.
   * @param {RmmzMapEvent} each The event.
   * @returns {QuickModel} The settings and the action.
   */
  const tinted: QuickModelSource = (each: RmmzMapEvent): QuickModel => ({
    fields: [
      {
        key: 'tint',
        label: 'Tint',
        section: '',
        control: { kind: 'color' },
        value: each.note === '' ? '#000000' : each.note,
        step: 'Change tint',
        write: value =>
        {
          if (value === '#bbaadd')
          {
            throw new Error('that tint cannot be written');
          }

          return [ { kind: 'set', path: [ 'note' ], value } ];
        },
      },
      {
        key: 'glow',
        label: 'Glow',
        section: '',
        control: { kind: 'color' },
        value: each.name.startsWith('#') ? each.name : '#000000',
        step: 'Change glow',
        write: value => [ { kind: 'set', path: [ 'name' ], value } ],
      },
      {
        key: 'speed',
        label: 'Speed',
        section: '',
        control: { kind: 'number', min: 1, max: 6 },
        value: each.pages[0].moveSpeed,
        step: 'Change speed',
        write: value => [ { kind: 'set', path: [ 'pages', 0, 'moveSpeed' ], value } ],
      },
    ],
    actions: [ { key: 'rename', label: 'Rename', section: '', step: 'Rename', run: () => [ { kind: 'set', path: [ 'name' ], value: 'renamed' } ] } ],
  });

  /**
   * Renders the panel over a hub holding two events.
   * @param {React.ReactNode} panel The panel.
   * @returns {{ hub: DocumentHub, unmount: () => void }} The hub, and a way to take the panel away.
   */
  const renderPanel = (panel: React.ReactNode) =>
  {
    const { hub } = hubWith([ event(1, [ page([]) ]), event(2, [ page([]) ]) ]);
    const services = { hub, api: null, modules: null } as unknown as MapEditorServices;
    const { unmount } = render(
      <MapEditorServicesProvider services={services}>
        {panel}
      </MapEditorServicesProvider>
    );
    return { hub, unmount };
  };

  /**
   * Finds the tint's colour picker.
   * @returns {HTMLInputElement} The picker.
   */
  const tintPicker = () => screen.getByLabelText('Tint') as HTMLInputElement;

  /**
   * Lists the names of the steps the map's history holds.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The names, oldest first.
   */
  const stepsIn = (hub: DocumentHub) => hub.history(mapHistoryKey(1)).rows.map(row => row.label);

  it('files each event\'s settings under their heading, and says so when several events share none', () =>
  {
    // Arrange: nothing beyond the kind above.

    // Act.
    renderPanel(
      <>
        <QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={ownSettings}/>
        <QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1, 2 ]} source={ownSettings}/>
      </>
    );

    // Assert.
    expect([ screen.getByText('Mine').textContent, screen.getByLabelText('Own 1').getAttribute('value'), screen.getByText('These events have no settings in common.').textContent ])
      .toStrictEqual([ 'Mine', '1', 'These events have no settings in common.' ]);
  });

  it('shows nothing for a map the window does not hold', () =>
  {
    // Arrange: map 9 is not held.

    // Act.
    renderPanel(<QuickFieldsPanel documentKey={'map:9'} eventIds={[ 1 ]} source={ownSettings}/>);

    // Assert.
    expect(screen.queryByTestId('quick-fields'))
      .toBeNull();
  });

  it('names the panel it makes for a kind after the kind', () =>
  {
    // Arrange: nothing to set up.

    // Act.
    const Panel = quickPanelFor(ownSettings, 'core.test');

    // Assert.
    expect(Panel.displayName)
      .toBe('QuickPanel(core.test)');
  });

  it('shows each colour on the map as it is picked, and makes the one it closes on a single step', () =>
  {
    // Arrange.
    const { hub } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1, 2 ]} source={tinted}/>);

    // Act.
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });
    fireEvent.input(tintPicker(), { target: { value: '#445566' } });
    const showing = [ eventIn(hub, 1)?.note, eventIn(hub, 2)?.note, stepsIn(hub) ];
    fireEvent.change(tintPicker(), { target: { value: '#445566' } });

    // Assert.
    expect([ showing, eventIn(hub, 1)?.note, eventIn(hub, 2)?.note, stepsIn(hub) ])
      .toStrictEqual([ [ '#445566', '#445566', [] ], '#445566', '#445566', [ 'Change tint' ] ]);
  });

  it('keeps a colour still showing as its own step when another setting changes', () =>
  {
    // Arrange.
    const { hub } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted}/>);
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });

    // Act.
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '5' } });
    fireEvent.blur(screen.getByLabelText('Speed'));

    // Assert.
    expect([ eventIn(hub, 1)?.note, eventIn(hub, 1)?.pages[0].moveSpeed, stepsIn(hub) ])
      .toStrictEqual([ '#112233', 5, [ 'Change tint', 'Change speed' ] ]);
  });

  it('keeps a colour still showing as its own step when another colour starts showing', () =>
  {
    // Arrange.
    const { hub } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted}/>);
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });

    // Act: the glow starts showing a colour while the tint still shows one, and later closes on it.
    fireEvent.input(screen.getByLabelText('Glow'), { target: { value: '#445566' } });
    const whileGlowing = stepsIn(hub);
    fireEvent.change(screen.getByLabelText('Glow'), { target: { value: '#445566' } });

    // Assert.
    expect([ whileGlowing, eventIn(hub, 1)?.note, eventIn(hub, 1)?.name, stepsIn(hub) ])
      .toStrictEqual([ [ 'Change tint' ], '#112233', '#445566', [ 'Change tint', 'Change glow' ] ]);
  });

  it('keeps a colour still showing as its own step before an action runs', () =>
  {
    // Arrange.
    const { hub } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted}/>);
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    // Assert.
    expect([ eventIn(hub, 1)?.name, stepsIn(hub) ])
      .toStrictEqual([ 'renamed', [ 'Change tint', 'Rename' ] ]);
  });

  it('keeps a colour still showing as its own step when the panel goes', () =>
  {
    // Arrange.
    const { hub, unmount } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted}/>);
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });

    // Act.
    unmount();

    // Assert.
    expect([ eventIn(hub, 1)?.note, stepsIn(hub) ])
      .toStrictEqual([ '#112233', [ 'Change tint' ] ]);
  });

  it('says why a colour cannot be shown, and leaves the map as it was', () =>
  {
    // Arrange.
    const { hub } = renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted}/>);

    // Act.
    fireEvent.input(tintPicker(), { target: { value: '#bbaadd' } });

    // Assert.
    expect([ screen.getByRole('alert').textContent, eventIn(hub, 1)?.note, stepsIn(hub) ])
      .toStrictEqual([ 'That change could not be made: that tint cannot be written', '', [] ]);
  });

  it('says what the kind says about the selection above its settings', () =>
  {
    // Arrange: a kind counting the events picked.
    const options: QuickPanelOptions = { note: events => `${events.length} picked.` };

    // Act.
    renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1, 2, 9 ]} source={tinted} options={options}/>);

    // Assert: the empty slot 9 is not counted.
    expect(screen.getByTestId('quick-note').textContent)
      .toBe('2 picked.');
  });

  it('says nothing above the settings when the kind has nothing to say', () =>
  {
    // Arrange.
    const options: QuickPanelOptions = { note: () => null };

    // Act.
    renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted} options={options}/>);

    // Assert.
    expect(screen.queryByTestId('quick-note'))
      .toBeNull();
  });

  it('offers the kind\'s swatches, worked out from the map as it stands, to its colour settings', () =>
  {
    // Arrange: a kind offering every note on the map that is a colour.
    const options: QuickPanelOptions = {
      swatches: events => events.flatMap(each => (each !== null && each.note.startsWith('#') ? [ each.note ] : [])),
    };
    renderPanel(<QuickFieldsPanel documentKey={'map:1'} eventIds={[ 1 ]} source={tinted} options={options}/>);
    const before = screen.queryAllByRole('button', { name: /^#/u }).length;

    // Act: the event takes a tint, which the map then holds.
    fireEvent.input(tintPicker(), { target: { value: '#112233' } });

    // Assert: each colour setting offers it.
    expect([ before, screen.getAllByRole('button', { name: /^#/u }).map(button => button.getAttribute('aria-label')) ])
      .toStrictEqual([ 0, [ '#112233', '#112233' ] ]);
  });
});

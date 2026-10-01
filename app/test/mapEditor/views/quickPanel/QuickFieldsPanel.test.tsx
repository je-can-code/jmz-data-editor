/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuickModel, QuickModelSource } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickFieldsPanel, quickPanelFor } from '../../../../src/mapEditor/views/quickPanel/QuickFieldsPanel.tsx';
import { event, hubWith, page } from '../../support/eventKindFixtures.ts';

/*
 * The shared panel every core kind shows. It files the settings its events share under their headings, and says so
 * when they share none, which a plugin kind whose events differ in shape can produce. It shows nothing for a map
 * the window does not hold, and the panel made for a kind carries that kind's name, so it can be told apart from
 * the others in the developer tools.
 */
describe('QuickFieldsPanel', () =>
{
  /**
   * A kind whose every event offers a setting of its own, so no two events share one.
   * @param {import('../../../../src/mapEditor/core/model/rmmzTypes.ts').RmmzMapEvent} each The event.
   * @returns {QuickModel} A setting keyed by the event's id.
   */
  const ownSettings: QuickModelSource = (each): QuickModel => ({
    fields: [ { key: `own.${each.id}`, label: `Own ${each.id}`, section: 'Mine', control: { kind: 'number', min: 0, max: 9 }, value: 1, step: 'Change', write: () => [] } ],
    actions: [],
  });

  /**
   * Renders the panel over a hub holding two events.
   * @param {React.ReactNode} panel The panel.
   */
  const renderPanel = (panel: React.ReactNode) =>
  {
    const { hub } = hubWith([ event(1, [ page([]) ]), event(2, [ page([]) ]) ]);
    const services = { hub, api: null, modules: null } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        {panel}
      </MapEditorServicesProvider>
    );
  };

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
});

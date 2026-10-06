/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapPropertiesSection } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { mapLightingSource } from '../../../../src/mapEditor/modules/lighting/mapLighting.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { ModulePropertiesSection } from '../../../../src/mapEditor/workspace/panels/ModulePropertiesSection.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A section a plugin module adds to Map Properties shows its heading, what it says about the map as a whole, and its
 * settings, with the same controls the quick panel shows an event's settings with. Every change is one step in the
 * map's own history. A value still being chosen, as a colour picker passes through colours or a slider is dragged,
 * shows on the map as it goes, before it is a step, and becomes one step once chosen; one still showing when another
 * setting changes, or when the section goes, is kept as its own step first, so no change is lost or merged into another.
 * A change the map cannot take is refused, saying why, and leaves the map as it was.
 *
 * J-Lighting's own section stands in for any module's here, over a cave at 85% darkness with no sky.
 */
describe('ModulePropertiesSection', () =>
{
  /**
   * J-Lighting's section, its sky offered, as Chef Adventure runs it.
   */
  const LIGHTING: MapPropertiesSection = { id: 'lighting.map', title: 'Lighting', source: mapLightingSource('#000000', true) };

  /**
   * Renders a section over a hub holding map 1 with the given note.
   * @param {string} note The map's note.
   * @param {MapPropertiesSection} section The section.
   * @returns {{ hub: DocumentHub, unmount: () => void }} The hub, and a way to take the section away.
   */
  const renderSection = (note: string, section: MapPropertiesSection = LIGHTING) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', { ...buildMapJson(), note } as unknown as JsonValue);
    const controller = new WorkspaceController({ hub, api: null, openDocument: async () => undefined } as unknown as MapEditorServices);
    const { unmount } = render(
      <WorkspaceProvider controller={controller}>
        <ModulePropertiesSection mapId={1} map={hub.map('map:1')} section={section}/>
      </WorkspaceProvider>
    );
    return { hub, unmount };
  };

  /**
   * Reads map 1's note.
   * @param {DocumentHub} hub The hub.
   * @returns {string} The note.
   */
  const noteIn = (hub: DocumentHub): string => hub.map('map:1').property('note');

  /**
   * Lists the names of the steps map 1's history holds.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The names, oldest first.
   */
  const stepsIn = (hub: DocumentHub): string[] => hub.history(mapHistoryKey(1)).rows.map(row => row.label);

  /**
   * Finds the colour of the dark's picker.
   * @returns {HTMLInputElement} The picker.
   */
  const darkPicker = () => screen.getByLabelText('Colour of the dark') as HTMLInputElement;

  it('shows its heading, what it says about the map, and each setting as the map holds it', () =>
  {
    // Arrange: a note setting the darkness twice, the last line's at 70, with no sky.

    // Act.
    renderSection('<noToneChange>\n<ambient:[30]>\n<ambient:[70]>');

    // Assert.
    expect([
      screen.getByText('Lighting').textContent,
      screen.getByText(/sets a darkness 2 times/u).textContent,
      (screen.getByRole('textbox', { name: 'Darkness' }) as HTMLInputElement).value,
      darkPicker().value,
      (screen.getByRole('checkbox', { name: 'Sky follows the clock' }) as HTMLInputElement).checked,
    ])
      .toStrictEqual([
        'Lighting',
        'This note sets a darkness 2 times; the game reads only the last line\'s, which is the one shown here.',
        '70',
        '#000000',
        false,
      ]);
  });

  it('shows each colour of the dark on the map as it is picked, before it is a step, and makes the one it closes on a single step', () =>
  {
    // Arrange.
    const { hub } = renderSection('<noToneChange>\n<ambient:[85]>');

    // Act.
    fireEvent.input(darkPicker(), { target: { value: '#112233' } });
    fireEvent.input(darkPicker(), { target: { value: '#0a2a2a' } });
    const showing = [ noteIn(hub), stepsIn(hub) ];
    fireEvent.change(darkPicker(), { target: { value: '#0a2a2a' } });

    // Assert.
    expect([ showing, noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ [ '<noToneChange>\n<ambient:[85, #0a2a2a]>', [] ], '<noToneChange>\n<ambient:[85, #0a2a2a]>', [ 'Change darkness colour' ] ]);
  });

  it('makes a darkness dragged along its track one step', () =>
  {
    // Arrange.
    const { hub } = renderSection('<noToneChange>\n<ambient:[85]>');

    // Act: one step up the track.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Darkness' }), { key: 'ArrowRight' });

    // Assert.
    expect([ noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ '<noToneChange>\n<ambient:[86]>', [ 'Change darkness' ] ]);
  });

  it('makes a typed darkness one step', () =>
  {
    // Arrange.
    const { hub } = renderSection('<noToneChange>\n<ambient:[85]>');
    const box = screen.getByRole('textbox', { name: 'Darkness' });

    // Act.
    fireEvent.change(box, { target: { value: '12.5' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    // Assert.
    expect([ noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ '<noToneChange>\n<ambient:[12.5]>', [ 'Change darkness' ] ]);
  });

  it('keeps a colour still showing as its own step when another setting changes', () =>
  {
    // Arrange.
    const { hub } = renderSection('<noToneChange>\n<ambient:[85]>');
    fireEvent.input(darkPicker(), { target: { value: '#0a2a2a' } });

    // Act: the sky follows the clock again.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sky follows the clock' }));

    // Assert.
    expect([ noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ '<ambient:[85, #0a2a2a]>', [ 'Change darkness colour', 'Change sky' ] ]);
  });

  it('keeps a colour still showing as its own step when another setting starts showing a value', () =>
  {
    // Arrange.
    const { hub } = renderSection('<noToneChange>\n<ambient:[85]>');
    fireEvent.input(darkPicker(), { target: { value: '#0a2a2a' } });

    // Act: the darkness drags a step up the track.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Darkness' }), { key: 'ArrowRight' });

    // Assert.
    expect([ noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ '<noToneChange>\n<ambient:[86, #0a2a2a]>', [ 'Change darkness colour', 'Change darkness' ] ]);
  });

  it('keeps a colour still showing as its own step when the section goes', () =>
  {
    // Arrange.
    const { hub, unmount } = renderSection('<noToneChange>\n<ambient:[85]>');
    fireEvent.input(darkPicker(), { target: { value: '#0a2a2a' } });

    // Act.
    unmount();

    // Assert.
    expect([ noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ '<noToneChange>\n<ambient:[85, #0a2a2a]>', [ 'Change darkness colour' ] ]);
  });

  it('says why a change cannot be made, and leaves the map as it was', () =>
  {
    // Arrange: a stray bracket swallows any tag written after it.
    const { hub } = renderSection('the gate < the wall');

    // Act: the sky stops following the clock.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sky follows the clock' }));

    // Assert.
    expect([ screen.getByRole('alert').textContent, noteIn(hub), stepsIn(hub) ])
      .toStrictEqual([ 'That change could not be made: the game would not read this map\'s sky back as written', 'the gate < the wall', [] ]);
  });

  it('lets what it said about a refused change be dismissed', () =>
  {
    // Arrange.
    renderSection('the gate < the wall');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sky follows the clock' }));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert.
    expect(screen.queryByRole('alert'))
      .toBeNull();
  });

  it('says what a refusal says even when it is no error', () =>
  {
    // Arrange: a section whose one setting refuses every value with a bare word.
    const refusing: MapPropertiesSection = {
      id: 'test.map',
      title: 'Test',
      source: () => ({
        note: null,
        fields: [ {
          key: 'test.check',
          label: 'Refuses',
          control: { kind: 'check' },
          value: false,
          step: 'Change',
          write: () =>
          {
            throw 'never';
          },
        } ],
      }),
    };
    renderSection('', refusing);

    // Act.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refuses' }));

    // Assert.
    expect(screen.getByRole('alert').textContent)
      .toBe('That change could not be made: never');
  });
});

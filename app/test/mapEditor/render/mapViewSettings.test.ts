import { describe, expect, it } from 'vitest';
import { GAME_LOOK } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import {
  flipSwitch,
  isSwitchOn,
  SETTING_SWITCHES,
  toggleHighlight,
  type MapViewSettings,
} from '../../../src/mapEditor/render/mapViewSettings.ts';

/*
 * The map view's bar switches the overlays and the game look. Each switch must flip exactly its own setting and
 * leave every other alone, and the layer highlight must switch the dimming on with the layer and off with it, since
 * the renderer only dims while both say so.
 */

/**
 * The view's starting settings: the game look, with the tools' overlays on.
 * @returns {MapViewSettings} The settings.
 */
const start = (): MapViewSettings => ({ visibility: GAME_LOOK, overlays: new Set([ 'selection', 'hover', 'ghost' ]) });

describe('mapViewSettings', () =>
{
  describe('isSwitchOn and flipSwitch', () =>
  {
    it('starts with the game look: water animating, the parallax and events on, shadows and the overlays off', () =>
    {
      // Arrange.
      const settings = start();

      // Act.
      const on = SETTING_SWITCHES.map(setting => [ setting.label, isSwitchOn(settings, setting) ]);

      // Assert.
      expect(on)
        .toStrictEqual([
          [ 'Grid', false ],
          [ 'Regions', false ],
          [ 'Passability', false ],
          [ 'Animate water', true ],
          [ 'Parallax', true ],
          [ 'Events', true ],
          [ 'Shadows', false ],
        ]);
    });

    it('flips each switch on its own, and back again', () =>
    {
      // Arrange.
      const settings = start();

      // Act: every switch flipped once, each from the start, then the first flipped twice.
      const flipped = SETTING_SWITCHES.map(setting => SETTING_SWITCHES.map(other => isSwitchOn(flipSwitch(settings, setting), other)));
      const twice = flipSwitch(flipSwitch(settings, SETTING_SWITCHES[0]), SETTING_SWITCHES[0]);

      // Assert: each row differs from the start only at its own switch.
      const initial = SETTING_SWITCHES.map(setting => isSwitchOn(settings, setting));
      expect([ flipped.map((row, index) => row.map((value, column) => (column === index ? value !== initial[column] : value === initial[column]))), isSwitchOn(twice, SETTING_SWITCHES[0]) ])
        .toStrictEqual([ SETTING_SWITCHES.map(() => SETTING_SWITCHES.map(() => true)), false ]);
    });
  });

  describe('toggleHighlight', () =>
  {
    it('highlights a layer with the dimming on, moves to another layer, and turns off on the same layer again', () =>
    {
      // Arrange.
      const settings = start();

      // Act.
      const third = toggleHighlight(settings, 'tiles3');
      const first = toggleHighlight(third, 'tiles1');
      const none = toggleHighlight(first, 'tiles1');

      // Assert.
      expect([ third, first, none ].map(each => [ each.visibility.highlighted, each.overlays.has('layer-highlight'), each.overlays.has('hover') ]))
        .toStrictEqual([ [ 'tiles3', true, true ], [ 'tiles1', true, true ], [ null, false, true ] ]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { GAME_LOOK } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import {
  flipSwitch,
  isSwitchOn,
  SETTING_SWITCHES,
  shownSwitches,
  toggleHighlight,
  type MapViewSettings,
} from '../../../src/mapEditor/render/mapViewSettings.ts';

/*
 * The map view's bar switches the overlays and the game look. Each switch must flip exactly its own setting and
 * leave every other alone, and the layer highlight must switch the dimming on with the layer and off with it, since
 * the renderer only dims while both say so. Animate is the one switch for everything that moves, the water, the
 * lights' effects and the weather alike, so one click freezes it all. Lighting, beside Shadows, shows and hides
 * everything plugin modules draw into the lighting layer, and Weather, beside Lighting, everything they draw into the
 * weather layer; each is offered only while some module draws there, so a project without such a plugin never shows a
 * switch that does nothing.
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
    it('starts with the game look: everything animating, the parallax, events, lighting and weather on, shadows and the overlays off', () =>
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
          [ 'Animate', true ],
          [ 'Parallax', true ],
          [ 'Events', true ],
          [ 'Shadows', false ],
          [ 'Lighting', true ],
          [ 'Weather', true ],
        ]);
    });

    it('stops all motion with Animate, and nothing else', () =>
    {
      // Arrange.
      const settings = start();
      const animate = SETTING_SWITCHES.find(setting => setting.label === 'Animate') as (typeof SETTING_SWITCHES)[number];

      // Act.
      const flipped = flipSwitch(settings, animate);

      // Assert: the one setting the water and the lights' effects both follow went off, every layer left as it was.
      expect([ flipped.visibility, flipped.overlays ])
        .toStrictEqual([ { ...GAME_LOOK, animate: false }, settings.overlays ]);
    });

    it('switches the lighting layer with Lighting, and nothing else', () =>
    {
      // Arrange.
      const settings = start();
      const lighting = SETTING_SWITCHES.find(setting => setting.label === 'Lighting') as (typeof SETTING_SWITCHES)[number];

      // Act.
      const flipped = flipSwitch(settings, lighting);

      // Assert: only the lighting layer went off.
      expect([ flipped.visibility.layers, flipped.overlays ])
        .toStrictEqual([ { ...GAME_LOOK.layers, lighting: false }, settings.overlays ]);
    });

    it('switches the weather layer with Weather, and nothing else, the animation included', () =>
    {
      // Arrange.
      const settings = start();
      const weather = SETTING_SWITCHES.find(setting => setting.label === 'Weather') as (typeof SETTING_SWITCHES)[number];

      // Act.
      const flipped = flipSwitch(settings, weather);

      // Assert: only the weather layer went off; the game look still moves.
      expect([ flipped.visibility.layers, flipped.visibility.animate, flipped.overlays ])
        .toStrictEqual([ { ...GAME_LOOK.layers, weather: false }, true, settings.overlays ]);
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

  describe('shownSwitches', () =>
  {
    it('offers Lighting right after Shadows while a module lights the map, and no Weather while none draws weather', () =>
    {
      // Arrange: some active module draws into the lighting layer, none into the weather layer.

      // Act.
      const labels = shownSwitches(true, false).map(setting => setting.label);

      // Assert.
      expect(labels)
        .toStrictEqual([ 'Grid', 'Regions', 'Passability', 'Animate', 'Parallax', 'Events', 'Shadows', 'Lighting' ]);
    });

    it('offers Weather right after Lighting while modules draw both', () =>
    {
      // Arrange: active modules draw into the lighting layer and the weather layer, as J-Lighting's and J-Weather's do.

      // Act.
      const labels = shownSwitches(true, true).map(setting => setting.label);

      // Assert.
      expect(labels)
        .toStrictEqual([ 'Grid', 'Regions', 'Passability', 'Animate', 'Parallax', 'Events', 'Shadows', 'Lighting', 'Weather' ]);
    });

    it('offers Weather on its own while a module draws weather and none lights the map', () =>
    {
      // Arrange: J-Weather enabled without J-Lighting.

      // Act.
      const labels = shownSwitches(false, true).map(setting => setting.label);

      // Assert.
      expect(labels)
        .toStrictEqual([ 'Grid', 'Regions', 'Passability', 'Animate', 'Parallax', 'Events', 'Shadows', 'Weather' ]);
    });

    it('leaves Lighting and Weather out while no module draws either, and every other overlay and layer switch in', () =>
    {
      // Arrange: no active module draws into the lighting layer or the weather layer.

      // Act.
      const labels = shownSwitches(false, false).map(setting => setting.label);

      // Assert.
      expect(labels)
        .toStrictEqual([ 'Grid', 'Regions', 'Passability', 'Animate', 'Parallax', 'Events', 'Shadows' ]);
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

import type { CoreOverlayId, LayerVisibility, OverlayId, RenderLayer, TileLayer } from '../core/renderer/MapRenderer.ts';

/**
 * What a map view shows: the layers and the game look, and which overlays are on.
 */
type MapViewSettings = {
  readonly visibility: LayerVisibility;
  readonly overlays: ReadonlySet<OverlayId>;
};

/**
 * One switch in the map view's bar: what it is called, and what it switches.
 */
type SettingSwitch =
  | { readonly kind: 'overlay'; readonly id: CoreOverlayId; readonly label: string }
  | { readonly kind: 'layer'; readonly id: RenderLayer; readonly label: string }
  | { readonly kind: 'animation'; readonly label: string };

/**
 * The switches the bar can offer, in the order it shows them: the overlays an author edits with, then the game look.
 * Animate starts and stops everything that moves in the game at once: water and waterfalls, a drifting parallax, and the
 * lights' flicker, pulse and glitch. Lighting shows and hides everything plugin modules draw into the lighting layer, such
 * as a light's reach and a map's darkness, so it is offered only while some module draws there ({@link shownSwitches}).
 */
const SETTING_SWITCHES: readonly SettingSwitch[] = [
  { kind: 'overlay', id: 'grid', label: 'Grid' },
  { kind: 'overlay', id: 'regions', label: 'Regions' },
  { kind: 'overlay', id: 'passability', label: 'Passability' },
  { kind: 'animation', label: 'Animate' },
  { kind: 'layer', id: 'parallax', label: 'Parallax' },
  { kind: 'layer', id: 'events', label: 'Events' },
  { kind: 'layer', id: 'shadows', label: 'Shadows' },
  { kind: 'layer', id: 'lighting', label: 'Lighting' },
];

/**
 * The four tile layers, in the order the highlight picker lists them.
 */
const TILE_LAYERS: readonly TileLayer[] = [ 'tiles1', 'tiles2', 'tiles3', 'tiles4' ];

/**
 * Lists the switches the bar shows: all of them, except Lighting while no plugin module draws into the lighting layer,
 * so a project without such a plugin is never offered a switch that does nothing.
 * @param {boolean} drawsLighting Whether any active module draws into the lighting layer.
 * @returns {SettingSwitch[]} The switches, in the bar's order.
 */
const shownSwitches = (drawsLighting: boolean): SettingSwitch[] =>
{
  return SETTING_SWITCHES.filter(setting => drawsLighting || setting.kind !== 'layer' || setting.id !== 'lighting');
};

/**
 * Reports whether a switch is on.
 * @param {MapViewSettings} settings The settings.
 * @param {SettingSwitch} setting The switch.
 * @returns {boolean} True when on.
 */
const isSwitchOn = (settings: MapViewSettings, setting: SettingSwitch): boolean =>
{
  switch (setting.kind)
  {
    case 'overlay':
      return settings.overlays.has(setting.id);
    case 'layer':
      return settings.visibility.layers[setting.id];
    case 'animation':
      return settings.visibility.animate;
  }
};

/**
 * Flips one switch.
 * @param {MapViewSettings} settings The settings.
 * @param {SettingSwitch} setting The switch.
 * @returns {MapViewSettings} The new settings.
 */
const flipSwitch = (settings: MapViewSettings, setting: SettingSwitch): MapViewSettings =>
{
  const { visibility, overlays } = settings;
  switch (setting.kind)
  {
    case 'overlay':
    {
      const next = new Set(overlays);
      if (next.has(setting.id))
      {
        next.delete(setting.id);
      }
      else
      {
        next.add(setting.id);
      }

      return { visibility, overlays: next };
    }
    case 'layer':
      return {
        visibility: { ...visibility, layers: { ...visibility.layers, [setting.id]: visibility.layers[setting.id] === false } },
        overlays,
      };
    case 'animation':
      return { visibility: { ...visibility, animate: visibility.animate === false }, overlays };
  }
};

/**
 * Highlights a tile layer, dimming the rest, or stops highlighting. Choosing the layer already highlighted stops.
 * @param {MapViewSettings} settings The settings.
 * @param {TileLayer} layer The layer.
 * @returns {MapViewSettings} The new settings.
 */
const toggleHighlight = (settings: MapViewSettings, layer: TileLayer): MapViewSettings =>
{
  const highlighted = settings.visibility.highlighted === layer
    ? null
    : layer;
  const overlays = new Set(settings.overlays);
  if (highlighted === null)
  {
    overlays.delete('layer-highlight');
  }
  else
  {
    overlays.add('layer-highlight');
  }

  return { visibility: { ...settings.visibility, highlighted }, overlays };
};

export { flipSwitch, isSwitchOn, SETTING_SWITCHES, shownSwitches, TILE_LAYERS, toggleHighlight };
export type { MapViewSettings, SettingSwitch };

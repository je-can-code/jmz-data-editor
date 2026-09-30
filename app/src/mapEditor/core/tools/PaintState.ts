import type { LayerChoice } from '../tiles/layering.ts';
import type { TileLayerIndex } from '../tiles/tileGrid.ts';
import type { Brush } from './brush.ts';

/**
 * The painting tools. The pen, eraser and shadow pen paint as they are dragged; the rectangle and ellipse paint their
 * shape when the button comes up; the fill and the swap act on a click; the eyedropper picks a brush off the map; and
 * the select tool lifts a piece of the map to move or copy. The shadow pen and the region pen are the pen with a
 * shadows or regions brush in hand, since the brush says what it paints.
 */
type PaintTool = 'pen' | 'rectangle' | 'ellipse' | 'fill' | 'eraser' | 'eyedropper' | 'select' | 'swap';

/**
 * Every tool, in the order the tool bar shows them.
 */
const PAINT_TOOLS: readonly PaintTool[] = [ 'pen', 'rectangle', 'ellipse', 'fill', 'eraser', 'eyedropper', 'select', 'swap' ];

/**
 * What the tools paint with, shared by every map view in the window.
 */
type PaintSettings = {
  /**
   * The tool in hand.
   */
  readonly tool: PaintTool;

  /**
   * The brush in hand, or null before anything is picked, when the tools that paint do nothing.
   */
  readonly brush: Brush | null;

  /**
   * The layer strip's choice: automatic layering, or one layer.
   */
  readonly strip: LayerChoice;

  /**
   * The layer the one-stroke override paints while its key is held: the last layer picked on the strip, layer 3 until
   * one is, since laying a tile over the ground on layer 3 is what the override was asked for.
   */
  readonly overrideLayer: TileLayerIndex;
};

/**
 * Hears every change to the settings.
 */
type PaintSettingsListener = (settings: PaintSettings) => void;

/**
 * Where a window starts: the pen in hand, nothing picked, automatic layering, and layer 3 for the override.
 */
const INITIAL_PAINT_SETTINGS: PaintSettings = { tool: 'pen', brush: null, strip: 'auto', overrideLayer: 2 };

/**
 * The window's painting settings: the tool, the brush, the layer strip's choice and the override's layer. The palette
 * hands its brush over here, the layer strip its choice, and every map view in the window paints with what this
 * holds, so picking a tile once serves every map on screen.
 */
class PaintState
{
  #settings: PaintSettings;

  #listeners = new Set<PaintSettingsListener>();

  /**
   * @param {PaintSettings} settings Where to start.
   */
  constructor(settings: PaintSettings = INITIAL_PAINT_SETTINGS)
  {
    this.#settings = settings;
  }

  /**
   * The settings as they stand.
   * @returns {PaintSettings} The settings.
   */
  get settings(): PaintSettings
  {
    return this.#settings;
  }

  /**
   * Picks a tool.
   * @param {PaintTool} tool The tool.
   */
  setTool(tool: PaintTool): void
  {
    this.#update({ tool });
  }

  /**
   * Picks a brush.
   * @param {Brush | null} brush The brush, or null to put it down.
   */
  setBrush(brush: Brush | null): void
  {
    this.#update({ brush });
  }

  /**
   * Picks the layer strip's choice. Picking a layer also makes it the one the override paints, so a layer chosen once
   * stays a held key away after the strip goes back to automatic.
   * @param {LayerChoice} strip The choice.
   */
  setStrip(strip: LayerChoice): void
  {
    this.#update(strip === 'auto' ? { strip } : { strip, overrideLayer: strip });
  }

  /**
   * Picks the layer the override paints, leaving the strip as it is.
   * @param {TileLayerIndex} overrideLayer The layer.
   */
  setOverrideLayer(overrideLayer: TileLayerIndex): void
  {
    this.#update({ overrideLayer });
  }

  /**
   * Listens for changes.
   * @param {PaintSettingsListener} listener Called with the new settings after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: PaintSettingsListener): () => void
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Applies a change and tells every listener, unless nothing changed.
   * @param {Partial<PaintSettings>} change The fields to change.
   */
  #update(change: Partial<PaintSettings>): void
  {
    const next = { ...this.#settings, ...change };
    const same = (Object.keys(change) as (keyof PaintSettings)[]).every(key => next[key] === this.#settings[key]);
    if (same)
    {
      return;
    }

    this.#settings = next;
    [ ...this.#listeners ].forEach(listener => listener(next));
  }
}

export { INITIAL_PAINT_SETTINGS, PAINT_TOOLS, PaintState };
export type { PaintSettings, PaintSettingsListener, PaintTool };

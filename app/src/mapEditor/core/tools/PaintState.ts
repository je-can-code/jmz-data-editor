import type { Stamp } from '../stamps/stamp.ts';
import type { LayerChoice } from '../tiles/layering.ts';
import type { TileLayerIndex } from '../tiles/tileGrid.ts';
import type { Brush } from './brush.ts';

/**
 * What the left button does on the map. With {@code events} in hand it works on the events, selecting, moving and
 * opening them, and paints nothing; every other tool paints and leaves the events alone. The pen, eraser and shadow pen
 * paint as they are dragged; the rectangle and ellipse paint their shape when the button comes up; the fill and the
 * swap act on a click; the eyedropper picks a brush off the map; the select tool lifts a piece of the map to move or
 * copy; and the stamp places the stamp picked in the Stamps panel with each click. The shadow pen and the region pen are
 * the pen with a shadows or regions brush in hand, since the brush says what it paints.
 */
type PaintTool = 'events' | 'pen' | 'rectangle' | 'ellipse' | 'fill' | 'eraser' | 'eyedropper' | 'select' | 'swap' | 'stamp';

/**
 * Every tool, in the order the tool bar shows them.
 */
const PAINT_TOOLS: readonly PaintTool[] = [ 'events', 'pen', 'rectangle', 'ellipse', 'fill', 'eraser', 'eyedropper', 'select', 'swap', 'stamp' ];

/**
 * Reports whether a tool paints, as every tool but the events one does.
 * @param {PaintTool} tool The tool.
 * @returns {boolean} True when the left button paints with it.
 */
const isPaintingTool = (tool: PaintTool): boolean =>
{
  return tool !== 'events';
};

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

  /**
   * The stamp the stamp tool places, the one picked last in the Stamps panel, or null before any is. It stays picked
   * once the tool is put down, so the tool bar can take it up again.
   */
  readonly stamp: Stamp | null;

  /**
   * The blueprint the stamp in hand is the stamp of, when a blueprint was picked rather than a stamp: the stamp tool then
   * places linked copies of it. Null for a plain stamp, or none.
   */
  readonly blueprint: BlueprintInHand | null;
};

/**
 * A blueprint taken up as the stamp tool's brush: which one, so every click places copies linked to it, and what it is
 * called, for the words beside the tools.
 */
type BlueprintInHand = {
  readonly id: string;
  readonly name: string;
};

/**
 * Hears every change to the settings.
 */
type PaintSettingsListener = (settings: PaintSettings) => void;

/**
 * Where a window starts: the events in hand, so a click on the map selects as it always has, nothing picked, automatic
 * layering, layer 3 for the override, and no stamp or blueprint.
 */
const INITIAL_PAINT_SETTINGS: PaintSettings = { tool: 'events', brush: null, strip: 'auto', overrideLayer: 2, stamp: null, blueprint: null };

/**
 * The window's painting settings: the tool, the brush, the layer strip's choice, the override's layer and the stamp.
 * The palette hands its brush over here, the layer strip its choice and the Stamps panel its stamp, and every map view
 * in the window paints with what this holds, so picking a tile or a stamp once serves every map on screen.
 *
 * Taking up the stamp remembers the tool in hand before it, which putting the stamp down goes back to: Escape over a
 * stamp in hand returns to whatever the author was doing.
 */
class PaintState
{
  #settings: PaintSettings;

  #listeners = new Set<PaintSettingsListener>();

  #toolBeforeStamp: PaintTool = 'events';

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
   * Takes up a stamp: it becomes the stamp in hand, and the stamp tool the tool, so the next click on a map places it.
   * The tool in hand before is remembered for {@link putDownStamp}.
   * @param {Stamp} stamp The stamp.
   */
  takeUpStamp(stamp: Stamp): void
  {
    this.#update({ stamp, blueprint: null, tool: 'stamp' });
  }

  /**
   * Takes up a blueprint: its stamp becomes the stamp in hand, placed as linked copies of it, and the stamp tool the
   * tool, as {@link takeUpStamp} does for a plain stamp.
   * @param {{ id: string, name: string, stamp: Stamp }} blueprint The blueprint: its id, its name and its stamp.
   */
  takeUpBlueprint(blueprint: BlueprintInHand & { readonly stamp: Stamp }): void
  {
    const { id, name, stamp } = blueprint;
    this.#update({ stamp, blueprint: { id, name }, tool: 'stamp' });
  }

  /**
   * Follows a blueprint's new name, when it is the blueprint picked, so the words beside the tools say what it is called
   * now; anything else picked is left as it is.
   * @param {string} blueprintId The blueprint renamed.
   * @param {string} name Its new name.
   */
  renameBlueprint(blueprintId: string, name: string): void
  {
    const { blueprint } = this.#settings;
    if (blueprint !== null && blueprint.id === blueprintId)
    {
      this.#update({ blueprint: { id: blueprintId, name } });
    }
  }

  /**
   * Puts the stamp down, going back to the tool that was in hand before it was taken up. The stamp stays picked, and
   * with any other tool in hand nothing changes.
   */
  putDownStamp(): void
  {
    if (this.#settings.tool === 'stamp')
    {
      this.#update({ tool: this.#toolBeforeStamp });
    }
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
   * Applies a change and tells every listener, unless nothing changed. A change taking up the stamp tool from another
   * remembers that other, however the stamp tool was taken up: from the Stamps panel or from the tool bar.
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

    if (next.tool === 'stamp' && this.#settings.tool !== 'stamp')
    {
      this.#toolBeforeStamp = this.#settings.tool;
    }

    this.#settings = next;
    [ ...this.#listeners ].forEach(listener => listener(next));
  }
}

export { INITIAL_PAINT_SETTINGS, isPaintingTool, PAINT_TOOLS, PaintState };
export type { BlueprintInHand, PaintSettings, PaintSettingsListener, PaintTool };

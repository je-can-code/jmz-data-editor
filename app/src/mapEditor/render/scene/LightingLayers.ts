import { Container } from 'pixi.js';
import type { LightingDrawing, LightingFrame, LightingLayerDefinition } from '../../core/renderer/lightingLayer.ts';
import type { ChangeEffect } from '../documentChanges.ts';

/**
 * One module's lighting in this view: what it was made from, the container it draws in, the drawing itself, and whether
 * it moves on with the clock between draws, which it does until a part of it fails, and again once it draws.
 */
type LightingEntry = {
  readonly definition: LightingLayerDefinition;
  readonly root: Container;
  readonly drawing: LightingDrawing;
  ticking: boolean;
};

/**
 * Everything plugin modules draw into a view's lighting layer: one drawing per lighting layer they contribute, each in
 * a container of its own, in the order they were contributed, inside the one container the view's Lighting switch
 * shows and hides.
 *
 * The drawings are asked to draw only when what they draw from may have changed: the map opened or was swapped, the
 * graphics card gave the context back, or an edit touched anything but the tiles. Tile edits are what a brush stroke
 * makes, many times a second, and nothing a module lights the map with reads them. However many changes arrive before
 * a frame, the drawings draw once in it, and not at all while the layer is hidden: they catch up when it shows.
 *
 * In every other frame the layer shows, each drawing is handed the clock to move on to, and the frame has something new
 * to show only when one of them changed. While the layer is hidden nothing is ticked at all.
 */
class LightingLayers
{
  /**
   * The lighting layer: every drawing's container, shown and hidden as one.
   */
  readonly layer = new Container();

  #tileSize: number;

  #entries: LightingEntry[] = [];

  #stale = true;

  /**
   * @param {number} tileSize The tile size the drawings draw at.
   */
  constructor(tileSize: number)
  {
    this.#tileSize = tileSize;
  }

  /**
   * Chooses what draws: a drawing is made for each lighting layer not drawing yet, kept for each still wanted, and let
   * go for each no longer wanted. A new drawing draws in the next frame.
   * @param {readonly LightingLayerDefinition[]} definitions The lighting layers the active modules contribute.
   */
  setDefinitions(definitions: readonly LightingLayerDefinition[]): void
  {
    const kept = this.#entries.filter(entry => definitions.includes(entry.definition));
    this.#entries.filter(entry => kept.includes(entry) === false).forEach(entry =>
    {
      entry.drawing.destroy();
      entry.root.destroy({ children: true });
    });

    const made: LightingEntry[] = [];
    this.#entries = definitions.map(definition =>
    {
      const known = kept.find(entry => entry.definition === definition);
      if (known !== undefined)
      {
        return known;
      }

      const root = new Container();
      this.layer.addChild(root);
      const entry = { definition, root, drawing: definition.create({ layer: root, tileSize: this.#tileSize }), ticking: false };
      made.push(entry);
      return entry;
    });

    // the containers follow the order the modules contributed in.
    this.#entries.forEach((entry, index) => this.layer.setChildIndex(entry.root, index));
    this.#stale ||= made.length > 0;
  }

  /**
   * Marks every drawing as due to draw, for a map just opened or swapped, or a context just given back.
   */
  markStale(): void
  {
    this.#stale = true;
  }

  /**
   * Hears what a change to the map asks of the renderer, and marks the drawings due to draw unless it changed only
   * tiles.
   * @param {ChangeEffect} effect What the change asks for.
   */
  hear(effect: ChangeEffect): void
  {
    if (effect.kind !== 'tiles')
    {
      this.#stale = true;
    }
  }

  /**
   * Brings every drawing up to the frame while the layer shows: asks each to draw when they are due, and otherwise hands
   * each the clock to move on to. A drawing that throws is left as it was, its error raised on its own, so it is seen
   * without stopping the map or the other drawings; it is not ticked again until it next draws, so a fault in moving on
   * is raised once rather than every frame.
   * @param {LightingFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when any drawing drew or moved, so the frame has something new to show.
   */
  draw(frame: LightingFrame): boolean
  {
    if (this.layer.visible === false || this.#entries.length === 0)
    {
      return false;
    }

    if (this.#stale)
    {
      this.#stale = false;
      this.#entries.forEach(entry =>
      {
        entry.ticking = this.#attempt(() => entry.drawing.draw(frame));
      });
      return true;
    }

    // between draws, only what moves with the clock has anything to do.
    return this.#entries.reduce((moved, entry) => this.#tickEntry(entry, frame) || moved, false);
  }

  /**
   * How many drawings there are.
   * @returns {number} The count.
   */
  get count(): number
  {
    return this.#entries.length;
  }

  /**
   * Lets every drawing go, and the layer with them.
   */
  destroy(): void
  {
    this.#entries.forEach(entry => entry.drawing.destroy());
    this.#entries = [];
    this.layer.destroy({ children: true });
  }

  /**
   * Hands one drawing the clock, unless it failed since it last drew.
   * @param {LightingEntry} entry The drawing.
   * @param {LightingFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when it changed what it shows.
   */
  #tickEntry(entry: LightingEntry, frame: LightingFrame): boolean
  {
    if (entry.ticking === false)
    {
      return false;
    }

    let moved = false;
    entry.ticking = this.#attempt(() =>
    {
      moved = entry.drawing.tick(frame);
    });
    return moved;
  }

  /**
   * Runs one drawing's part of a frame, raising anything it throws on its own, after the frame, rather than letting it
   * stop the frame.
   * @param {() => void} part The drawing's part.
   * @returns {boolean} True when it ran through without throwing.
   */
  #attempt(part: () => void): boolean
  {
    try
    {
      part();
      return true;
    }
    catch (error)
    {
      queueMicrotask(() =>
      {
        throw error;
      });
      return false;
    }
  }
}

export { LightingLayers };

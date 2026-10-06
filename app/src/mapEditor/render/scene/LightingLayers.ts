import { Container } from 'pixi.js';
import type { LightingDrawing, LightingFrame, LightingLayerDefinition } from '../../core/renderer/lightingLayer.ts';
import type { ChangeEffect } from '../documentChanges.ts';

/**
 * One module's lighting in this view: what it was made from, the container it draws in, and the drawing itself.
 */
type LightingEntry = {
  readonly definition: LightingLayerDefinition;
  readonly root: Container;
  readonly drawing: LightingDrawing;
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
      const entry = { definition, root, drawing: definition.create({ layer: root, tileSize: this.#tileSize }) };
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
   * Asks every drawing to draw, when they are due and the layer shows. A drawing that throws is left as it was, and its
   * error is raised on its own, so it is seen without stopping the map or the other drawings from drawing.
   * @param {LightingFrame} frame The map and the renderer.
   * @returns {boolean} True when the drawings drew, so the frame has something new to show.
   */
  draw(frame: LightingFrame): boolean
  {
    if (this.#stale === false || this.layer.visible === false || this.#entries.length === 0)
    {
      return false;
    }

    this.#stale = false;
    this.#entries.forEach(entry =>
    {
      try
      {
        entry.drawing.draw(frame);
      }
      catch (error)
      {
        queueMicrotask(() =>
        {
          throw error;
        });
      }
    });

    return true;
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
}

export { LightingLayers };

import { Container } from 'pixi.js';
import type { JsonValue } from '../../core/model/json.ts';
import type { WeatherDrawing, WeatherFrame, WeatherLayerDefinition } from '../../core/renderer/weatherLayer.ts';
import type { ChangeEffect } from '../documentChanges.ts';

/**
 * One module's weather in this view: what it was made from, the container it draws in, the drawing itself, and whether
 * it moves on with the clock between draws, which it does until a part of it fails, and again once it draws.
 */
type WeatherEntry = {
  readonly definition: WeatherLayerDefinition;
  readonly root: Container;
  readonly drawing: WeatherDrawing;
  ticking: boolean;
};

/**
 * Everything plugin modules draw into a view's weather layer: one drawing per weather layer they contribute, each in a
 * container of its own, in the order they were contributed, inside the one container the view's Weather switch shows
 * and hides.
 *
 * The drawings are asked to draw only when what they draw from may have changed: the map opened or was swapped, the
 * graphics card gave the context back, the sky changed, or an edit touched anything but the tiles. Tile edits are what a
 * brush stroke makes, many times a second, and nothing a module's weather is drawn from reads them. However many changes
 * arrive before a frame, the drawings draw once in it, and not at all while the layer is hidden: they catch up when it
 * shows.
 *
 * In every other frame the layer shows, each drawing is handed the clock to move on to, and the frame has something new
 * to show only when one of them changed. While the layer is hidden nothing is ticked at all, so the weather holds where it
 * was until the switch is back on.
 */
class WeatherLayers
{
  /**
   * The weather layer: every drawing's container, shown and hidden as one.
   */
  readonly layer = new Container();

  #tileSize: number;

  #entries: WeatherEntry[] = [];

  #stale = true;

  /**
   * @param {number} tileSize The tile size the drawings draw at.
   */
  constructor(tileSize: number)
  {
    this.#tileSize = tileSize;
  }

  /**
   * Chooses what draws: a drawing is made for each weather layer not drawing yet, kept for each still wanted, and let go
   * for each no longer wanted. A new drawing draws in the next frame.
   * @param {readonly WeatherLayerDefinition[]} definitions The weather layers the active modules contribute.
   */
  setDefinitions(definitions: readonly WeatherLayerDefinition[]): void
  {
    const kept = this.#entries.filter(entry => definitions.includes(entry.definition));
    this.#entries.filter(entry => kept.includes(entry) === false).forEach(entry => this.#letGo(entry));

    const made: WeatherEntry[] = [];
    this.#entries = definitions.map(definition =>
    {
      const known = kept.find(entry => entry.definition === definition);
      if (known !== undefined)
      {
        return known;
      }

      const entry = this.#entryFor(definition);
      made.push(entry);
      return entry;
    });

    // the containers follow the order the modules contributed in.
    this.#entries.forEach((entry, index) => this.layer.setChildIndex(entry.root, index));
    this.#stale ||= made.length > 0;
  }

  /**
   * Makes every drawing afresh, as though the view had just been opened on the map: the weather starts over, settled as
   * the game settles it when the player arrives. The parity check asks for it once it has the view where the game's
   * screen is.
   */
  reset(): void
  {
    this.#entries = this.#entries.map(entry =>
    {
      this.#letGo(entry);
      return this.#entryFor(entry.definition);
    });
    this.#entries.forEach((entry, index) => this.layer.setChildIndex(entry.root, index));
    this.#stale = true;
  }

  /**
   * Marks every drawing as due to draw, for a map just opened or swapped, a context just given back, or a sky that
   * changed.
   */
  markStale(): void
  {
    this.#stale = true;
  }

  /**
   * Hears what a change to the map asks of the renderer, and marks the drawings due to draw unless it changed only tiles.
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
   * @param {WeatherFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when any drawing drew or moved, so the frame has something new to show.
   */
  draw(frame: WeatherFrame): boolean
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

    // between draws, the weather moves on with the clock.
    return this.#entries.reduce((moved, entry) => this.#tickEntry(entry, frame) || moved, false);
  }

  /**
   * Says what every drawing shows, as each describes itself, in the order they draw; a drawing with nothing to say
   * gives null.
   * @returns {JsonValue[]} What each shows.
   */
  describe(): JsonValue[]
  {
    return this.#entries.map(entry => (entry.drawing.describe === undefined ? null : entry.drawing.describe()));
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
   * Makes one weather layer's drawing, in a container of its own at the top of the layer.
   * @param {WeatherLayerDefinition} definition The weather layer.
   * @returns {WeatherEntry} Its entry, holding the drawing.
   */
  #entryFor(definition: WeatherLayerDefinition): WeatherEntry
  {
    const root = new Container();
    this.layer.addChild(root);
    const drawing = definition.create({ layer: root, tileSize: this.#tileSize });
    return { definition, root, drawing, ticking: false };
  }

  /**
   * Lets one drawing go, container and all.
   * @param {WeatherEntry} entry The drawing.
   */
  #letGo(entry: WeatherEntry): void
  {
    entry.drawing.destroy();
    entry.root.destroy({ children: true });
  }

  /**
   * Hands one drawing the clock, unless it failed since it last drew.
   * @param {WeatherEntry} entry The drawing.
   * @param {WeatherFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when it changed what it shows.
   */
  #tickEntry(entry: WeatherEntry, frame: WeatherFrame): boolean
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

export { WeatherLayers };

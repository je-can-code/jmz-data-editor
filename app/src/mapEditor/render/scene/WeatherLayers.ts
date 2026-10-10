import { Container, Graphics } from 'pixi.js';
import type { JsonValue } from '../../core/model/json.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
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
 * Everything plugin modules draw into a view's weather layer: one drawing per weather layer they contribute that draws on
 * the map the view shows, each in a container of its own, in the order they were contributed, inside the one container
 * the view's Weather switch shows and hides, clipped to the map's own rectangle.
 *
 * Weather costs a map that has none nothing at all. A drawing is made only once a module says its weather layer draws on
 * the map shown, and let go again once the view shows a map it draws nothing on. While the layer holds no drawing it is
 * left out of every frame, clip and all, and the view hands it no frames; the clip is drawn only once there is weather
 * to clip.
 *
 * Whether each weather layer draws on the map is asked, and the drawings drawn, only when what they draw from may have
 * changed: the map opened or was swapped, the graphics card gave the context back, the sky changed, or an edit touched
 * anything but the tiles. Tile edits are what a brush stroke makes, many times a second, and nothing a module's weather
 * is drawn from reads them. However many changes arrive before a frame, this happens once in it, and not at all while
 * the layer is hidden: it catches up when it shows.
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

  /**
   * The map's own rectangle, which the layer is clipped to, so nothing of the weather falls on the editor around the map.
   * It goes in the scene beside the layer, so it moves and scales with the world; as a mask it is never drawn itself.
   */
  readonly clip = new Graphics();

  #tileSize: number;

  #definitions: readonly WeatherLayerDefinition[] = [];

  #entries: WeatherEntry[] = [];

  #stale = true;

  /**
   * The map size, in tiles, the clip was last drawn at; nothing until there is weather to clip.
   */
  #clipped = { width: 0, height: 0 };

  /**
   * @param {number} tileSize The tile size the drawings draw at.
   */
  constructor(tileSize: number)
  {
    this.#tileSize = tileSize;

    // the layer is left out of every frame until it holds a drawing, and clipped from its first. The clip is never drawn
    // or measured as part of the scene, as pixi treats any mask, even before it becomes one.
    this.layer.renderable = false;
    this.clip.includeInBuild = false;
    this.clip.measurable = false;
  }

  /**
   * Says whether the view should hand the layer its frame: while it shows, and either holds a drawing or is due to ask
   * which weather layers draw on the map. Otherwise the frame skips it altogether.
   * @returns {boolean} True when the layer wants the frame.
   */
  get needsFrame(): boolean
  {
    return this.layer.visible && (this.#stale || this.#entries.length > 0);
  }

  /**
   * Chooses what may draw: a drawing is kept for each weather layer still wanted and let go for each no longer wanted,
   * and each weather layer left without a drawing, such as one new to the view, is asked in the next frame whether it
   * draws on the map.
   * @param {readonly WeatherLayerDefinition[]} definitions The weather layers the active modules contribute.
   * @returns {boolean} True when a drawing was let go, so the view shows less than it did.
   */
  setDefinitions(definitions: readonly WeatherLayerDefinition[]): boolean
  {
    const before = this.#entries.length;
    this.#definitions = definitions;
    this.#keep(definitions.flatMap(definition => this.#entries.filter(entry => entry.definition === definition)));
    this.#stale ||= definitions.some(definition => this.#entries.every(entry => entry.definition !== definition));
    return this.#entries.length < before;
  }

  /**
   * Lets every drawing go, as though the view had just been opened on the map: each weather layer that draws on it is
   * made afresh in the next frame, and settles as the game settles its weather when the player arrives. The parity check
   * asks for it once it has the view where the game's screen is.
   */
  reset(): void
  {
    this.#keep([]);
    this.#stale = true;
  }

  /**
   * Marks the layer as due to ask which weather layers draw on the map and to draw them, for a map just opened or
   * swapped, a context just given back, or a sky that changed.
   */
  markStale(): void
  {
    this.#stale = true;
  }

  /**
   * Hears what a change to the map asks of the renderer, and marks the layer due unless the change touched only tiles.
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
   * Brings the weather up to the frame while the layer shows: when due, makes a drawing for each weather layer that draws
   * on the map and lets go of each that no longer does, then asks each drawing to draw; otherwise hands each the clock
   * to move on to. A drawing, or a module's answer, that throws is left out, its error raised on its own, so it is seen
   * without stopping the map or the other drawings; a drawing that throws is not ticked again until it next draws, so a
   * fault in moving on is raised once rather than every frame.
   * @param {WeatherFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when any drawing was made, let go, drawn or moved, so the frame has something new to show.
   */
  draw(frame: WeatherFrame): boolean
  {
    if (this.layer.visible === false)
    {
      return false;
    }

    if (this.#stale)
    {
      this.#stale = false;
      const before = this.#entries.length;
      this.#choose(frame);
      this.#entries.forEach(entry =>
      {
        entry.ticking = this.#attempt(() => entry.drawing.draw(frame));
      });
      return before > 0 || this.#entries.length > 0;
    }

    // between draws, the weather moves on with the clock.
    return this.#entries.reduce((moved, entry) => this.#tickEntry(entry, frame) || moved, false);
  }

  /**
   * Says what every drawing shows, as each describes itself, in the order they draw; a drawing with nothing to say
   * gives null. A map without weather has no drawings, so nothing is said.
   * @returns {JsonValue[]} What each shows.
   */
  describe(): JsonValue[]
  {
    return this.#entries.map(entry => (entry.drawing.describe === undefined ? null : entry.drawing.describe()));
  }

  /**
   * How many drawings there are: one for each weather layer drawing on the map shown.
   * @returns {number} The count.
   */
  get count(): number
  {
    return this.#entries.length;
  }

  /**
   * Lets every drawing go, and the layer and its clip with them.
   */
  destroy(): void
  {
    this.#entries.forEach(entry => entry.drawing.destroy());
    this.#entries = [];
    this.layer.destroy({ children: true });
    this.clip.destroy();
  }

  /**
   * Gives each weather layer that draws on the frame's map a drawing, made now if it had none, in the order the modules
   * contributed them, and lets go of each drawing whose weather layer draws nothing there; once there is weather to
   * clip, the layer is clipped, and the clip follows the map's size.
   * @param {WeatherFrame} frame The frame.
   */
  #choose(frame: WeatherFrame): void
  {
    const drawing = this.#definitions.filter(definition => this.#drawsOn(definition, frame));
    this.#keep(drawing.map(definition => this.#entries.find(entry => entry.definition === definition) ?? this.#entryFor(definition)));
    if (this.#entries.length > 0)
    {
      this.#clipTo(frame.document);
    }
  }

  /**
   * Asks a module whether its weather layer draws on the frame's map; one whose answer throws draws nothing, its error
   * raised on its own.
   * @param {WeatherLayerDefinition} definition The weather layer.
   * @param {WeatherFrame} frame The frame.
   * @returns {boolean} True when it draws there.
   */
  #drawsOn(definition: WeatherLayerDefinition, frame: WeatherFrame): boolean
  {
    let draws = false;
    this.#attempt(() =>
    {
      draws = definition.drawsOn(frame);
    });
    return draws;
  }

  /**
   * Keeps exactly these drawings, in this order, letting go of every other, and leaves the layer out of the frames while
   * it holds none.
   * @param {WeatherEntry[]} entries The drawings to keep.
   */
  #keep(entries: WeatherEntry[]): void
  {
    this.#entries.filter(entry => entries.includes(entry) === false).forEach(entry => this.#letGo(entry));
    this.#entries = entries;

    // the containers follow the order the modules contributed in.
    entries.forEach((entry, index) => this.layer.setChildIndex(entry.root, index));
    this.layer.renderable = entries.length > 0;
  }

  /**
   * Draws the clip as the map's own rectangle, unless it already is one of this size, and clips the layer by it the
   * first time there is weather to clip; until then no mask is made at all.
   * @param {MapDocument} document The map.
   */
  #clipTo(document: MapDocument): void
  {
    if (this.layer.mask !== this.clip)
    {
      this.layer.mask = this.clip;
    }

    const { width, height } = document;
    if (width === this.#clipped.width && height === this.#clipped.height)
    {
      return;
    }

    this.#clipped = { width, height };
    this.clip.clear().rect(0, 0, width * this.#tileSize, height * this.#tileSize).fill(0xffffff);
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
   * Runs one part of a frame a module wrote, raising anything it throws on its own, after the frame, rather than letting
   * it stop the frame.
   * @param {() => void} part The module's part.
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

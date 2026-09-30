import { Container, Graphics, Text } from 'pixi.js';
import type {
  OverlayContext,
  OverlayDefinition,
  OverlayId,
  OverlayPainter,
  OverlayStyle,
} from '../../core/renderer/MapRenderer.ts';

/**
 * One module overlay's drawing: its shapes, and the labels it has used so far, kept for reuse.
 */
type OverlayEntry = {
  readonly definition: OverlayDefinition;
  readonly root: Container;
  readonly graphics: Graphics;
  readonly labels: Text[];
  used: number;
};

/**
 * Draws one module overlay's shapes onto pixi graphics, in world pixels. A stroke without a width is one screen
 * pixel at every zoom.
 */
class GraphicsPainter implements OverlayPainter
{
  #entry: OverlayEntry;

  /**
   * @param {OverlayEntry} entry The overlay being drawn.
   */
  constructor(entry: OverlayEntry)
  {
    this.#entry = entry;
  }

  circle(x: number, y: number, radius: number, style: OverlayStyle): void
  {
    this.#entry.graphics.circle(x, y, radius);
    this.#finish(style);
  }

  rect(x: number, y: number, width: number, height: number, style: OverlayStyle): void
  {
    this.#entry.graphics.rect(x, y, width, height);
    this.#finish(style);
  }

  line(x1: number, y1: number, x2: number, y2: number, style: OverlayStyle): void
  {
    this.#entry.graphics.moveTo(x1, y1).lineTo(x2, y2);
    this.#stroke(style);
  }

  text(x: number, y: number, text: string, style: OverlayStyle): void
  {
    const entry = this.#entry;
    let label = entry.labels[entry.used];
    if (label === undefined)
    {
      label = new Text({ text, style: { fontFamily: 'sans-serif', fontSize: 14, fill: 0xffffff } });
      entry.labels.push(label);
      entry.root.addChild(label);
    }

    label.text = text;
    label.style.fill = style.fill ?? 0xffffff;
    label.alpha = style.fillAlpha ?? 1;
    label.position.set(x, y);
    label.visible = true;
    entry.used += 1;
  }

  /**
   * Fills and strokes the shape just drawn, as its style asks.
   * @param {OverlayStyle} style The style.
   */
  #finish(style: OverlayStyle): void
  {
    if (style.fill !== undefined)
    {
      this.#entry.graphics.fill({ color: style.fill, alpha: style.fillAlpha ?? 1 });
    }

    this.#stroke(style);
  }

  /**
   * Strokes the shape just drawn, when its style has a stroke.
   * @param {OverlayStyle} style The style.
   */
  #stroke(style: OverlayStyle): void
  {
    if (style.stroke === undefined)
    {
      return;
    }

    const width = style.strokeWidth;
    this.#entry.graphics.stroke(width === undefined
      ? { color: style.stroke, alpha: style.strokeAlpha ?? 1, width: 1, pixelLine: true }
      : { color: style.stroke, alpha: style.strokeAlpha ?? 1, width });
  }
}

/**
 * The overlays plugin modules contribute, such as sight rings and light radii. Each draws through a painter that
 * knows nothing of pixi, and redraws only when asked: when the map, the selection or the enabled set changes, or when
 * a module asks for it because something the renderer cannot see moved, such as the clock.
 */
class ModuleOverlays
{
  /**
   * Every module overlay's drawing, in the order the modules contributed them.
   */
  readonly layer = new Container();

  #entries = new Map<OverlayId, OverlayEntry>();

  /**
   * Chooses which module overlays draw.
   * @param {readonly OverlayDefinition[]} definitions The overlays the modules contributed.
   * @param {ReadonlySet<OverlayId>} enabled The overlays switched on.
   */
  setDefinitions(definitions: readonly OverlayDefinition[], enabled: ReadonlySet<OverlayId>): void
  {
    const wanted = new Map(definitions.filter(definition => enabled.has(definition.id)).map(definition => [ definition.id, definition ]));
    this.#entries.forEach((entry, id) =>
    {
      if (wanted.get(id) !== entry.definition)
      {
        entry.root.destroy({ children: true });
        this.#entries.delete(id);
      }
    });

    wanted.forEach((definition, id) =>
    {
      if (this.#entries.has(id) === false)
      {
        const root = new Container();
        const graphics = new Graphics();
        root.addChild(graphics);
        this.layer.addChild(root);
        this.#entries.set(id, { definition, root, graphics, labels: [], used: 0 });
      }
    });
  }

  /**
   * Redraws every enabled module overlay. One that throws is left empty, and its error is raised on its own so it is
   * seen without stopping the map from drawing.
   * @param {OverlayContext} context What the overlays may read.
   */
  redraw(context: OverlayContext): void
  {
    this.#entries.forEach(entry =>
    {
      entry.graphics.clear();
      entry.used = 0;
      try
      {
        entry.definition.draw(new GraphicsPainter(entry), context);
      }
      catch (error)
      {
        entry.graphics.clear();
        entry.used = 0;
        queueMicrotask(() =>
        {
          throw error;
        });
      }

      // labels the overlay no longer uses stay for next time, hidden.
      entry.labels.slice(entry.used).forEach(label =>
      {
        label.visible = false;
      });
    });
  }

  /**
   * How many module overlays draw.
   * @returns {number} The count.
   */
  get count(): number
  {
    return this.#entries.size;
  }

  /**
   * Lets go of every drawing.
   */
  destroy(): void
  {
    this.layer.destroy({ children: true });
    this.#entries.clear();
  }
}

export { GraphicsPainter, ModuleOverlays };

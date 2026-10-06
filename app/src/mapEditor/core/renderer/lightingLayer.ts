import type { Container, Renderer } from 'pixi.js';
import type { MapDocument } from '../model/MapDocument.ts';

/**
 * Where a module's lighting draws in one map view: a container of its own inside the view's lighting layer, which
 * sits over the map and its events and under the editor's overlays, and shows only while the view's Lighting switch
 * is on. Its units are world pixels: the map's top-left corner is 0, 0 and a tile is {@link tileSize} across.
 */
type LightingStage = {
  readonly layer: Container;
  readonly tileSize: number;
};

/**
 * The view's clock, as one frame reads it: the engine frame it is on, and whether the game look moves at all.
 */
type LightingClock = {
  /**
   * Whole engine frames, sixty a second, as the game's Graphics.frameCount counts them: what a light's effect runs on.
   * It follows the page's own clock, so it never starts over: a map opened again, redrawn or panned carries on from the
   * frame it was on. While the view holds its animation still at a moment, as the parity check holds it, this stays on
   * that moment's frame.
   */
  readonly frames: number;

  /**
   * Whether the game look moves: false while the view's Animate switch is off, when everything shows as it does with no
   * animation running, every light at its full strength.
   */
  readonly animating: boolean;
};

/**
 * What a lighting drawing is handed each time it is asked to draw or to move on: the map as it now stands, the view's
 * pixi renderer, for anything drawn into a render texture first, such as a map's darkness with light cut out of it,
 * which GPU context the view draws on, and the view's clock.
 */
type LightingFrame = {
  readonly document: MapDocument;
  readonly renderer: Renderer;

  /**
   * The view's GPU contexts, counted from 1: it goes up each time the graphics card gives the view its context back, and
   * a render texture drawn on an earlier one has lost its pixels, so whatever was drawn into it must be drawn again.
   */
  readonly context: number;

  /**
   * The view's clock as this frame reads it.
   */
  readonly clock: LightingClock;
};

/**
 * One module's lighting in one map view, made of plain pixi display objects it adds to its stage's container.
 *
 * The view asks it to draw in the frame after the map opened, after anything on the map but its tiles changed (an
 * edit, a move, an undo, a copy from another window, a change to the file on disk), and after the graphics card gave
 * the view's context back, which takes any render texture's pixels with it, as the frame's context says; however many
 * changes arrive before that frame, it draws once. A brush stroke changes only tiles, so it never asks. While the
 * Lighting switch is off it is not asked at all, and draws once the switch is back on. What it does with each ask is
 * its own business: it may well find nothing it draws has changed, and keep what it has.
 *
 * In every other frame the view shows the lighting, it hands the drawing the clock instead, through {@link tick}: that is
 * where anything that moves between edits moves, such as a torch guttering, and where a drawing reading anything the map
 * does not hold, such as a clock's hour, draws again once that changes. A view behind another tab, a closed one, or one
 * with its Lighting switch off hands out no ticks at all.
 */
interface LightingDrawing
{
  /**
   * Draws for the map as it now stands, at the frame's clock.
   * @param {LightingFrame} frame The map, the renderer and the clock.
   */
  draw(frame: LightingFrame): void;

  /**
   * Moves on to the frame's clock, in a frame that did not ask it to draw: once a frame, on the same map it last drew,
   * on the same context. It does only what the clock moved, and may draw anything at all again, the whole of itself
   * included, for a change the map does not show. A drawing nothing of which moves with time answers false at once.
   * @param {LightingFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when it changed what it shows, so the frame has something new to show.
   */
  tick(frame: LightingFrame): boolean;

  /**
   * Lets go of everything it made, for a view closing or a module switching off.
   */
  destroy(): void;
}

/**
 * Something a plugin module draws into every map view's lighting layer, such as J-Lighting's light rings: an id
 * named after its module, what the editor calls it, and how to make its drawing for one view.
 */
type LightingLayerDefinition = {
  readonly id: `${string}.${string}`;
  readonly title: string;

  /**
   * Whether it draws what the game itself shows, such as a map's darkness and the light cut through it, rather than an
   * aid for the author, such as a ring marking how far a light reaches. The parity check draws only what the game
   * shows. Left out, it is an aid.
   */
  readonly shownInGame?: boolean;

  /**
   * Makes the drawing for one map view, once per view.
   * @param {LightingStage} stage Where it draws.
   * @returns {LightingDrawing} The drawing.
   */
  readonly create: (stage: LightingStage) => LightingDrawing;
};

export type { LightingClock, LightingDrawing, LightingFrame, LightingLayerDefinition, LightingStage };

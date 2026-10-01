import type { LayerChoice } from '../tiles/layering.ts';

/**
 * What a brush paints: tiles on the four tile layers, region ids, or shadow quarters.
 */
type BrushKind = 'tiles' | 'regions' | 'shadows';

/**
 * What the palette hands the painting tools: a rectangle of values and what they are.
 *
 * - {@code kind} says what the values mean: tile ids for {@code 'tiles'} (an autotile in its shape 0, which painting
 *   shapes to its neighbours; 0 is B's empty tile, which clears layers 3 and 4), region ids 0 to 255 for
 *   {@code 'regions'} (0 clears a region). A {@code 'shadows'} brush holds no values: the shadow pen marks whichever
 *   quarter of a tile the pointer is over.
 * - {@code tilesetId} names the tileset the tile ids belong to; a tile id means another picture on another tileset.
 * - {@code width} and {@code height} are the rectangle's size in cells, and {@code cells} holds its values row by row,
 *   top row first, so the value for column {@code x} and row {@code y} is {@code cells[y * width + x]}.
 *
 * A brush with no cells ({@link EMPTY_BRUSH}) paints nothing: it is what the palette hands out before anything has
 * been chosen.
 */
type PaletteBrush = {
  readonly kind: BrushKind;
  readonly tilesetId: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly number[];
};

/**
 * The brush before anything is chosen: no cells, so it paints nothing.
 */
const EMPTY_BRUSH: PaletteBrush = { kind: 'tiles', tilesetId: 0, width: 0, height: 0, cells: [] };

/**
 * Builds the brush the palette's shadow pen hands out: one cell, holding no value, since the pen marks whichever
 * quarter of a tile the pointer is over.
 * @param {number} tilesetId The tileset on show.
 * @returns {PaletteBrush} The brush.
 */
const shadowBrush = (tilesetId: number): PaletteBrush =>
{
  return { kind: 'shadows', tilesetId, width: 1, height: 1, cells: [] };
};

/**
 * Reports whether two brushes paint the same thing.
 * @param {PaletteBrush} left One brush.
 * @param {PaletteBrush} right The other.
 * @returns {boolean} True when kind, tileset, size and every value match.
 */
const sameBrush = (left: PaletteBrush, right: PaletteBrush): boolean =>
{
  return left.kind === right.kind
    && left.tilesetId === right.tilesetId
    && left.width === right.width
    && left.height === right.height
    && left.cells.length === right.cells.length
    && left.cells.every((value, index) => value === right.cells[index]);
};

/**
 * The layer strip, in the order it shows: automatic layering, then layers 1 to 4 (0 to 3 as the tile services number
 * them).
 */
const LAYER_STRIP: readonly LayerChoice[] = [ 'auto', 0, 1, 2, 3 ];

/**
 * Moves along the layer strip, stopping at its ends rather than wrapping, so a long scroll never jumps from layer 4
 * back to automatic layering.
 * @param {LayerChoice} current Where the strip stands.
 * @param {number} steps How far to move: positive towards layer 4, negative towards automatic.
 * @returns {LayerChoice} Where it lands.
 */
const stepLayerChoice = (current: LayerChoice, steps: number): LayerChoice =>
{
  const index = Math.max(0, LAYER_STRIP.indexOf(current));
  const next = Math.min(LAYER_STRIP.length - 1, Math.max(0, index + Math.trunc(steps)));
  return LAYER_STRIP[next];
};

/**
 * How far the wheel must turn, in pixels, to move the strip one step. Every mouse wheel's notch reaches it in one event
 * (browsers report a notch as anything from 48 to 120 pixels), and a touchpad's small movements add up to it.
 */
const WHEEL_STEP_PIXELS = 40;

/**
 * Turns wheel movement into steps along the layer strip: one step per notch, however many pixels the browser calls a
 * notch, and one step each time a touchpad's small movements add up to a notch. Turning back the other way starts
 * afresh. Holding Shift turns a vertical wheel sideways in some browsers, so sideways movement counts when there is no
 * vertical movement.
 */
class WheelStepper
{
  #gathered = 0;

  /**
   * Takes one wheel event's movement.
   * @param {number} deltaY Its movement down.
   * @param {number} deltaX Its movement across.
   * @param {number} deltaMode What it counts: 0 pixels, 1 lines, 2 pages.
   * @returns {number} The step it makes: 1 down the strip, -1 up it, 0 while still gathering.
   */
  step(deltaY: number, deltaX: number, deltaMode: number): number
  {
    const delta = deltaY === 0
      ? deltaX
      : deltaY;
    const scale = [ 1, 16, 400 ][deltaMode] ?? 1;
    const pixels = delta * scale;
    if (pixels === 0)
    {
      return 0;
    }

    // turning back the other way drops whatever was gathered the first way.
    if (Math.sign(pixels) !== Math.sign(this.#gathered))
    {
      this.#gathered = 0;
    }

    this.#gathered += pixels;
    if (Math.abs(this.#gathered) < WHEEL_STEP_PIXELS)
    {
      return 0;
    }

    // a notch, or a touchpad's movements adding up to one, is one step, and nothing carries over into the next.
    this.#gathered = 0;
    return Math.sign(pixels);
  }
}

/**
 * What the palette and the layer strip have chosen: the brush, and where it paints.
 */
type PaintSelectionState = {
  readonly brush: PaletteBrush;
  readonly layer: LayerChoice;
};

/**
 * Hears every change to the selection.
 */
type PaintSelectionListener = (state: PaintSelectionState) => void;

/**
 * The palette's and the layer strip's output, in one place: the brush the palette has chosen, and the layer the strip
 * has chosen. The painting tools read it and subscribe to it; nothing here paints. Each window has its own, in its
 * paint (see WindowPaint), so a palette torn out with its map picks for that map's window alone.
 *
 * {@code layer} is exactly what the layering service's {@code paintTiles} takes: {@code 'auto'} for automatic
 * layering, or 0 to 3 for layers 1 to 4. Every change replaces the state object, so a listener or a React hook can
 * tell a change by identity.
 *
 * <pre>
 * const stop = selection.subscribe(({ brush, layer }) => { ... });
 * selection.setLayer(2);
 * </pre>
 */
class PaintSelection
{
  #state: PaintSelectionState = { brush: EMPTY_BRUSH, layer: 'auto' };

  #listeners = new Set<PaintSelectionListener>();

  /**
   * Reads the whole selection.
   * @returns {PaintSelectionState} The state; replaced, never changed, on every update.
   */
  getState = (): PaintSelectionState =>
  {
    return this.#state;
  };

  /**
   * The brush the palette has chosen.
   * @returns {PaletteBrush} The brush; {@link EMPTY_BRUSH} before anything is chosen.
   */
  get brush(): PaletteBrush
  {
    return this.#state.brush;
  }

  /**
   * The layer the strip has chosen.
   * @returns {LayerChoice} {@code 'auto'}, or a tile layer 0 to 3.
   */
  get layer(): LayerChoice
  {
    return this.#state.layer;
  }

  /**
   * Chooses the brush. A brush that paints what the current one paints changes nothing and tells no one.
   * @param {PaletteBrush} brush The brush.
   */
  setBrush(brush: PaletteBrush): void
  {
    if (sameBrush(brush, this.#state.brush) === false)
    {
      this.#update({ ...this.#state, brush });
    }
  }

  /**
   * Chooses the layer. Choosing the layer already chosen tells no one.
   * @param {LayerChoice} layer {@code 'auto'}, or a tile layer 0 to 3.
   */
  setLayer(layer: LayerChoice): void
  {
    if (layer !== this.#state.layer)
    {
      this.#update({ ...this.#state, layer });
    }
  }

  /**
   * Moves the layer along the strip, as Shift and the wheel do; see {@link stepLayerChoice}.
   * @param {number} steps How far: positive towards layer 4, negative towards automatic.
   */
  stepLayer(steps: number): void
  {
    this.setLayer(stepLayerChoice(this.#state.layer, steps));
  }

  /**
   * Listens for changes to the brush or the layer.
   * @param {PaintSelectionListener} listener Called with the new state after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: PaintSelectionListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Replaces the state and tells every listener.
   * @param {PaintSelectionState} state The new state.
   */
  #update(state: PaintSelectionState): void
  {
    this.#state = state;
    [ ...this.#listeners ].forEach(listener => listener(state));
  }
}

export {
  EMPTY_BRUSH,
  LAYER_STRIP,
  PaintSelection,
  sameBrush,
  shadowBrush,
  stepLayerChoice,
  WHEEL_STEP_PIXELS,
  WheelStepper,
};
export type { BrushKind, PaintSelectionListener, PaintSelectionState, PaletteBrush };

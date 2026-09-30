import { isMarkedTile, type TilesetMarks } from '../tiles/tilesetMarks.ts';
import type { CellStack, StackLayer } from './cellStack.ts';
import { FlagBit, PASSAGE_DIRECTIONS } from './tileFlags.ts';

/**
 * One chip the stack view shows on a layer: its words, and whether it names what the cell itself comes to.
 */
type LayerChip = {
  readonly label: string;
  readonly strong: boolean;
};

/**
 * Lists what a layer's own tile carries, as the stack view's chips: whether it decides passage, draws above
 * characters, is a ladder, bush, counter or damage floor, carries a terrain tag (and whether that tag is the cell's or
 * covered by one higher up), and goes on top. An empty layer carries nothing.
 * @param {StackLayer} layer The layer.
 * @param {TilesetMarks | null} marks The tileset's marks, when read.
 * @returns {LayerChip[]} The chips, in that order; strong ones are what the cell's passage and terrain come from.
 */
const layerChips = (layer: StackLayer, marks: TilesetMarks | null): LayerChip[] =>
{
  const { flags, tileId, terrainTag, decidesTerrain } = layer;
  if (tileId === 0)
  {
    return [];
  }

  const chips = [
    { label: 'Decides passage', strong: true, on: layer.passage === 'decides' },
    { label: 'Above characters', strong: false, on: (flags & FlagBit.star) !== 0 },
    { label: 'Ladder', strong: false, on: (flags & FlagBit.ladder) !== 0 },
    { label: 'Bush', strong: false, on: (flags & FlagBit.bush) !== 0 },
    { label: 'Counter', strong: false, on: (flags & FlagBit.counter) !== 0 },
    { label: 'Damage floor', strong: false, on: (flags & FlagBit.damage) !== 0 },
    { label: decidesTerrain ? `Terrain tag ${terrainTag}` : `Terrain tag ${terrainTag}, covered`, strong: decidesTerrain, on: terrainTag > 0 },
    { label: 'Goes on top', strong: false, on: marks !== null && isMarkedTile(marks, tileId) },
  ];

  return chips.filter(chip => chip.on).map(({ label, strong }) => ({ label, strong }));
};

/**
 * Says which ways out of a cell are blocked, as the stack view reads it out.
 * @param {number} blocked The blocked ways out, as passage bits (1 down, 2 left, 4 right, 8 up).
 * @returns {string} The sentence.
 */
const passageSummary = (blocked: number): string =>
{
  if ((blocked & 0x0f) === 0)
  {
    return 'Passable every way.';
  }

  if ((blocked & 0x0f) === 0x0f)
  {
    return 'Blocked every way.';
  }

  const ways = PASSAGE_DIRECTIONS.filter(({ bit }) => (blocked & bit) !== 0).map(({ direction }) => direction);
  return `Blocked ${ways.join(', ')}.`;
};

/**
 * Says what else a cell counts as, besides its passage: a ladder, a bush, a counter, a damage floor, and its terrain
 * tag, each as the engine reads it from the cell's layers.
 * @param {CellStack} stack The cell.
 * @returns {string} The sentence, or an empty string when it counts as none of them.
 */
const cellFlagsSummary = (stack: CellStack): string =>
{
  const parts = [
    stack.ladder ? 'a ladder' : '',
    stack.bush ? 'a bush' : '',
    stack.counter ? 'a counter' : '',
    stack.damage ? 'a damage floor' : '',
    stack.terrainTag > 0 ? `terrain tag ${stack.terrainTag}` : '',
  ].filter(part => part !== '');

  return parts.length === 0
    ? ''
    : `Counts as ${parts.join(', ')}.`;
};

/**
 * Says which quarters of a cell are shaded.
 * @param {number} shadow The cell's shadow bits (1 top left, 2 top right, 4 bottom left, 8 bottom right).
 * @returns {string} The words.
 */
const shadowSummary = (shadow: number): string =>
{
  const quarters = [ 'top left', 'top right', 'bottom left', 'bottom right' ].filter((_, index) => (shadow & (1 << index)) !== 0);
  if (quarters.length === 0)
  {
    return 'No shadow';
  }

  return quarters.length === 4
    ? 'Shadow over the whole cell'
    : `Shadow at ${quarters.join(', ')}`;
};

export { cellFlagsSummary, layerChips, passageSummary, shadowSummary };
export type { LayerChip };

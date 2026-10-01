import { MOVE_FREQUENCIES, MOVE_SPEEDS } from '../commands/editors/moveRoute.ts';
import type { NameLookup } from '../commands/sentence.ts';
import { PRIORITY_OPTIONS, TRIGGER_OPTIONS } from '../eventKinds/pageFields.ts';
import type { RmmzEventImage, RmmzEventPage } from '../model/rmmzTypes.ts';
import { describePageConditions } from './pageConditions.ts';
import type { PageMovement } from './pageSettings.ts';

/**
 * How a page moves on its own, as MZ names it.
 */
const MOVE_TYPE_LABELS: readonly string[] = [ 'Fixed', 'Random', 'Approach', 'Custom' ];

/**
 * The ways a picture can face, as the window words them.
 */
const FACING_WORDS: Readonly<Record<number, string>> = { 2: 'down', 4: 'left', 6: 'right', 8: 'up' };

/**
 * Finds an option's label by its value, or the bare value when no option names it.
 * @param {readonly { value: number, label: string }[]} options The options.
 * @param {number} value The value.
 * @returns {string} The label.
 */
const labelOf = (options: readonly { readonly value: number; readonly label: string }[], value: number): string =>
{
  return options.find(option => option.value === value)?.label ?? String(value);
};

/**
 * Words a page's picture: a tile, a sheet's character with its facing and frame, or nothing. A sheet whose name starts
 * with {@code $} holds one character, so which one is never said.
 * @param {RmmzEventImage} image The picture.
 * @returns {string} Such as "Actor1, character 3, facing down, frame 2" or "Tile 1546".
 */
const describeGraphic = (image: RmmzEventImage): string =>
{
  if (image.tileId > 0)
  {
    return `Tile ${image.tileId}`;
  }

  if (image.characterName === '')
  {
    return 'No graphic';
  }

  const facing = FACING_WORDS[image.direction] ?? `direction ${image.direction}`;
  const character = image.characterName.startsWith('$')
    ? ''
    : `, character ${image.characterIndex + 1}`;
  return `${image.characterName}${character}, facing ${facing}, frame ${image.pattern + 1}`;
};

/**
 * Words a page's movement: its type, speed and frequency, and for a custom route how many steps it takes and whether it
 * repeats.
 * @param {PageMovement} movement The movement.
 * @returns {string[]} One line for the type, speed and frequency, and one more for a custom route.
 */
const describeMovement = (movement: PageMovement): string[] =>
{
  const type = MOVE_TYPE_LABELS[movement.type] ?? `Type ${movement.type}`;
  const lines = [ `${type}, speed ${labelOf(MOVE_SPEEDS, movement.speed)}, frequency ${labelOf(MOVE_FREQUENCIES, movement.frequency)}` ];
  if (movement.type === 3)
  {
    // the route's closing end is not a step.
    const steps = Math.max(movement.route.list.length - 1, 0);
    lines.push(`${steps} ${steps === 1 ? 'step' : 'steps'}${movement.route.repeat ? ', repeating' : ''}`);
  }

  return lines;
};

/**
 * Words what a page waits for and how it starts, for its tab: what its conditions ask, or that it always applies, then
 * its trigger and priority.
 * @param {RmmzEventPage} page The page.
 * @param {NameLookup} names Names ids; ids read as numbers without a name.
 * @returns {string[]} The lines.
 */
const describePageTab = (page: RmmzEventPage, names: NameLookup): string[] =>
{
  const conditions = describePageConditions(page.conditions, names);
  return [
    ...(conditions.length === 0 ? [ 'No conditions' ] : conditions),
    `${labelOf(TRIGGER_OPTIONS, page.trigger)}, ${labelOf(PRIORITY_OPTIONS, page.priorityType).toLowerCase()}`,
  ];
};

export { describeGraphic, describeMovement, describePageTab, MOVE_TYPE_LABELS };

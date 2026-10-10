import type { JsonValue } from '../model/json.ts';
import type { RmmzMoveCommand } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';

/**
 * The four ways a character can face, as RMMZ numbers them: down, left, right, up.
 */
type Facing = 2 | 4 | 6 | 8;

/**
 * A character as a route moves it: the tile it stands on, the way it faces, and the two settings a route can change
 * that decide where its next step goes.
 */
type Walker = {
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly directionFix: boolean;
  readonly through: boolean;
};

/**
 * The map a route walks on: its size, whether it loops, and whether a step out of a tile in a direction is allowed by
 * the tiles there, as Game_Map#isPassable answers it.
 */
type WalkMap = {
  readonly width: number;
  readonly height: number;
  readonly loopsX: boolean;
  readonly loopsY: boolean;

  /**
   * Answers whether a step out of a tile in a direction is allowed by the tiles there.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {Facing} direction The direction.
   * @returns {boolean} True when allowed.
   */
  isPassable(x: number, y: number, direction: Facing): boolean;
};

/**
 * What one step of a route did:
 * - {@code move}: a walk to the next tile, or an attempt at one that the map refused ({@code blocked} names the tile);
 * - {@code jump}: a leap, which walls never stop;
 * - {@code turn}: a change of facing alone;
 * - {@code guess}: a step that depends on the dice or on where the player is, which the editor cannot know, so the
 *   walker is taken to stay where it was;
 * - {@code other}: a wait or a setting, which leaves the walker where it stands.
 */
type WalkStep = {
  readonly index: number;
  readonly kind: 'move' | 'jump' | 'turn' | 'guess' | 'other';
  readonly from: MapCell;
  readonly to: MapCell;
  readonly facing: Facing;
  readonly blocked: MapCell | null;
};

/**
 * A route walked: every step taken, in order, and the walker where it ends. A blocked step on a route that does not
 * skip what it cannot do holds the route forever, as the engine retries it every frame, so the walk stops there and
 * says it is stuck.
 */
type RouteWalk = {
  readonly steps: readonly WalkStep[];
  readonly end: Walker;
  readonly stuck: boolean;
};

/**
 * The step codes RMMZ names, as Game_Character numbers them.
 */
const RouteCode = {
  moveDown: 1,
  moveLeft: 2,
  moveRight: 3,
  moveUp: 4,
  moveLowerLeft: 5,
  moveLowerRight: 6,
  moveUpperLeft: 7,
  moveUpperRight: 8,
  moveRandom: 9,
  moveToward: 10,
  moveAway: 11,
  moveForward: 12,
  moveBackward: 13,
  jump: 14,
  turnDown: 16,
  turnLeft: 17,
  turnRight: 18,
  turnUp: 19,
  turnRight90: 20,
  turnLeft90: 21,
  turn180: 22,
  turnRightOrLeft90: 23,
  turnRandom: 24,
  turnToward: 25,
  turnAway: 26,
  directionFixOn: 35,
  directionFixOff: 36,
  throughOn: 37,
  throughOff: 38,
} as const;

/**
 * The straight steps, by code: the direction each walks.
 */
const STRAIGHT_STEPS: ReadonlyMap<number, Facing> = new Map<number, Facing>([
  [ RouteCode.moveDown, 2 ],
  [ RouteCode.moveLeft, 4 ],
  [ RouteCode.moveRight, 6 ],
  [ RouteCode.moveUp, 8 ],
]);

/**
 * The diagonal steps, by code: the across and the up-or-down direction each combines.
 */
const DIAGONAL_STEPS: ReadonlyMap<number, readonly [ Facing, Facing ]> = new Map<number, readonly [ Facing, Facing ]>([
  [ RouteCode.moveLowerLeft, [ 4, 2 ] ],
  [ RouteCode.moveLowerRight, [ 6, 2 ] ],
  [ RouteCode.moveUpperLeft, [ 4, 8 ] ],
  [ RouteCode.moveUpperRight, [ 6, 8 ] ],
]);

/**
 * The turns to a fixed facing, by code.
 */
const FACING_TURNS: ReadonlyMap<number, Facing> = new Map<number, Facing>([
  [ RouteCode.turnDown, 2 ],
  [ RouteCode.turnLeft, 4 ],
  [ RouteCode.turnRight, 6 ],
  [ RouteCode.turnUp, 8 ],
]);

/**
 * Where a quarter turn right leaves each facing, as Game_Character#turnRight90 has it.
 */
const QUARTER_RIGHT: Readonly<Record<Facing, Facing>> = { 2: 4, 4: 8, 6: 2, 8: 6 };

/**
 * Where a quarter turn left leaves each facing, as Game_Character#turnLeft90 has it.
 */
const QUARTER_LEFT: Readonly<Record<Facing, Facing>> = { 2: 6, 4: 2, 6: 8, 8: 4 };

/**
 * The steps whose outcome turns on the dice or on the player: moving at random, toward or away from the player, and
 * every turn that is random or faces the player.
 */
const GUESSED_STEPS: ReadonlySet<number> = new Set<number>([
  RouteCode.moveRandom,
  RouteCode.moveToward,
  RouteCode.moveAway,
  RouteCode.turnRightOrLeft90,
  RouteCode.turnRandom,
  RouteCode.turnToward,
  RouteCode.turnAway,
]);

/**
 * The settings that change how the walker's later steps go, by code, and what each sets.
 */
const SETTINGS: ReadonlyMap<number, Partial<Walker>> = new Map<number, Partial<Walker>>([
  [ RouteCode.directionFixOn, { directionFix: true } ],
  [ RouteCode.directionFixOff, { directionFix: false } ],
  [ RouteCode.throughOn, { through: true } ],
  [ RouteCode.throughOff, { through: false } ],
]);

/**
 * Turns a facing around, as Game_CharacterBase#reverseDir.
 * @param {Facing} facing The facing.
 * @returns {Facing} The opposite facing.
 */
const reverse = (facing: Facing): Facing =>
{
  return (10 - facing) as Facing;
};

/**
 * Reads a whole number a step stores, or 0 for anything else.
 * @param {JsonValue | undefined} value The stored value.
 * @returns {number} The number.
 */
const wholeNumber = (value: JsonValue | undefined): number =>
{
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
};

/**
 * Finds the column a step in a direction reaches, wrapping around a map that loops across, as
 * Game_Map#roundXWithDirection.
 * @param {WalkMap} map The map.
 * @param {number} x The column.
 * @param {Facing} direction The direction.
 * @returns {number} The column reached.
 */
const columnAfter = (map: WalkMap, x: number, direction: Facing): number =>
{
  const next = x + (direction === 6 ? 1 : 0) - (direction === 4 ? 1 : 0);
  return map.loopsX ? ((next % map.width) + map.width) % map.width : next;
};

/**
 * Finds the row a step in a direction reaches, wrapping around a map that loops up and down, as
 * Game_Map#roundYWithDirection.
 * @param {WalkMap} map The map.
 * @param {number} y The row.
 * @param {Facing} direction The direction.
 * @returns {number} The row reached.
 */
const rowAfter = (map: WalkMap, y: number, direction: Facing): number =>
{
  const next = y + (direction === 2 ? 1 : 0) - (direction === 8 ? 1 : 0);
  return map.loopsY ? ((next % map.height) + map.height) % map.height : next;
};

/**
 * Reports whether a tile is on the map.
 * @param {WalkMap} map The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True when the map holds the tile.
 */
const isOnMap = (map: WalkMap, x: number, y: number): boolean =>
{
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
};

/**
 * Decides whether the walker may step from a tile in a direction, as Game_CharacterBase#canPass does with the tiles: a
 * step off the map never goes, a walker with Through goes anywhere on it, and anyone else needs both the way out of
 * this tile and the way into the next. Other characters standing in the way are not counted, since where they stand
 * by then is anyone's guess.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker.
 * @param {number} x The column it steps from.
 * @param {number} y The row it steps from.
 * @param {Facing} direction The direction.
 * @returns {boolean} True when the step goes.
 */
const canPass = (map: WalkMap, walker: Walker, x: number, y: number, direction: Facing): boolean =>
{
  const toX = columnAfter(map, x, direction);
  const toY = rowAfter(map, y, direction);
  if (isOnMap(map, toX, toY) === false)
  {
    return false;
  }

  return walker.through
    || (map.isPassable(x, y, direction) && map.isPassable(toX, toY, reverse(direction)));
};

/**
 * Decides whether the walker may step diagonally, as Game_CharacterBase#canPassDiagonally: either corner path will do.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker.
 * @param {Facing} across The direction across.
 * @param {Facing} upOrDown The direction up or down.
 * @returns {boolean} True when the step goes.
 */
const canPassDiagonally = (map: WalkMap, walker: Walker, across: Facing, upOrDown: Facing): boolean =>
{
  const { x, y } = walker;
  const sideX = columnAfter(map, x, across);
  const sideY = rowAfter(map, y, upOrDown);
  return (canPass(map, walker, x, y, upOrDown) && canPass(map, walker, x, sideY, across))
    || (canPass(map, walker, x, y, across) && canPass(map, walker, sideX, y, upOrDown));
};

/**
 * Faces the walker a way, unless its direction is fixed, as Game_CharacterBase#setDirection.
 * @param {Walker} walker The walker.
 * @param {Facing} facing The way to face.
 * @returns {Walker} The walker, facing that way when it may.
 */
const face = (walker: Walker, facing: Facing): Walker =>
{
  return walker.directionFix ? walker : { ...walker, facing };
};

/**
 * What a step did to the walker: where it is now, and the tile it could not enter, if any.
 */
type StepOutcome = {
  readonly walker: Walker;
  readonly blocked: MapCell | null;
};

/**
 * Walks one tile in a direction, as Game_CharacterBase#moveStraight: the walker turns that way whether or not the step
 * goes.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker.
 * @param {Facing} direction The direction.
 * @returns {StepOutcome} Where it is now, and the tile it could not enter when the step failed.
 */
const moveStraight = (map: WalkMap, walker: Walker, direction: Facing): StepOutcome =>
{
  const target = { x: columnAfter(map, walker.x, direction), y: rowAfter(map, walker.y, direction) };
  const turned = face(walker, direction);
  return canPass(map, walker, walker.x, walker.y, direction)
    ? { walker: { ...turned, ...target }, blocked: null }
    : { walker: turned, blocked: target };
};

/**
 * Walks one tile diagonally, as Game_CharacterBase#moveDiagonally: the walker turns only when it faced the opposite of
 * either half of the step, and turns that way whether or not the step goes.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker.
 * @param {Facing} across The direction across.
 * @param {Facing} upOrDown The direction up or down.
 * @returns {StepOutcome} Where it is now, and the tile it could not enter when the step failed.
 */
const moveDiagonally = (map: WalkMap, walker: Walker, across: Facing, upOrDown: Facing): StepOutcome =>
{
  const target = { x: columnAfter(map, walker.x, across), y: rowAfter(map, walker.y, upOrDown) };
  const passed = canPassDiagonally(map, walker, across, upOrDown);
  let next: Walker = passed ? { ...walker, ...target } : walker;

  // the facing follows the engine's two checks, in its order, the second reading the facing the first may have set.
  if (next.facing === reverse(across))
  {
    next = face(next, across);
  }

  if (next.facing === reverse(upOrDown))
  {
    next = face(next, upOrDown);
  }

  return { walker: next, blocked: passed ? null : target };
};

/**
 * Leaps by an offset, as Game_CharacterBase#jump: the walker faces the way of the longer half of the leap, and lands
 * wherever the leap ends, walls or not.
 * @param {Walker} walker The walker.
 * @param {number} dx How far across.
 * @param {number} dy How far up or down.
 * @returns {Walker} The walker where it lands.
 */
const jump = (walker: Walker, dx: number, dy: number): Walker =>
{
  // a longer leap across faces across; one straight up or down faces that way; a leap on the spot keeps the facing.
  let turned = walker;
  if (Math.abs(dx) > Math.abs(dy))
  {
    turned = face(walker, dx < 0 ? 4 : 6);
  }
  else if (dy !== 0)
  {
    turned = face(walker, dy < 0 ? 8 : 2);
  }

  return { ...turned, x: walker.x + dx, y: walker.y + dy };
};

/**
 * Walks one step a move can take: straight, diagonal, forward or backward.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker.
 * @param {number} code The step's code.
 * @returns {StepOutcome | null} What the step did, or null when the code is not a move.
 */
const walkMove = (map: WalkMap, walker: Walker, code: number): StepOutcome | null =>
{
  const straight = STRAIGHT_STEPS.get(code);
  if (straight !== undefined)
  {
    return moveStraight(map, walker, straight);
  }

  const diagonal = DIAGONAL_STEPS.get(code);
  if (diagonal !== undefined)
  {
    return moveDiagonally(map, walker, diagonal[0], diagonal[1]);
  }

  if (code === RouteCode.moveForward)
  {
    return moveStraight(map, walker, walker.facing);
  }

  if (code === RouteCode.moveBackward)
  {
    // a step backward holds the facing, as the engine does by fixing the direction for the step.
    const outcome = moveStraight(map, { ...walker, directionFix: true }, reverse(walker.facing));
    return { walker: { ...outcome.walker, directionFix: walker.directionFix }, blocked: outcome.blocked };
  }

  return null;
};

/**
 * Turns the walker as a turn step says, when the step is one that can be known.
 * @param {Walker} walker The walker.
 * @param {number} code The step's code.
 * @returns {Walker | null} The walker turned, or null when the code is not a known turn.
 */
const walkTurn = (walker: Walker, code: number): Walker | null =>
{
  const facing = FACING_TURNS.get(code);
  if (facing !== undefined)
  {
    return face(walker, facing);
  }

  switch (code)
  {
    case RouteCode.turnRight90:
      return face(walker, QUARTER_RIGHT[walker.facing]);
    case RouteCode.turnLeft90:
      return face(walker, QUARTER_LEFT[walker.facing]);
    case RouteCode.turn180:
      return face(walker, reverse(walker.facing));
    default:
      return null;
  }
};

/**
 * Takes one step of a route, as Game_Character#processMoveCommand would.
 * @param {WalkMap} map The map.
 * @param {Walker} walker The walker before the step.
 * @param {RmmzMoveCommand} step The step.
 * @returns {{ kind: WalkStep['kind'], outcome: StepOutcome }} What kind of step it was, and what it did.
 */
const takeStep = (map: WalkMap, walker: Walker, step: RmmzMoveCommand): { kind: WalkStep['kind']; outcome: StepOutcome } =>
{
  const moved = walkMove(map, walker, step.code);
  if (moved !== null)
  {
    return { kind: 'move', outcome: moved };
  }

  const turned = walkTurn(walker, step.code);
  if (turned !== null)
  {
    return { kind: 'turn', outcome: { walker: turned, blocked: null } };
  }

  if (step.code === RouteCode.jump)
  {
    const [ dx, dy ] = step.parameters ?? [];
    return { kind: 'jump', outcome: { walker: jump(walker, wholeNumber(dx), wholeNumber(dy)), blocked: null } };
  }

  if (GUESSED_STEPS.has(step.code))
  {
    return { kind: 'guess', outcome: { walker, blocked: null } };
  }

  // a setting the walk depends on changes the walker; every other step leaves it as it was.
  return { kind: 'other', outcome: { walker: { ...walker, ...SETTINGS.get(step.code) }, blocked: null } };
};

/**
 * Walks a route the way the engine runs it, once through, from a starting walker: each step's tile, facing and whether
 * the map stopped it. A step the map stops is skipped when the route skips what it cannot do, and otherwise holds the
 * route there for good, so the walk ends on it.
 * @param {Walker} start Where the walker starts.
 * @param {readonly RmmzMoveCommand[]} steps The route's steps, without the step ending it.
 * @param {WalkMap} map The map.
 * @param {boolean} skippable Whether the route skips the steps it cannot take.
 * @returns {RouteWalk} The steps taken, where the walker ends, and whether the route is stuck.
 */
const walkRoute = (start: Walker, steps: readonly RmmzMoveCommand[], map: WalkMap, skippable: boolean): RouteWalk =>
{
  const taken: WalkStep[] = [];
  let walker = start;
  for (const [ index, step ] of steps.entries())
  {
    const { kind, outcome } = takeStep(map, walker, step);
    const { blocked } = outcome;
    const from = { x: walker.x, y: walker.y };
    ({ walker } = outcome);
    taken.push({ index, kind, from, to: { x: walker.x, y: walker.y }, facing: walker.facing, blocked });

    // a step the map refuses is tried again every frame unless the route skips it, so nothing after it ever happens.
    if (blocked !== null && skippable === false)
    {
      return { steps: taken, end: walker, stuck: true };
    }
  }

  return { steps: taken, end: walker, stuck: false };
};

export { canPass, columnAfter, face, reverse, RouteCode, rowAfter, walkRoute };
export type { Facing, RouteWalk, WalkMap, Walker, WalkStep };

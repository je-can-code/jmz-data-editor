import { routeSteps, withSteps } from '../commands/editors/moveRoute.ts';
import { cloneJson, jsonEquals } from '../model/json.ts';
import type { RmmzMoveCommand, RmmzMoveRoute } from '../model/rmmzTypes.ts';

/**
 * A run of identical steps, which the route editor lists as one row ("Move Left ×3"): where it starts among the
 * route's steps, how many steps it holds, and the step itself.
 */
type StepRun = {
  readonly start: number;
  readonly count: number;
  readonly step: RmmzMoveCommand;
};

/**
 * Reports whether two steps are the same step: the same code with the same inputs. Where a step sits in the list
 * (its indent) is no part of what it does.
 * @param {RmmzMoveCommand} left One step.
 * @param {RmmzMoveCommand} right The other.
 * @returns {boolean} True when they do the same thing.
 */
const sameStep = (left: RmmzMoveCommand, right: RmmzMoveCommand): boolean =>
{
  return left.code === right.code && jsonEquals(left.parameters ?? [], right.parameters ?? []);
};

/**
 * Groups a route's steps into runs of identical steps, in order.
 * @param {readonly RmmzMoveCommand[]} steps The steps.
 * @returns {StepRun[]} The runs.
 */
const stepRuns = (steps: readonly RmmzMoveCommand[]): StepRun[] =>
{
  const runs: StepRun[] = [];
  steps.forEach((step, index) =>
  {
    const last = runs.at(-1);
    if (last !== undefined && sameStep(last.step, step))
    {
      runs[runs.length - 1] = { ...last, count: last.count + 1 };
      return;
    }

    runs.push({ start: index, count: 1, step });
  });

  return runs;
};

/**
 * Finds the run a step belongs to.
 * @param {readonly StepRun[]} runs The runs.
 * @param {number} stepIndex The step.
 * @returns {number} The run's place among the runs, or -1 for a step past the end.
 */
const runOfStep = (runs: readonly StepRun[], stepIndex: number): number =>
{
  return runs.findIndex(run => stepIndex >= run.start && stepIndex < run.start + run.count);
};

/**
 * Replaces a run's steps with others.
 * @param {RmmzMoveRoute} route The route.
 * @param {StepRun} run The run.
 * @param {readonly RmmzMoveCommand[]} replacement The steps in its place.
 * @returns {RmmzMoveRoute} The route.
 */
const spliceRun = (route: RmmzMoveRoute, run: StepRun, replacement: readonly RmmzMoveCommand[]): RmmzMoveRoute =>
{
  const steps = routeSteps(route);
  return withSteps(route, [ ...steps.slice(0, run.start), ...replacement, ...steps.slice(run.start + run.count) ]);
};

/**
 * Makes a run so many steps long, copying its step or taking copies away.
 * @param {RmmzMoveRoute} route The route.
 * @param {StepRun} run The run.
 * @param {number} count How many steps it should hold; at least one.
 * @returns {RmmzMoveRoute} The route.
 */
const setRunCount = (route: RmmzMoveRoute, run: StepRun, count: number): RmmzMoveRoute =>
{
  return spliceRun(route, run, Array.from({ length: Math.max(1, count) }, () => cloneJson(run.step)));
};

/**
 * Gives every step of a run new inputs at once, as one step edited.
 * @param {RmmzMoveRoute} route The route.
 * @param {StepRun} run The run.
 * @param {RmmzMoveCommand} step The run's step, as edited.
 * @returns {RmmzMoveRoute} The route.
 */
const replaceRun = (route: RmmzMoveRoute, run: StepRun, step: RmmzMoveCommand): RmmzMoveRoute =>
{
  return spliceRun(route, run, Array.from({ length: run.count }, () => cloneJson(step)));
};

/**
 * Takes a whole run out of the route.
 * @param {RmmzMoveRoute} route The route.
 * @param {StepRun} run The run.
 * @returns {RmmzMoveRoute} The route without it.
 */
const removeRun = (route: RmmzMoveRoute, run: StepRun): RmmzMoveRoute =>
{
  return spliceRun(route, run, []);
};

/**
 * Moves a whole run past its neighbour, up or down; a run at either end moving outward stays put.
 * @param {RmmzMoveRoute} route The route.
 * @param {readonly StepRun[]} runs The route's runs.
 * @param {number} index The run's place among them.
 * @param {-1 | 1} by Up (-1) or down (1).
 * @returns {RmmzMoveRoute} The route in its new order.
 */
const moveRun = (route: RmmzMoveRoute, runs: readonly StepRun[], index: number, by: -1 | 1): RmmzMoveRoute =>
{
  const neighbour = runs[index + by];
  if (neighbour === undefined)
  {
    return route;
  }

  // the pair is rewritten in its new order: the earlier of the two places holds whichever comes first now.
  const [ first, second ] = by < 0 ? [ runs[index], neighbour ] : [ neighbour, runs[index] ];
  const steps = routeSteps(route);
  const from = Math.min(first.start, second.start);
  const swapped = [ ...steps.slice(first.start, first.start + first.count), ...steps.slice(second.start, second.start + second.count) ];
  return withSteps(route, [ ...steps.slice(0, from), ...swapped, ...steps.slice(from + first.count + second.count) ]);
};

export { moveRun, removeRun, replaceRun, runOfStep, setRunCount, stepRuns };
export type { StepRun };

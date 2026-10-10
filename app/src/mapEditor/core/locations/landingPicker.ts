import type { MapCell } from '../renderer/camera.ts';
import { landingWords, type LandingGround, type LandingProblem } from './landingCheck.ts';

/**
 * Judges a tile a location picker shows, as a landing when the picker chooses where the player lands, and as anywhere
 * at all otherwise.
 * @param {LandingGround | null} ground The map shown, ready to judge, or null while the picker judges nothing, or the
 * map has not opened.
 * @param {MapCell} cell The tile.
 * @returns {LandingProblem | null} Why the player cannot land there, or null when nothing stands against the tile.
 */
const pickProblem = (ground: LandingGround | null, cell: MapCell): LandingProblem | null =>
{
  return ground === null
    ? null
    : ground.problemAt(cell.x, cell.y);
};

/**
 * Says why a picker refuses a tile clicked.
 * @param {MapCell} cell The tile.
 * @param {LandingProblem} problem Why the player cannot land there.
 * @returns {string} The words.
 */
const refusalWords = (cell: MapCell, problem: LandingProblem): string =>
{
  return `The player cannot land on ${cell.x}, ${cell.y}. ${landingWords(problem)}`;
};

/**
 * Says what a picker holds, under its map: why it refused the tile last clicked, while it says that; no tile yet; the
 * tile picked; or the tile picked, which the player cannot stand on, as where a transfer lands now can be.
 * @param {MapCell | null} picked The tile picked on the map shown, or null.
 * @param {LandingProblem | null} problem Why the player cannot land on the tile picked, or null.
 * @param {string | null} refusal Why the tile last clicked was refused, or null since a tile was taken.
 * @returns {string} The words.
 */
const pickReadout = (picked: MapCell | null, problem: LandingProblem | null, refusal: string | null): string =>
{
  if (refusal !== null)
  {
    return refusal;
  }

  if (picked === null)
  {
    return 'No tile picked on this map yet.';
  }

  return problem === null
    ? `Lands on ${picked.x}, ${picked.y}`
    : `Lands on ${picked.x}, ${picked.y}, where the player cannot stand. ${landingWords(problem)}`;
};

/**
 * Words the tile under a picker's pointer: its coordinates, and that the player cannot land there, when they cannot.
 * @param {MapCell} cell The tile.
 * @param {LandingGround | null} ground The map shown, ready to judge, or null while the picker judges nothing.
 * @returns {string} The label.
 */
const hoverWords = (cell: MapCell, ground: LandingGround | null): string =>
{
  return pickProblem(ground, cell) === null
    ? `${cell.x}, ${cell.y}`
    : `${cell.x}, ${cell.y} · cannot land here`;
};

export { hoverWords, pickProblem, pickReadout, refusalWords };

import { getJmzHttpApiBase } from '../../constants/jmzHttpApiBase.ts';

/**
 * One map event standing as an enemy, as the server lists it: an event whose comments make it a battler of that
 * enemy on at least one of its pages.
 */
type EnemyPlacement = {
  /**
   * The map's id, which also names its file: map 12 is kept in Map012.json.
   */
  readonly mapId: number;

  /**
   * The map's name in the map tree, or empty for a map the tree has no row for.
   */
  readonly mapName: string;

  /**
   * The event's id on its map.
   */
  readonly eventId: number;

  /**
   * The event's name, as the map editor shows it.
   */
  readonly eventName: string;

  /**
   * The tile the event starts on, counted from the map's top-left corner.
   */
  readonly x: number;
  readonly y: number;

  /**
   * The event's pages naming the enemy, counted from 0 in page order. The event is that enemy only while the game
   * has it on one of these pages, which its page conditions decide.
   */
  readonly pageIndexes: readonly number[];

  /**
   * How many pages the event has in all.
   */
  readonly pageCount: number;
};

/**
 * Fetches a URL: {@link fetch}, or a stand-in.
 */
type Fetcher = (url: string) => Promise<Response>;

/**
 * The response envelope every JSON route of the server shares ({@code server/internal/api/response.go}).
 */
type Envelope = {
  path?: string;
  error?: string;
  data?: unknown;
};

/**
 * Builds the address the server answers an enemy's placements at.
 * @param {string} apiBase The server's origin, such as {@code http://127.0.0.1:8080}, with no trailing slash.
 * @param {number} enemyId The enemy's id.
 * @returns {string} The address.
 */
const enemyPlacementsUrl = (apiBase: string, enemyId: number): string =>
{
  return `${apiBase}/api/enemies/${enemyId}/placements`;
};

/**
 * Determines whether a value is a plain JSON object.
 * @param {unknown} value The value.
 * @returns {boolean} True for an object that is neither null nor an array.
 */
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
{
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
};

/**
 * Determines whether a value is a whole number.
 * @param {unknown} value The value.
 * @returns {boolean} True for an integer.
 */
const isWholeNumber = (value: unknown): value is number =>
{
  return typeof value === 'number' && Number.isInteger(value);
};

/**
 * Reads one placement, refusing anything that is not the shape the server promises.
 * @param {unknown} value One entry of the answer's placements.
 * @returns {EnemyPlacement | null} The placement, or null when the entry is malformed.
 */
const parsePlacement = (value: unknown): EnemyPlacement | null =>
{
  if (isJsonObject(value) === false)
  {
    return null;
  }

  // every number the server sends is a whole one, and the page list is never empty.
  const { mapId, mapName, eventId, eventName, x, y, pageIndexes, pageCount } = value;
  const numbersAreWhole = [ mapId, eventId, x, y, pageCount ].every(isWholeNumber);
  const namesAreText = typeof mapName === 'string' && typeof eventName === 'string';
  const pagesAreListed = Array.isArray(pageIndexes) && pageIndexes.length > 0 && pageIndexes.every(isWholeNumber);
  if (numbersAreWhole === false || namesAreText === false || pagesAreListed === false)
  {
    return null;
  }

  return {
    mapId: mapId as number,
    mapName: mapName as string,
    eventId: eventId as number,
    eventName: eventName as string,
    x: x as number,
    y: y as number,
    pageIndexes: pageIndexes as number[],
    pageCount: pageCount as number,
  };
};

/**
 * Reads the placements out of an answer's data. The server is the other end of this contract, so anything off it,
 * an answer about another enemy included, is a fault to report rather than something to show.
 * @param {unknown} data The answer's data, as parsed from JSON.
 * @param {number} enemyId The enemy asked about.
 * @returns {EnemyPlacement[]} The placements, in the server's order.
 */
const parseEnemyPlacements = (data: unknown, enemyId: number): EnemyPlacement[] =>
{
  if (isJsonObject(data) === false || data['enemyId'] !== enemyId || Array.isArray(data['placements']) === false)
  {
    throw new Error(`The placements of enemy ${enemyId} came back in a shape this editor does not know.`);
  }

  // read each entry, and refuse the whole answer over any one that is malformed.
  const placements = data['placements'].map(parsePlacement);
  if (placements.includes(null))
  {
    throw new Error(`A placement of enemy ${enemyId} came back in a shape this editor does not know.`);
  }

  return placements as EnemyPlacement[];
};

/**
 * Asks the server where an enemy is placed. The server keeps what it read of the maps until one changes, so asking
 * each time the board shows another enemy is cheap, and always as current as the files.
 * @param {number} enemyId The enemy's id.
 * @param {string | null} apiBase The server's origin; the app's own by default.
 * @param {Fetcher} fetcher Fetches the answer; the browser's fetch by default.
 * @returns {Promise<EnemyPlacement[]>} Every placement of the enemy, by map and then event.
 */
const readEnemyPlacements = async (
  enemyId: number,
  apiBase: string | null = getJmzHttpApiBase(),
  fetcher: Fetcher = (url) => fetch(url),
): Promise<EnemyPlacement[]> =>
{
  if (apiBase === null)
  {
    throw new Error('The editor has no server to ask where enemies are placed.');
  }

  // fetch the answer, which carries its own error message whenever the server has one to give.
  const url = enemyPlacementsUrl(apiBase, enemyId);
  const response = await fetcher(url);
  const text = await response.text();

  let envelope: Envelope;
  try
  {
    envelope = JSON.parse(text) as Envelope;
  }
  catch
  {
    throw new Error(`HTTP ${response.status} for GET ${url}: ${text.trim()}`);
  }

  if (response.ok === false || (envelope.error !== undefined && envelope.error !== ''))
  {
    throw new Error(envelope.error !== undefined && envelope.error !== ''
      ? envelope.error
      : `HTTP ${response.status} for GET ${url}`);
  }

  return parseEnemyPlacements(envelope.data, enemyId);
};

export type { EnemyPlacement, Fetcher };
export { enemyPlacementsUrl, parseEnemyPlacements, readEnemyPlacements };

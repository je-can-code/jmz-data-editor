/**
 * The two numbers J-Lighting rolls with Math.random for a light when it first appears: one for where in its cycle it
 * starts, one for its own tempo. Each runs from 0 up to 1, as Math.random's do.
 */
type LightRolls = {
  readonly phase: number;
  readonly rate: number;
};

/**
 * What a hash is folded down by to land from 0 up to 1: one more than the largest 32-bit number.
 */
const HASH_RANGE = 2 ** 32;

/**
 * The salts that keep a light's two rolls apart, so its tempo never simply follows from where it starts.
 */
const PHASE_SALT = 0x9e3779b9;
const RATE_SALT = 0x85ebca6b;

/**
 * Hashes a text to a 32-bit number: FNV-1a over its characters, from a start the salt shifts, then MurmurHash3's final
 * mix, which spreads texts differing by a single digit, such as two neighbouring events' names, right across the range.
 * @param {string} text The text.
 * @param {number} salt Shifts the hash, so one text gives as many unrelated numbers as there are salts.
 * @returns {number} The hash, from 0 up to 2 to the 32nd.
 */
const hashText = (text: string, salt: number): number =>
{
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < text.length; index++)
  {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  // the final mix: every bit of the input moves about half the bits of the output.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
};

/**
 * Names a light for its rolls: its map, then its name as J-Lighting gives it (its event's source and its place among
 * that page's lights), so the same torch reads the same however the map around it changes, and a torch on another map
 * reads differently.
 * @param {number} mapId The map.
 * @param {string} lightId The light's name, such as {@code page:12#0}.
 * @returns {string} The seed, such as {@code map:6/page:12#0}.
 */
const lightSeed = (mapId: number, lightId: string): string =>
{
  return `map:${mapId}/${lightId}`;
};

/**
 * Rolls a light's two numbers from its seed instead of at random: what the game rolls once when a light appears, rolled
 * here the same way every time, so a light never jumps to another place in its cycle or another tempo when the map is
 * drawn again, an event is edited, the view pans, or the map is opened another day.
 * @param {number} mapId The map.
 * @param {string} lightId The light's name, such as {@code page:12#0}.
 * @returns {LightRolls} The light's rolls.
 */
const lightRolls = (mapId: number, lightId: string): LightRolls =>
{
  const seed = lightSeed(mapId, lightId);
  return {
    phase: hashText(seed, PHASE_SALT) / HASH_RANGE,
    rate: hashText(seed, RATE_SALT) / HASH_RANGE,
  };
};

export { hashText, lightRolls, lightSeed };
export type { LightRolls };

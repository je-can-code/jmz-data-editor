/**
 * What a whole-number field accepts: the smallest and largest values, as MZ's own map properties allow them.
 */
type NumberLimits = {
  readonly min: number;
  readonly max: number;
};

/**
 * The limits of each number the map properties form edits, as MZ allows them.
 */
const PROPERTY_LIMITS = {
  volume: { min: 0, max: 100 },
  pitch: { min: 50, max: 150 },
  pan: { min: -100, max: 100 },
  parallaxSpeed: { min: -32, max: 32 },
  encounterStep: { min: 1, max: 999 },
  troopId: { min: 1, max: 9999 },
  weight: { min: 1, max: 100 },
  region: { min: 1, max: 255 },
} as const satisfies Readonly<Record<string, NumberLimits>>;

/**
 * How a map scrolls at its edges, in the order MZ numbers them, with the words the form shows.
 */
const SCROLL_TYPES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Does not loop' },
  { value: 1, label: 'Loops vertically' },
  { value: 2, label: 'Loops horizontally' },
  { value: 3, label: 'Loops both ways' },
];

/**
 * Reads a whole number typed into a field, refusing anything that is not one or falls outside its limits.
 * @param {string} text What was typed.
 * @param {NumberLimits} limits The smallest and largest values allowed.
 * @returns {number | null} The number, or null when the text is not an allowed whole number.
 */
const parseWholeNumber = (text: string, limits: NumberLimits): number | null =>
{
  const trimmed = text.trim();
  if (/^[-+]?\d+$/u.test(trimmed) === false)
  {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  return value >= limits.min && value <= limits.max
    ? value
    : null;
};

/**
 * Reads a list of region ids typed as numbers separated by commas or spaces. An empty field is an empty list,
 * which MZ reads as "every region"; any entry that is not a region id refuses the whole list, and repeats are kept
 * once.
 * @param {string} text What was typed.
 * @returns {number[] | null} The region ids in the order typed, or null when any entry is not one.
 */
const parseRegionList = (text: string): number[] | null =>
{
  const entries = text.split(/[\s,]+/u).filter(entry => entry !== '');
  const regions: number[] = [];
  for (const entry of entries)
  {
    const region = parseWholeNumber(entry, PROPERTY_LIMITS.region);
    if (region === null)
    {
      return null;
    }

    if (regions.includes(region) === false)
    {
      regions.push(region);
    }
  }

  return regions;
};

/**
 * Writes a list of region ids the way the field shows them.
 * @param {readonly number[]} regions The region ids.
 * @returns {string} The text, such as "1, 3, 5".
 */
const formatRegionList = (regions: readonly number[]): string =>
{
  return regions.join(', ');
};

export { formatRegionList, parseRegionList, parseWholeNumber, PROPERTY_LIMITS, SCROLL_TYPES };
export type { NumberLimits };

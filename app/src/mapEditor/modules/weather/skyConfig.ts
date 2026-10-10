import { isJsonObject, type JsonValue } from '../../core/model/json.ts';

/**
 * One face a condition wears (a rule of SkyStates.faceFor): the look it is drawn with, and the seasons, by their
 * lowercase names, and the phases of the day, 0 to 5, it applies in, either left out to apply in every one.
 */
type SkyFace = {
  readonly preset: string;
  readonly seasons?: readonly string[];
  readonly phases?: readonly number[];
};

/**
 * One condition the sky can be in (a type of the sky block): its own look, the strengths it is ever at, weakest first,
 * left out for every strength, and the faces it wears at some seasons and hours, tried in the order written.
 */
type SkyType = {
  readonly preset: string;
  readonly intensities?: readonly string[];
  readonly faces?: readonly SkyFace[];
};

/**
 * What one season allows the sky to be, and how the sky moves between those, condition to condition, by weight.
 */
type SkySeason = {
  readonly allowed: readonly string[];
  readonly transitions: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

/**
 * J-Weather-Time's sky block of config.weather.json, as far as the editor reads it: every condition by name, every
 * season by its lowercase name, what each month leans toward, by the month's number, and the condition a season's last
 * day settles toward.
 */
type SkyConfig = {
  readonly types: Readonly<Record<string, SkyType>>;
  readonly seasons: Readonly<Record<string, SkySeason>>;
  readonly months?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly settleTo: string;
};

/**
 * Keys beginning with this are the file's authoring notes rather than data, as the data editor's Weather board reads
 * them: such a note may sit among the conditions or the seasons, and is neither.
 */
const NOTE_PREFIX = '_comment';

/**
 * Reports whether a key names data rather than one of the file's authoring notes.
 * @param {string} key The key.
 * @returns {boolean} True when it names data.
 */
const isDataKey = (key: string): boolean =>
{
  return key.startsWith(NOTE_PREFIX) === false;
};

/**
 * Reports whether a value is a list of names.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for an array of text.
 */
const isNameList = (value: JsonValue | undefined): boolean =>
{
  return Array.isArray(value) && value.every(each => typeof each === 'string');
};

/**
 * Reports whether every entry of a table that names data passes a test, the table's own notes passed over.
 * @param {JsonValue | undefined} value The table.
 * @param {(entry: JsonValue) => boolean} test The test.
 * @returns {boolean} True for a table whose every entry passes.
 */
const isTableOf = (value: JsonValue | undefined, test: (entry: JsonValue) => boolean): boolean =>
{
  return value !== undefined && isJsonObject(value) && Object.entries(value).filter(([ key ]) => isDataKey(key)).every(([ , entry ]) => test(entry));
};

/**
 * Reports whether a value is a table of numbers by name, as a transition row or a month's lean is.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for such a table.
 */
const isWeightTable = (value: JsonValue | undefined): boolean =>
{
  return isTableOf(value, weight => typeof weight === 'number');
};

/**
 * Reports whether a value is a table of weight tables, as a season's transitions and the months' leans are.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for such a table.
 */
const isTableOfWeights = (value: JsonValue | undefined): boolean =>
{
  return isTableOf(value, isWeightTable);
};

/**
 * Reports whether a value is a face as the plugin reads one.
 * @param {JsonValue} value The value.
 * @returns {boolean} True for a face.
 */
const isFace = (value: JsonValue): boolean =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { preset, seasons, phases } = value;
  return typeof preset === 'string'
    && (seasons === undefined || isNameList(seasons))
    && (phases === undefined || (Array.isArray(phases) && phases.every(phase => typeof phase === 'number')));
};

/**
 * Reports whether a value is a condition as the plugin reads one: its own look, its strengths, if it lists any, at
 * least one of them, and its faces, if it has any.
 * @param {JsonValue} value The value.
 * @returns {boolean} True for a condition.
 */
const isSkyType = (value: JsonValue): boolean =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { preset, intensities, faces } = value;
  return typeof preset === 'string'
    && (intensities === undefined || (isNameList(intensities) && (intensities as JsonValue[]).length > 0))
    && (faces === undefined || (Array.isArray(faces) && faces.every(isFace)));
};

/**
 * Reports whether a value is a season as the plugin reads one: the conditions it allows, and how the sky moves between
 * them.
 * @param {JsonValue} value The value.
 * @returns {boolean} True for a season.
 */
const isSkySeason = (value: JsonValue): boolean =>
{
  return isJsonObject(value) && isNameList(value['allowed']) && isTableOfWeights(value['transitions']);
};

/**
 * Reads J-Weather-Time's sky out of J-Weather's config as the server served it: the sky block, when it is the shape the
 * data editor's Weather board writes, every condition with its look, its strengths and its faces, every season with what
 * it allows and its transitions, the months' leans if any, and the condition a season's last day settles toward; or
 * none at all for a config without one, or with one the plugin could not walk, which the editor then shows no sky from.
 * The file's authoring notes among the conditions and the seasons are passed over, as they are neither.
 * @param {JsonValue | null} config J-Weather's config as served, or null when it could not be read.
 * @returns {SkyConfig | null} The sky, or null when there is none to read.
 */
const skyConfigFrom = (config: JsonValue | null): SkyConfig | null =>
{
  if (config === null || isJsonObject(config) === false)
  {
    return null;
  }

  const { sky } = config;
  if (sky === undefined || isJsonObject(sky) === false)
  {
    return null;
  }

  const { types, seasons, months, settleTo } = sky;
  const holds = isTableOf(types, isSkyType)
    && isTableOf(seasons, isSkySeason)
    && (months === undefined || isTableOfWeights(months))
    && typeof settleTo === 'string';
  return holds
    ? sky as unknown as SkyConfig
    : null;
};

/**
 * Lists the conditions the sky can be in, in the order the config lists them, its authoring notes passed over.
 * @param {SkyConfig} sky The sky.
 * @returns {string[]} The conditions' names.
 */
const skyConditionNames = (sky: SkyConfig): string[] =>
{
  return Object.keys(sky.types).filter(isDataKey);
};

export { isDataKey, skyConditionNames, skyConfigFrom };
export type { SkyConfig, SkyFace, SkySeason, SkyType };

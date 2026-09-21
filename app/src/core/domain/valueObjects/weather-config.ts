/**
 * Typed view of `data/config.weather.json` for the editor. Mirrors what J-Weather and
 * J-Weather-Time read at game runtime — see
 * `rmmz-plugins/src/plugins/weather/core/core/WeatherPresets.js` for the looks themselves and
 * `.../weather/ext/time/core/SkyStates.js` for the sky that chooses between them.
 *
 * **The original file is carried through every edit.** Hydration keeps the parsed root on
 * {@link WeatherConfigRoot.source}, and serialization starts from a copy of it and lays the edited
 * sections back on top. That is not caution for its own sake: the file interleaves `_comment_*`
 * blocks that are the only documentation an author has while reading it by hand, presets carry
 * their own per-stop notes, and the motions hold a couple of hundred hand-tuned numbers this
 * editor deliberately does not model. A serializer that rebuilt the root from a typed model would
 * quietly delete every one of them on the first save.
 *
 * **What this models is what J-Weather-Time added**: the sky, its per-month bias, the climates,
 * the forecast's destinations and voices, and the icon each look is drawn with in the forecast.
 * The motions and the layer stacks inside each preset are passed through untouched — those were
 * tuned by eye against a running game, which is a better tool for them than a form.
 */

/**
 * Narrows an unknown value to a plain object.
 * @param {unknown} candidate The value being checked.
 * @returns {boolean} True when it is a non-array object.
 */
const isPlainObject = (candidate: unknown): candidate is Record<string, unknown> =>
{
  return typeof candidate === 'object' && candidate !== null && Array.isArray(candidate) === false;
};

/**
 * Reads a numeric field, falling back when the file carries something else.
 * @param {Record<string, unknown>} record The object being read.
 * @param {string} key The field being read.
 * @param {number} fallback What to use when the field is absent or not a number.
 * @returns {number} The value on the record, or the fallback.
 */
const numberAt = (record: Record<string, unknown>, key: string, fallback: number): number =>
{
  const value = record[ key ];

  return Number.isFinite(value) ? value as number : fallback;
};

/**
 * Reads a string field, falling back when the file carries something else.
 * @param {Record<string, unknown>} record The object being read.
 * @param {string} key The field being read.
 * @param {string} fallback What to use when the field is absent or not a string.
 * @returns {string} The value on the record, or the fallback.
 */
const stringAt = (record: Record<string, unknown>, key: string, fallback: string): string =>
{
  const value = record[ key ];

  return typeof value === 'string' ? value : fallback;
};

/**
 * One line somebody says about the weather, and which actor says it.
 */
type WeatherVoiceLine = {
  who: number;
  says: string;
};

/**
 * Every line written for one look, keyed by strength. `any` covers the strengths that have none
 * of their own, which is how an author owes fifteen states rather than forty-five.
 */
type WeatherVoiceEntry = Record<string, WeatherVoiceLine[]>;

/**
 * A destination the diagnostic forecast reports on. It is a name and a map id and nothing else:
 * the weather comes from that map's own note, so nothing about it is restated here.
 */
type WeatherPlace = {
  name: string;
  mapId: number;
};

/**
 * How one kind of place answers the sky rather than following it. `byType` keys on the sky's
 * condition and `byIntensity` on its strength; a climate declares one or the other.
 */
type WeatherClimate = {
  byType: Record<string, string>;
  byIntensity: Record<string, string>;
  fallback: string;
  /** Anything else the file carried on this climate, kept so a save cannot lose it. */
  extras: Record<string, unknown>;
};

/**
 * How likely each condition is during one month, as a multiplier on the weight the season's graph
 * gives it. One is "leave the graph alone" and zero is "not this month".
 */
type WeatherMonthLean = Record<string, number>;

/**
 * One season: which conditions it permits at all, and how it moves between them.
 */
type WeatherSeason = {
  allowed: string[];
  transitions: Record<string, Record<string, number>>;
  /** Anything else the file carried on this season. */
  extras: Record<string, unknown>;
};

/**
 * Which preset a condition is drawn with at a particular season and hour. A rule omitting either
 * key matches every value of it.
 */
type WeatherFace = {
  seasons: string[];
  phases: number[];
  preset: string;
};

/**
 * One condition the sky can be in: the look it is drawn with, the strengths it is willing to be,
 * and the faces it wears at particular times of year and day.
 */
type WeatherSkyType = {
  preset: string;
  intensities: string[];
  faces: WeatherFace[];
  /** Anything else the file carried on this condition. */
  extras: Record<string, unknown>;
};

/**
 * Everything J-Weather-Time owns.
 */
type WeatherSky = {
  types: Record<string, WeatherSkyType>;
  seasons: Record<string, WeatherSeason>;
  months: Record<string, WeatherMonthLean>;
  voices: Record<string, WeatherVoiceEntry>;
  places: WeatherPlace[];
  intensityDrift: { hold: number; up: number; down: number; };
  settleTo: string;
  forecastPhases: number;
  visibleDays: number;
};

/**
 * The editor's whole view of the weather configuration.
 */
type WeatherConfigRoot = {
  /** The file as it was read. Everything not modelled here is carried through a save on it. */
  source: Record<string, unknown>;
  presetIds: Record<string, number>;
  intensityIds: Record<string, number>;
  /** Which icon each look is drawn with in the forecast; zero means it has no artwork yet. */
  presetIcons: Record<string, number>;
  /** What each look is, in the author's own words. */
  presetDescriptions: Record<string, string>;
  sky: WeatherSky;
  climates: Record<string, WeatherClimate>;
};

/** Keys beginning with this are authoring notes rather than data. */
const COMMENT_PREFIX = '_comment';

/**
 * Whether a key is a real entry rather than one of the file's authoring notes.
 * @param {string} key The key being judged.
 * @returns {boolean} True when it names data.
 */
const isDataKey = (key: string): boolean =>
{
  return key.startsWith(COMMENT_PREFIX) === false;
};

/**
 * Splits an object into the keys a typed shape claims and everything else.
 * @param {Record<string, unknown>} record The object being split.
 * @param {string[]} claimed The keys the typed shape owns.
 * @returns {Record<string, unknown>} Every key the typed shape did not claim.
 */
const extrasOf = (record: Record<string, unknown>, claimed: string[]): Record<string, unknown> =>
{
  const extras: Record<string, unknown> = {};

  Object.keys(record)
    .filter(key => claimed.includes(key) === false)
    .forEach(key =>
    {
      extras[ key ] = record[ key ];
    });

  return extras;
};

/**
 * Builds the editor's view of one sky condition.
 * @param {unknown} raw The condition as the file carried it.
 * @returns {WeatherSkyType} The condition, with anything unmodelled kept aside.
 */
const hydrateSkyType = (raw: unknown): WeatherSkyType =>
{
  const record = isPlainObject(raw) ? raw : {};
  const faces = Array.isArray(record[ 'faces' ]) ? record[ 'faces' ] as unknown[] : [];

  return {
    preset: stringAt(record, 'preset', ''),
    intensities: Array.isArray(record[ 'intensities' ]) ? record[ 'intensities' ] as string[] : [],
    faces: faces.filter(isPlainObject)
      .map(face => ({
        seasons: Array.isArray(face[ 'seasons' ]) ? face[ 'seasons' ] as string[] : [],
        phases: Array.isArray(face[ 'phases' ]) ? face[ 'phases' ] as number[] : [],
        preset: stringAt(face, 'preset', ''),
      })),
    extras: extrasOf(record, [ 'preset', 'intensities', 'faces' ]),
  };
};

/**
 * Builds the editor's view of one season's graph.
 * @param {unknown} raw The season as the file carried it.
 * @returns {WeatherSeason} The season, with anything unmodelled kept aside.
 */
const hydrateSeason = (raw: unknown): WeatherSeason =>
{
  const record = isPlainObject(raw) ? raw : {};
  const rawTransitions = isPlainObject(record[ 'transitions' ]) ? record[ 'transitions' ] : {};
  const transitions: Record<string, Record<string, number>> = {};

  Object.keys(rawTransitions)
    .forEach(from =>
    {
      const row = rawTransitions[ from ];

      if (isPlainObject(row) === false) return;

      const weights: Record<string, number> = {};
      Object.keys(row)
        .forEach(to =>
        {
          weights[ to ] = numberAt(row, to, 0);
        });

      transitions[ from ] = weights;
    });

  return {
    allowed: Array.isArray(record[ 'allowed' ]) ? record[ 'allowed' ] as string[] : [],
    transitions,
    extras: extrasOf(record, [ 'allowed', 'transitions' ]),
  };
};

/**
 * Builds the editor's view of one climate's table.
 * @param {unknown} raw The climate as the file carried it.
 * @returns {WeatherClimate} The climate, with anything unmodelled kept aside.
 */
const hydrateClimate = (raw: unknown): WeatherClimate =>
{
  const record = isPlainObject(raw) ? raw : {};
  const table = (key: string): Record<string, string> =>
  {
    const found = record[ key ];

    if (isPlainObject(found) === false) return {};

    const mapped: Record<string, string> = {};
    Object.keys(found)
      .forEach(entry =>
      {
        mapped[ entry ] = stringAt(found, entry, '');
      });

    return mapped;
  };

  return {
    byType: table('byType'),
    byIntensity: table('byIntensity'),
    fallback: stringAt(record, 'default', ''),
    extras: extrasOf(record, [ 'byType', 'byIntensity', 'default' ]),
  };
};

/**
 * Builds the editor's view of every line written about the weather.
 * @param {unknown} raw The `voices` block as the file carried it.
 * @returns {Record<string, WeatherVoiceEntry>} The lines, by look and then by strength.
 */
const hydrateVoices = (raw: unknown): Record<string, WeatherVoiceEntry> =>
{
  const record = isPlainObject(raw) ? raw : {};
  const voices: Record<string, WeatherVoiceEntry> = {};

  Object.keys(record)
    .filter(isDataKey)
    .forEach(preset =>
    {
      const byStrength = record[ preset ];

      if (isPlainObject(byStrength) === false) return;

      const entry: WeatherVoiceEntry = {};
      Object.keys(byStrength)
        .forEach(strength =>
        {
          const lines = byStrength[ strength ];

          if (Array.isArray(lines) === false) return;

          entry[ strength ] = (lines as unknown[]).filter(isPlainObject)
            .map(line => ({
              who: numberAt(line, 'who', 0),
              says: stringAt(line, 'says', ''),
            }));
        });

      voices[ preset ] = entry;
    });

  return voices;
};

/**
 * Builds the editor's whole view of the weather configuration.
 * @param {unknown} raw The parsed contents of `config.weather.json`.
 * @returns {WeatherConfigRoot} The configuration, with the original carried along for saving.
 */
const hydrateWeatherConfig = (raw: unknown): WeatherConfigRoot =>
{
  const source = isPlainObject(raw) ? raw : {};
  const rawSky = isPlainObject(source[ 'sky' ]) ? source[ 'sky' ] : {};
  const rawPresets = isPlainObject(source[ 'presets' ]) ? source[ 'presets' ] : {};
  const rawClimates = isPlainObject(source[ 'climates' ]) ? source[ 'climates' ] : {};

  const presetIcons: Record<string, number> = {};
  const presetDescriptions: Record<string, string> = {};
  Object.keys(rawPresets)
    .filter(isDataKey)
    .forEach(name =>
    {
      const preset = rawPresets[ name ];

      if (isPlainObject(preset) === false) return;

      presetIcons[ name ] = numberAt(preset, 'iconIndex', 0);
      presetDescriptions[ name ] = stringAt(preset, 'description', '');
    });

  const types: Record<string, WeatherSkyType> = {};
  const rawTypes = isPlainObject(rawSky[ 'types' ]) ? rawSky[ 'types' ] : {};
  Object.keys(rawTypes)
    .filter(isDataKey)
    .forEach(name =>
    {
      types[ name ] = hydrateSkyType(rawTypes[ name ]);
    });

  const seasons: Record<string, WeatherSeason> = {};
  const rawSeasons = isPlainObject(rawSky[ 'seasons' ]) ? rawSky[ 'seasons' ] : {};
  Object.keys(rawSeasons)
    .filter(isDataKey)
    .forEach(name =>
    {
      seasons[ name ] = hydrateSeason(rawSeasons[ name ]);
    });

  const months: Record<string, WeatherMonthLean> = {};
  const rawMonths = isPlainObject(rawSky[ 'months' ]) ? rawSky[ 'months' ] : {};
  Object.keys(rawMonths)
    .filter(isDataKey)
    .forEach(month =>
    {
      const lean = rawMonths[ month ];

      if (isPlainObject(lean) === false) return;

      const multipliers: Record<string, number> = {};
      Object.keys(lean)
        .forEach(type =>
        {
          multipliers[ type ] = numberAt(lean, type, 1);
        });

      months[ month ] = multipliers;
    });

  const climates: Record<string, WeatherClimate> = {};
  Object.keys(rawClimates)
    .filter(isDataKey)
    .forEach(name =>
    {
      climates[ name ] = hydrateClimate(rawClimates[ name ]);
    });

  const rawPlaces = Array.isArray(rawSky[ 'places' ]) ? rawSky[ 'places' ] as unknown[] : [];
  const rawDrift = isPlainObject(rawSky[ 'intensityDrift' ]) ? rawSky[ 'intensityDrift' ] : {};

  const numericMap = (value: unknown): Record<string, number> =>
  {
    const record = isPlainObject(value) ? value : {};
    const mapped: Record<string, number> = {};
    Object.keys(record)
      .filter(isDataKey)
      .forEach(key =>
      {
        mapped[ key ] = numberAt(record, key, 0);
      });

    return mapped;
  };

  return {
    source,
    presetIds: numericMap(source[ 'presetIds' ]),
    intensityIds: numericMap(source[ 'intensityIds' ]),
    presetIcons,
    presetDescriptions,
    climates,
    sky: {
      types,
      seasons,
      months,
      voices: hydrateVoices(rawSky[ 'voices' ]),
      places: rawPlaces.filter(isPlainObject)
        .map(place => ({
          name: stringAt(place, 'name', ''),
          mapId: numberAt(place, 'mapId', 0),
        })),
      intensityDrift: {
        hold: numberAt(rawDrift, 'hold', 50),
        up: numberAt(rawDrift, 'up', 25),
        down: numberAt(rawDrift, 'down', 25),
      },
      settleTo: stringAt(rawSky, 'settleTo', 'clear'),
      forecastPhases: numberAt(rawSky, 'forecastPhases', 2160),
      visibleDays: numberAt(rawSky, 'visibleDays', 3),
    },
  };
};

/**
 * Lays the edited sections back over the file as it was read.
 *
 * Spreading the original first is what preserves both the keys this editor does not model and the
 * order they appeared in, so a save touches only the lines that actually changed.
 * @param {WeatherConfigRoot} root The configuration as the editor holds it.
 * @returns {Record<string, unknown>} The whole file, ready to write.
 */
const serializeWeatherConfig = (root: WeatherConfigRoot): Record<string, unknown> =>
{
  const source = root.source;
  const rawSky = isPlainObject(source[ 'sky' ]) ? source[ 'sky' ] : {};
  const rawPresets = isPlainObject(source[ 'presets' ]) ? source[ 'presets' ] : {};
  const rawClimates = isPlainObject(source[ 'climates' ]) ? source[ 'climates' ] : {};

  const presets: Record<string, unknown> = { ...rawPresets };
  Object.keys(root.presetIcons)
    .forEach(name =>
    {
      const original = isPlainObject(rawPresets[ name ]) ? rawPresets[ name ] : {};
      const icon = root.presetIcons[ name ];
      const merged: Record<string, unknown> = {
        ...original,
        description: root.presetDescriptions[ name ] ?? stringAt(original, 'description', ''),
      };

      // an icon of zero is "no artwork yet", and the field is left off entirely rather than
      // written as a zero the author then has to wonder about.
      if (icon > 0) merged[ 'iconIndex' ] = icon;
      else delete merged[ 'iconIndex' ];

      presets[ name ] = merged;
    });

  const rawTypes = isPlainObject(rawSky[ 'types' ]) ? rawSky[ 'types' ] : {};
  const types: Record<string, unknown> = { ...rawTypes };
  Object.keys(root.sky.types)
    .forEach(name =>
    {
      const type = root.sky.types[ name ];

      // spread the original rather than the extras, so a key the editor does not model keeps the
      // position it had. A per-condition note explains the block it sits inside; moved to the top
      // it explains the one above.
      const original = isPlainObject(rawTypes[ name ]) ? rawTypes[ name ] : type.extras;
      const rebuilt: Record<string, unknown> = {
        ...original,
        preset: type.preset,
        intensities: type.intensities,
      };

      if (type.faces.length > 0)
      {
        rebuilt[ 'faces' ] = type.faces.map(face =>
        {
          const entry: Record<string, unknown> = {};

          // an omitted key is a wildcard, so an empty list is written as no key at all rather than
          // as a rule that can never match.
          if (face.phases.length > 0) entry[ 'phases' ] = face.phases;
          if (face.seasons.length > 0) entry[ 'seasons' ] = face.seasons;
          entry[ 'preset' ] = face.preset;

          return entry;
        });
      }

      types[ name ] = rebuilt;
    });

  const rawSeasons = isPlainObject(rawSky[ 'seasons' ]) ? rawSky[ 'seasons' ] : {};
  const seasons: Record<string, unknown> = { ...rawSeasons };
  Object.keys(root.sky.seasons)
    .forEach(name =>
    {
      const season = root.sky.seasons[ name ];
      const original = isPlainObject(rawSeasons[ name ]) ? rawSeasons[ name ] : season.extras;

      seasons[ name ] = {
        ...original,
        allowed: season.allowed,
        transitions: season.transitions,
      };
    });

  const climates: Record<string, unknown> = { ...rawClimates };
  Object.keys(root.climates)
    .forEach(name =>
    {
      const climate = root.climates[ name ];
      const original = isPlainObject(rawClimates[ name ]) ? rawClimates[ name ] : climate.extras;
      const rebuilt: Record<string, unknown> = { ...original };

      // a climate declares one table or the other; writing an empty one would make configuration
      // validation report it as ambiguous.
      if (Object.keys(climate.byType).length > 0) rebuilt[ 'byType' ] = climate.byType;
      else delete rebuilt[ 'byType' ];

      if (Object.keys(climate.byIntensity).length > 0) rebuilt[ 'byIntensity' ] = climate.byIntensity;
      else delete rebuilt[ 'byIntensity' ];

      if (climate.fallback !== '') rebuilt[ 'default' ] = climate.fallback;
      else delete rebuilt[ 'default' ];

      climates[ name ] = rebuilt;
    });

  const voices: Record<string, unknown> = {};
  Object.keys(root.sky.voices)
    .forEach(preset =>
    {
      const entry = root.sky.voices[ preset ];
      const written: Record<string, unknown> = {};

      Object.keys(entry)
        .filter(strength => entry[ strength ].length > 0)
        .forEach(strength =>
        {
          written[ strength ] = entry[ strength ];
        });

      // a look whose every line was deleted is dropped rather than left as an empty husk.
      if (Object.keys(written).length > 0) voices[ preset ] = written;
    });

  return {
    ...source,
    presets,
    presetIds: root.presetIds,
    intensityIds: root.intensityIds,
    climates,
    sky: {
      ...rawSky,
      types,
      seasons,
      months: root.sky.months,
      voices,
      places: root.sky.places,
      intensityDrift: root.sky.intensityDrift,
      settleTo: root.sky.settleTo,
      forecastPhases: root.sky.forecastPhases,
      visibleDays: root.sky.visibleDays,
    },
  };
};

export {
  hydrateWeatherConfig,
  serializeWeatherConfig,
  type WeatherClimate,
  type WeatherConfigRoot,
  type WeatherFace,
  type WeatherMonthLean,
  type WeatherPlace,
  type WeatherSeason,
  type WeatherSky,
  type WeatherSkyType,
  type WeatherVoiceEntry,
  type WeatherVoiceLine,
};

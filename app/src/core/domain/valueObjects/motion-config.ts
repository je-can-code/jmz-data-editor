/**
 * Typed view of `data/config.motion.json` for the editor. Mirrors what J-Motion and its extensions
 * read at game runtime — see `rmmz-plugins/src/plugins/motion/core/core/MotionTypeRegistry.js` for
 * the motion types and `.../motion/ext/abs/_metadata/_pluginMetadata.js` for the death and loot
 * pacing.
 *
 * The file is flat on disk: one key per motion type carrying that type's default parameters, plus
 * the `death` and `loot` sections owned by J-Motion-ABS. In memory those motion types are gathered
 * under {@link MotionConfigRoot.types} so the board can iterate them, and {@link serializeMotionConfig}
 * flattens them back out on save.
 *
 * **Motion types are deliberately not enumerated here.** `MotionTypeRegistry.register(...)` is an
 * open registry on the plugin side, so a list in this file would be a second copy of something that
 * grows elsewhere and would silently drop any type added since it was written. Carrying whatever the
 * file holds means a new motion type is editable the day it ships, without touching the editor.
 */

/**
 * One motion type's default parameters. Values are numbers except for the handful of types that take
 * a named direction, axis, or colour.
 */
type MotionTypeDefaults = Record<string, number | string>;

/**
 * How long each death style holds a corpse open for, and which style anything gets by default.
 */
type MotionDeathConfig = {
  defaultStyle: string;
  durations: Record<string, number>;
};

/**
 * The shape of the blink an expiring loot drop uses to announce itself.
 */
type MotionLootFlicker = {
  min: number;
  max: number;
  interval: number;
};

/**
 * When an expiring loot drop starts blinking, when it additionally starts dissolving, and how the
 * blink looks. The fade window sits inside the warning one rather than beside it.
 */
type MotionLootConfig = {
  expiryWarnFrames: number;
  expiryFadeFrames: number;
  flicker: MotionLootFlicker;
};

type MotionConfigRoot = {
  types: Record<string, MotionTypeDefaults>;
  death: MotionDeathConfig;
  loot: MotionLootConfig;
};

/**
 * The keys that are sections rather than motion types, so hydration can tell them apart.
 * @type {string[]}
 */
const SECTION_KEYS = [ 'death', 'loot' ];

/**
 * Hardcoded death defaults — the same values the shipped config carries and the same ones
 * J-Motion-ABS falls back to when the file says nothing.
 */
const DEATH_DEFAULTS: MotionDeathConfig = {
  defaultStyle: 'swift',
  durations: {
    swift: 30,
    moderate: 60,
    slow: 120,
  },
};

/**
 * Hardcoded loot defaults, matching J-Motion-ABS's own fallbacks.
 *
 * `expiryWarnFrames` is when the drop starts blinking and `expiryFadeFrames` is when it additionally
 * starts dissolving, both counted backwards from the moment it would vanish.
 */
const LOOT_DEFAULTS: MotionLootConfig = {
  expiryWarnFrames: 300,
  expiryFadeFrames: 120,
  flicker: {
    min: 0.2,
    max: 1.0,
    interval: 8,
  },
};

/**
 * Narrows an unknown value to a plain object.
 * @param candidate The value being checked.
 */
function isPlainObject(candidate: unknown): candidate is Record<string, unknown>
{
  return typeof candidate === 'object' && candidate !== null && Array.isArray(candidate) === false;
}

/**
 * Normalizes the `death` block, filling anything the file does not author from
 * {@link DEATH_DEFAULTS}.
 * @param rawDeath The raw `death` value off the config root, if the file carried one.
 */
function hydrateDeathConfig(rawDeath: unknown): MotionDeathConfig
{
  const record = isPlainObject(rawDeath)
    ? rawDeath
    : null;

  if (record === null)
  {
    return {
      defaultStyle: DEATH_DEFAULTS.defaultStyle,
      durations: { ...DEATH_DEFAULTS.durations },
    };
  }

  const defaultStyle = typeof record[ "defaultStyle" ] === "string"
    ? record[ "defaultStyle" ]
    : DEATH_DEFAULTS.defaultStyle;

  // styles are open-ended: the plugin warns about a name it does not know rather than refusing it,
  // so whatever durations the file authored are kept on top of the known three.
  const durations = { ...DEATH_DEFAULTS.durations };
  const rawDurations = record[ "durations" ];
  if (isPlainObject(rawDurations))
  {
    Object.keys(rawDurations)
      .forEach(style =>
      {
        const value = rawDurations[ style ];

        // a duration that is not a number is a corrupt entry, and honoring it would hand the game a
        // string where it will do arithmetic.
        if (Number.isFinite(value) === false) return;

        durations[ style ] = value as number;
      });
  }

  return {
    defaultStyle,
    durations,
  };
}

/**
 * Normalizes the `loot` block, filling anything the file does not author from
 * {@link LOOT_DEFAULTS}.
 * @param rawLoot The raw `loot` value off the config root, if the file carried one.
 */
function hydrateLootConfig(rawLoot: unknown): MotionLootConfig
{
  const record = isPlainObject(rawLoot)
    ? rawLoot
    : null;

  const hydrated: MotionLootConfig = {
    expiryWarnFrames: LOOT_DEFAULTS.expiryWarnFrames,
    expiryFadeFrames: LOOT_DEFAULTS.expiryFadeFrames,
    flicker: { ...LOOT_DEFAULTS.flicker },
  };

  if (record === null)
  {
    return hydrated;
  }

  if (Number.isFinite(record[ "expiryWarnFrames" ]))
  {
    hydrated.expiryWarnFrames = record[ "expiryWarnFrames" ] as number;
  }

  if (Number.isFinite(record[ "expiryFadeFrames" ]))
  {
    hydrated.expiryFadeFrames = record[ "expiryFadeFrames" ] as number;
  }

  const rawFlicker = record[ "flicker" ];
  if (isPlainObject(rawFlicker))
  {
    (Object.keys(LOOT_DEFAULTS.flicker) as (keyof MotionLootFlicker)[]).forEach(key =>
    {
      const value = rawFlicker[ key ];

      if (Number.isFinite(value) === false) return;

      hydrated.flicker[ key ] = value as number;
    });
  }

  return hydrated;
}

/**
 * Gathers every top-level key that is a motion type rather than a named section.
 * @param rootRecord The raw config root, or null when the file was absent.
 */
function hydrateMotionTypes(rootRecord: Record<string, unknown> | null): Record<string, MotionTypeDefaults>
{
  const types: Record<string, MotionTypeDefaults> = {};

  if (rootRecord === null)
  {
    return types;
  }

  Object.keys(rootRecord)
    .forEach(key =>
    {
      if (SECTION_KEYS.includes(key)) return;

      const parameters = rootRecord[ key ];

      // a motion type is a bag of named parameters. anything else at the root is not one, and
      // guessing at it would write back something the plugin cannot read.
      if (isPlainObject(parameters) === false) return;

      const defaults: MotionTypeDefaults = {};
      Object.keys(parameters)
        .forEach(parameterName =>
        {
          const value = parameters[ parameterName ];

          if (typeof value !== "number" && typeof value !== "string") return;

          defaults[ parameterName ] = value;
        });

      types[ key ] = defaults;
    });

  return types;
}

/**
 * Normalizes a freshly loaded `config.motion.json` payload into the editor's
 * {@link MotionConfigRoot} shape.
 *
 * @param rawRoot Whatever the data loader returned (may be `null` for "file not found").
 */
function hydrateMotionConfig(rawRoot: unknown): MotionConfigRoot
{
  const rootRecord = isPlainObject(rawRoot)
    ? rawRoot
    : null;

  return {
    types: hydrateMotionTypes(rootRecord),
    death: hydrateDeathConfig(rootRecord === null
      ? undefined
      : rootRecord[ "death" ]),
    loot: hydrateLootConfig(rootRecord === null
      ? undefined
      : rootRecord[ "loot" ]),
  };
}

/**
 * Flattens the editor's in-memory shape back into the layout the plugins read off disk: every motion
 * type at the root alongside the named sections.
 * @param config The config as the board has been editing it.
 */
function serializeMotionConfig(config: MotionConfigRoot): Record<string, unknown>
{
  const serialized: Record<string, unknown> = {};

  Object.keys(config.types)
    .forEach(typeName =>
    {
      serialized[ typeName ] = config.types[ typeName ];
    });

  serialized[ "death" ] = config.death;
  serialized[ "loot" ] = config.loot;

  return serialized;
}

export {
  DEATH_DEFAULTS,
  hydrateDeathConfig,
  hydrateLootConfig,
  hydrateMotionConfig,
  LOOT_DEFAULTS,
  serializeMotionConfig,
};
export type {
  MotionConfigRoot,
  MotionDeathConfig,
  MotionLootConfig,
  MotionLootFlicker,
  MotionTypeDefaults,
};

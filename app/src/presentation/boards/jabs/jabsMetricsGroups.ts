import type { JabsMetricsConfig } from '@core/domain/valueObjects/jabs-config.ts';

/**
 * One metric's presentation, tying a config key to the words a human uses for it.
 *
 * The `shape` says what kind of number lives in the variable, which is the difference between a
 * figure that means something and one that does not: a running total climbs forever, a personal best
 * only moves when it is beaten, and a count tallies occurrences. Two metrics with the same label but
 * different shapes would be read the same way and be wrong half the time.
 */
type MetricShape = 'total' | 'best' | 'count';

type MetricDescriptor = {
  key: keyof JabsMetricsConfig;
  label: string;
  shape: MetricShape;
  description: string;
};

type MetricGroup = {
  title: string;
  description: string;
  metrics: MetricDescriptor[];
};

/**
 * Every metric J-ABS-Metrics records, grouped the way the plugin groups them.
 *
 * This list is the editor's copy of a contract the plugin enforces at boot: it throws when a key is
 * missing from the config file, so a metric that exists there and not here is a block this editor
 * writes back incomplete. Adding one is a two-file change on purpose.
 */
const METRIC_GROUPS: MetricGroup[] = [
  {
    title: 'Outcomes',
    description: 'Who died, and how often.',
    metrics: [
      {
        key: 'enemiesDefeated',
        label: 'Enemies defeated',
        shape: 'count',
        description: 'Animate opponents slain. Destructibles are counted separately.',
      },
      {
        key: 'destructiblesDestroyed',
        label: 'Destructibles destroyed',
        shape: 'count',
        description: 'Trees, ore, crates. Kept apart so harvesting does not read as fighting.',
      },
      {
        key: 'alliesDowned',
        label: 'Allies downed',
        shape: 'count',
        description: 'Party members who went down, not counting the player.',
      },
      {
        key: 'numberOfDeaths',
        label: 'Player deaths',
        shape: 'count',
        description: 'Times the player was defeated.',
      },
    ],
  },
  {
    title: 'Offense',
    description: 'What the party dishes out. Items are excluded, since their damage is authored against the item.',
    metrics: [
      {
        key: 'totalDamageDealt',
        label: 'Total damage dealt',
        shape: 'total',
        description: 'Every point of hp damage the party has landed.',
      },
      {
        key: 'highestDamageDealt',
        label: 'Highest damage dealt',
        shape: 'best',
        description: 'The largest single hit ever landed.',
      },
      {
        key: 'numberOfCritsDealt',
        label: 'Criticals landed',
        shape: 'count',
        description: 'Critical hits the party has landed.',
      },
      {
        key: 'biggestCritDealt',
        label: 'Biggest critical landed',
        shape: 'best',
        description: 'The largest single critical ever landed.',
      },
      {
        key: 'attacksEvadedByEnemies',
        label: 'Swings enemies evaded',
        shape: 'count',
        description: 'Accuracy lost against evasion. A high count means picking fights above one\'s level.',
      },
    ],
  },
  {
    title: 'Damage taken',
    description: 'What got through. Counted for any party member, not only the one being controlled.',
    metrics: [
      {
        key: 'totalDamageTaken',
        label: 'Total damage taken',
        shape: 'total',
        description: 'Every point of hp damage the party has absorbed.',
      },
      {
        key: 'highestDamageTaken',
        label: 'Highest damage taken',
        shape: 'best',
        description: 'The largest single hit ever absorbed.',
      },
      {
        key: 'numberOfCritsTaken',
        label: 'Criticals taken',
        shape: 'count',
        description: 'Critical hits that landed on the party.',
      },
      {
        key: 'biggestCritTaken',
        label: 'Biggest critical taken',
        shape: 'best',
        description: 'The largest single critical ever absorbed.',
      },
    ],
  },
  {
    title: 'Mitigation',
    description: 'Everything that made an incoming hit hurt less. Party-wide, matching damage taken.',
    metrics: [
      {
        key: 'numberOfParries',
        label: 'Parries (all kinds)',
        shape: 'count',
        description: 'Fully negated hits, passive and deliberate together. Subtract precise parries for the passive count.',
      },
      {
        key: 'numberOfPreciseParries',
        label: 'Precise parries',
        shape: 'count',
        description: 'Parries earned by holding guard inside the parry window. A subset of the tally above.',
      },
      {
        key: 'numberOfGlancingBlows',
        label: 'Glancing blows',
        shape: 'count',
        description: 'The partial parry: still lands, but for reduced damage.',
      },
      {
        key: 'numberOfGuardedHits',
        label: 'Guarded hits',
        shape: 'count',
        description: 'Hits that landed on someone actively holding guard.',
      },
      {
        key: 'attacksEvadedByParty',
        label: 'Attacks the party evaded',
        shape: 'count',
        description: 'Incoming attacks that never connected.',
      },
      {
        key: 'damagePreventedByGuarding',
        label: 'Damage prevented by guarding',
        shape: 'total',
        description: 'What guarding subtracted from incoming hits. Reads zero for a player who never raised it.',
      },
    ],
  },
  {
    title: 'Usage',
    description: 'Which inputs the player reaches for. The player only, since ally ai acts on its own schedule.',
    metrics: [
      {
        key: 'mainhandSkillUsage',
        label: 'Mainhand usage',
        shape: 'count',
        description: 'Actions executed from the mainhand slot.',
      },
      {
        key: 'offhandSkillUsage',
        label: 'Offhand usage',
        shape: 'count',
        description: 'Actions executed from the offhand slot.',
      },
      {
        key: 'assignedSkillUsage',
        label: 'Assigned skill usage',
        shape: 'count',
        description: 'All four assignable combat slots share this one, since no trophy asks which.',
      },
      {
        key: 'dodgeSkillUsage',
        label: 'Dodge usage',
        shape: 'count',
        description: 'Dodge skill activations.',
      },
      {
        key: 'guardActivations',
        label: 'Guard activations',
        shape: 'count',
        description: 'Times the guard went up, counted on the raise rather than per frame held.',
      },
      {
        key: 'toolUsage',
        label: 'Tool usage',
        shape: 'count',
        description: 'Items consumed from the tool slot. Loot pickups do not count.',
      },
      {
        key: 'usableItemUsage',
        label: 'Usable item usage',
        shape: 'count',
        description: 'Items consumed from the usable item slot.',
      },
    ],
  },
];

/**
 * Finds every variable that more than one metric points at.
 *
 * This is the one mistake worth catching before the file is saved. The game raises nothing when two
 * metrics share a variable- both counters simply climb into the same slot, and every figure derived
 * from either is wrong in a way that looks like a balance problem rather than a config typo.
 *
 * @param metrics The metrics block as it currently stands in the editor.
 * @returns A map of variableId to the metric keys competing for it. Empty when the block is clean.
 */
function findDuplicateVariableIds(metrics: JabsMetricsConfig): Map<number, (keyof JabsMetricsConfig)[]>
{
  const claimants = new Map<number, (keyof JabsMetricsConfig)[]>();

  METRIC_GROUPS.forEach(group =>
  {
    group.metrics.forEach(descriptor =>
    {
      const variableId = metrics[ descriptor.key ];
      const existing = claimants.get(variableId) ?? [];

      existing.push(descriptor.key);
      claimants.set(variableId, existing);
    });
  });

  const duplicates = new Map<number, (keyof JabsMetricsConfig)[]>();

  claimants.forEach((keys, variableId) =>
  {
    // a variable claimed once is the normal case and is not worth reporting.
    if (keys.length < 2)
    {
      return;
    }

    duplicates.set(variableId, keys);
  });

  return duplicates;
}

/**
 * Reports whether a given metric is one of the ones fighting over a variable.
 *
 * Asked per field so the offending inputs can be marked where the mistake was made, rather than only
 * summarized somewhere the user has to go looking for.
 *
 * @param duplicates The result of {@link findDuplicateVariableIds}.
 * @param key The metric being rendered.
 * @param variableId The variable that metric currently points at.
 */
function isDuplicateMetric(
  duplicates: Map<number, (keyof JabsMetricsConfig)[]>,
  key: keyof JabsMetricsConfig,
  variableId: number): boolean
{
  const claimants = duplicates.get(variableId);

  if (claimants === undefined)
  {
    return false;
  }

  return claimants.includes(key);
}

export {
  findDuplicateVariableIds,
  isDuplicateMetric,
  METRIC_GROUPS,
};
export type {
  MetricDescriptor,
  MetricGroup,
  MetricShape,
};

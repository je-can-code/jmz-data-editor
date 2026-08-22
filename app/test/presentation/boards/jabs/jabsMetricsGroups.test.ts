import { describe, expect, it } from 'vitest';
import {
  findDuplicateVariableIds,
  isDuplicateMetric,
  METRIC_GROUPS,
} from '@boards/jabs/jabsMetricsGroups.ts';
import { METRICS_DEFAULTS } from '@core/domain/valueObjects/jabs-config.ts';
import type { JabsMetricsConfig } from '@core/domain/valueObjects/jabs-config.ts';

/**
 * The metrics tab's only real logic: noticing when two metrics have been pointed at one variable.
 *
 * The game raises nothing when that happens. Both counters climb into the same slot, and every
 * figure derived from either reads like a balance problem rather than a config typo - which is why
 * catching it before the file is written is worth a test rather than a glance.
 */
describe('METRIC_GROUPS', () =>
{
  it('presents every metric the config declares, exactly once', () =>
  {
    // Arrange- the plugin throws at boot on a missing key, so a metric absent from the groups is a
    // field the user can never edit and a block this editor writes back incomplete.
    const presented = METRIC_GROUPS.flatMap(group => group.metrics.map(descriptor => descriptor.key));

    // Act
    const declared = Object.keys(METRICS_DEFAULTS);

    // Assert
    expect([ ...presented ].sort())
      .toEqual([ ...declared ].sort());
  });
});

describe('findDuplicateVariableIds', () =>
{
  it('reports nothing for the shipped defaults', () =>
  {
    // Arrange & Act
    const duplicates = findDuplicateVariableIds(METRICS_DEFAULTS);

    // Assert
    expect(duplicates.size)
      .toBe(0);
  });

  it('names both metrics competing for one variable', () =>
  {
    // Arrange- point tool usage at the variable holding enemies defeated.
    const collided: JabsMetricsConfig = {
      ...METRICS_DEFAULTS,
      toolUsage: METRICS_DEFAULTS.enemiesDefeated,
    };

    // Act
    const duplicates = findDuplicateVariableIds(collided);

    // Assert
    expect(duplicates.size)
      .toBe(1);
    expect(duplicates.get(METRICS_DEFAULTS.enemiesDefeated))
      .toEqual([ 'enemiesDefeated', 'toolUsage' ]);
  });

  it('names all three when three metrics land on one variable', () =>
  {
    // Arrange- two colliders rather than one, so "collects every claimant" is distinguishable from
    // "reports the first pair it finds".
    const collided: JabsMetricsConfig = {
      ...METRICS_DEFAULTS,
      toolUsage: METRICS_DEFAULTS.enemiesDefeated,
      usableItemUsage: METRICS_DEFAULTS.enemiesDefeated,
    };

    // Act
    const duplicates = findDuplicateVariableIds(collided);

    // Assert
    expect(duplicates.get(METRICS_DEFAULTS.enemiesDefeated))
      .toEqual([ 'enemiesDefeated', 'toolUsage', 'usableItemUsage' ]);
  });

  it('reports each colliding variable separately', () =>
  {
    // Arrange- two independent collisions, which a single-result implementation would under-report.
    const collided: JabsMetricsConfig = {
      ...METRICS_DEFAULTS,
      toolUsage: METRICS_DEFAULTS.enemiesDefeated,
      guardActivations: METRICS_DEFAULTS.numberOfDeaths,
    };

    // Act
    const duplicates = findDuplicateVariableIds(collided);

    // Assert
    expect(duplicates.size)
      .toBe(2);
  });
});

describe('isDuplicateMetric', () =>
{
  it('marks a metric that is fighting over its variable', () =>
  {
    // Arrange
    const collided: JabsMetricsConfig = {
      ...METRICS_DEFAULTS,
      toolUsage: METRICS_DEFAULTS.enemiesDefeated,
    };
    const duplicates = findDuplicateVariableIds(collided);

    // Act & Assert- both sides of the collision are marked, not only the one that moved.
    expect(isDuplicateMetric(duplicates, 'toolUsage', collided.toolUsage))
      .toBe(true);
    expect(isDuplicateMetric(duplicates, 'enemiesDefeated', collided.enemiesDefeated))
      .toBe(true);
  });

  it('leaves an uninvolved metric unmarked even while a collision exists elsewhere', () =>
  {
    // Arrange- a collision is present, so an implementation that simply reported "any duplicates at
    // all" would mark this field too.
    const collided: JabsMetricsConfig = {
      ...METRICS_DEFAULTS,
      toolUsage: METRICS_DEFAULTS.enemiesDefeated,
    };
    const duplicates = findDuplicateVariableIds(collided);

    // Act & Assert
    expect(isDuplicateMetric(duplicates, 'numberOfDeaths', collided.numberOfDeaths))
      .toBe(false);
  });

  it('leaves every metric unmarked when nothing collides', () =>
  {
    // Arrange
    const duplicates = findDuplicateVariableIds(METRICS_DEFAULTS);

    // Act & Assert
    expect(isDuplicateMetric(duplicates, 'enemiesDefeated', METRICS_DEFAULTS.enemiesDefeated))
      .toBe(false);
  });
});

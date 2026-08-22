import { describe, expect, it } from 'vitest';
import {
  hydrateJabsConfig,
  hydrateMetricsConfig,
  METRICS_DEFAULTS,
} from '@core/domain/valueObjects/jabs-config.ts';

/**
 * The `metrics` block names which game variable holds which combat statistic for J-ABS-Metrics.
 *
 * Two properties matter more than the rest. Every key must survive a round trip, because the board
 * saves whatever hydration returned and a dropped key is erased from the file rather than merely
 * ignored. And a file authored before a metric existed must still open, which is why a partial block
 * is filled rather than refused.
 */
describe('hydrateMetricsConfig', () =>
{
  it('returns the documented defaults when the block is absent', () =>
  {
    // Arrange & Act & Assert
    expect(hydrateMetricsConfig(undefined))
      .toEqual(METRICS_DEFAULTS);
    expect(hydrateMetricsConfig(null))
      .toEqual(METRICS_DEFAULTS);
  });

  it('does not share a reference with METRICS_DEFAULTS', () =>
  {
    // Arrange
    const hydrated = hydrateMetricsConfig(undefined);

    // Act
    hydrated.enemiesDefeated = 999;

    // Assert
    expect(METRICS_DEFAULTS.enemiesDefeated)
      .toBe(61);
  });

  it('keeps every authored value rather than overwriting with a default', () =>
  {
    // Arrange- two keys, so "kept what was authored" is distinguishable from "kept the first one".
    const authored = {
      enemiesDefeated: 300,
      usableItemUsage: 412,
    };

    // Act
    const hydrated = hydrateMetricsConfig(authored);

    // Assert
    expect(hydrated.enemiesDefeated)
      .toBe(300);
    expect(hydrated.usableItemUsage)
      .toBe(412);
  });

  it('fills only the keys the file omitted', () =>
  {
    // Arrange- a file written before glancing blows existed.
    const authored = { enemiesDefeated: 300 };

    // Act
    const hydrated = hydrateMetricsConfig(authored);

    // Assert- the omitted key lands on its default rather than on zero, which would point the metric
    // at variable 0 and record into nothing.
    expect(hydrated.numberOfGlancingBlows)
      .toBe(METRICS_DEFAULTS.numberOfGlancingBlows);
    expect(hydrated.enemiesDefeated)
      .toBe(300);
  });

  it('refuses a value that is not a number, since the game does arithmetic on it', () =>
  {
    // Arrange- a hand-edited file carrying a stringy id, alongside a good key that must survive.
    const corrupt = {
      enemiesDefeated: '61',
      alliesDowned: 300,
    };

    // Act
    const hydrated = hydrateMetricsConfig(corrupt);

    // Assert
    expect(hydrated.enemiesDefeated)
      .toBe(METRICS_DEFAULTS.enemiesDefeated);
    expect(hydrated.alliesDowned)
      .toBe(300);
  });

  it('ignores keys that name no metric', () =>
  {
    // Arrange- a metric removed from the plugin but still sitting in someone's file.
    const stale = {
      enemiesDefeated: 300,
      metricThatNoLongerExists: 999,
    };

    // Act
    const hydrated = hydrateMetricsConfig(stale);

    // Assert
    expect(hydrated)
      .not.toHaveProperty('metricThatNoLongerExists');
    expect(hydrated.enemiesDefeated)
      .toBe(300);
  });
});

describe('hydrateJabsConfig metrics block', () =>
{
  it('carries the metrics block onto the root so a save does not erase it', () =>
  {
    // Arrange- the root hydration is what the board saves back, so a block it forgets is destroyed
    // rather than left alone.
    const raw = {
      teams: [],
      metrics: { enemiesDefeated: 300 },
    };

    // Act
    const hydrated = hydrateJabsConfig(raw);

    // Assert
    expect(hydrated.metrics.enemiesDefeated)
      .toBe(300);
  });

  it('supplies a complete metrics block for a config that has never had one', () =>
  {
    // Arrange
    const raw = { teams: [] };

    // Act
    const hydrated = hydrateJabsConfig(raw);

    // Assert
    expect(hydrated.metrics)
      .toEqual(METRICS_DEFAULTS);
  });
});

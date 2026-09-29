import { describe, expect, it } from 'vitest';
import {
  hydrateAffixEffects,
  hydrateDifficultyConfig,
  hydrateLayer,
  NO_STATE,
} from '@core/domain/valueObjects/difficulty-config.ts';
import type { DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * The Difficulty board edits a small slice of a large record, and the file it writes back is the
 * whole record. That asymmetry is the hazard: a layer carries a state for each side of a fight, access
 * flags, and optional affix biasing, while the board exposes the name and the two states. Anything
 * hydration fails to carry is not "left alone" — it is erased the first time somebody presses save,
 * silently, across every layer at once.
 *
 * So these tests are mostly about preservation rather than defaulting. What must hold:
 *
 *   - every authored field survives a hydrate, including ones no control touches
 *   - an absent affix block stays absent, because "declares nothing" and "declares no change" are
 *     different statements in the file and only one of them was written
 */
describe('hydrateAffixEffects', () =>
{
  it('reports absence rather than inventing an empty block', () =>
  {
    // Arrange - most layers declare no affix effects, and seeding one for them would add a block
    // to every layer in the file on the first save.
    const authored = undefined;

    // Act
    const hydrated = hydrateAffixEffects(authored);

    // Assert
    expect(hydrated)
      .toBeUndefined();
  });

  it('treats an explicit null the same as an absent block', () =>
  {
    // Arrange
    const authored = null;

    // Act
    const hydrated = hydrateAffixEffects(authored);

    // Assert
    expect(hydrated)
      .toBeUndefined();
  });

  it('carries an authored block through unchanged', () =>
  {
    // Arrange
    const authored = {
      prefixChance: 150,
      flatten: 40,
    };

    // Act
    const hydrated = hydrateAffixEffects(authored);

    // Assert - suffixChance stays absent rather than being defaulted to 100, because an omitted
    // field and a field written as 100 mean the same thing to the plugin but not to the file.
    expect(hydrated?.prefixChance)
      .toBe(150);
    expect(hydrated?.flatten)
      .toBe(40);
    expect(hydrated?.suffixChance)
      .toBeUndefined();
  });

  it('normalizes grant ids and weights to numbers', () =>
  {
    // Arrange - two grants rather than one, so "converted the list" and "converted its head" differ.
    const authored = {
      grants: [
        {
          stateId: 306,
          weight: 50,
        },
        {
          stateId: 307,
          weight: 25,
        },
      ],
    };

    // Act
    const hydrated = hydrateAffixEffects(authored);

    // Assert
    expect(hydrated?.grants)
      .toEqual([
        {
          stateId: 306,
          weight: 50,
        },
        {
          stateId: 307,
          weight: 25,
        },
      ]);
  });

  it('leaves grants absent when a block declares only chances', () =>
  {
    // Arrange - a block may bias rates without unlocking anything.
    const authored = { prefixChance: 150 };

    // Act
    const hydrated = hydrateAffixEffects(authored);

    // Assert
    expect(hydrated?.grants)
      .toBeUndefined();
  });
});

describe('hydrateLayer', () =>
{
  it('preserves every authored field, including ones no control edits', () =>
  {
    // Arrange - a complete layer. This is the assertion the whole board rests on: the UI touches
    // a few of these fields and writes back all of them.
    const authored: DifficultyLayer = {
      key: '011_crimson-drive',
      name: 'Bloody Exchange',
      iconIndex: 74,
      description: 'A description|split across lines.',
      cost: 5,
      actorStateId: 501,
      enemyStateId: 502,
      enabled: false,
      unlocked: false,
      hidden: false,
      affixEffects: {
        prefixChance: 150,
        flatten: 40,
        grants: [
          {
            stateId: 306,
            weight: 50,
          },
        ],
      },
    };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert
    expect(hydrated)
      .toEqual(authored);
  });

  it('names a layer by its position when it has no key at all', () =>
  {
    // Arrange - a key is the only field the sidebar can fall back to, so it cannot be empty.
    const authored = { name: 'Nameless' };

    // Act
    const hydrated = hydrateLayer(authored, 3);

    // Assert
    expect(hydrated.key)
      .toBe('layer_3');
  });

  it('treats a missing access flag as off rather than on', () =>
  {
    // Arrange - defaulting `enabled` the other way would silently switch on every layer that
    // never wrote the field.
    const authored = { key: 'a-layer' };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert
    expect(hydrated.enabled)
      .toBe(false);
    expect(hydrated.unlocked)
      .toBe(false);
    expect(hydrated.hidden)
      .toBe(false);
  });

  it('omits the affix block entirely for a layer that declared none', () =>
  {
    // Arrange
    const authored = { key: 'a-layer' };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert - the key must be absent, not present-and-undefined, or it serializes as a null.
    expect(Object.hasOwn(hydrated, 'affixEffects'))
      .toBe(false);
  });

  it('treats a layer that names no states as granting nothing to either side', () =>
  {
    // Arrange
    const authored = { key: 'a-layer' };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert
    expect(hydrated.actorStateId)
      .toBe(NO_STATE);
    expect(hydrated.enemyStateId)
      .toBe(NO_STATE);
  });

  it('reads each side\'s state from its own field', () =>
  {
    // Arrange - different ids on each side, so a swapped read cannot pass.
    const authored = {
      key: 'a-layer',
      actorStateId: '501',
      enemyStateId: '502',
    };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert
    expect(hydrated.actorStateId)
      .toBe(501);
    expect(hydrated.enemyStateId)
      .toBe(502);
  });

  it('drops the retired parameter and reward blocks from an old-shape layer', () =>
  {
    // Arrange - a layer written before the move to states.
    const authored = {
      key: 'old-layer',
      actorEffects: { bparams: [ 80 ] },
      enemyEffects: { bparams: [ 120 ] },
      rewards: { exp: 120 },
    };

    // Act
    const hydrated = hydrateLayer(authored, 0);

    // Assert
    expect(Object.hasOwn(hydrated, 'actorEffects'))
      .toBe(false);
    expect(Object.hasOwn(hydrated, 'rewards'))
      .toBe(false);
  });
});

describe('hydrateDifficultyConfig', () =>
{
  it('hydrates every layer in the file', () =>
  {
    // Arrange - two layers, so "hydrated the list" and "hydrated the first" are distinguishable.
    const authored = [ { key: 'one' }, { key: 'two' } ];

    // Act
    const hydrated = hydrateDifficultyConfig(authored);

    // Assert
    expect(hydrated)
      .toHaveLength(2);
    expect(hydrated[ 1 ].key)
      .toBe('two');
  });

  it('preserves layer order, since a difficulty list is authored in the order it reads', () =>
  {
    // Arrange
    const authored = [ { key: 'c' }, { key: 'a' }, { key: 'b' } ];

    // Act
    const hydrated = hydrateDifficultyConfig(authored);

    // Assert - untouched, not sorted.
    expect(hydrated.map(layer => layer.key))
      .toEqual([ 'c', 'a', 'b' ]);
  });

  it('yields an empty list when the file is not an array', () =>
  {
    // Arrange - the file is a bare array; anything else is unreadable rather than partially usable.
    const authored = { layers: [] };

    // Act
    const hydrated = hydrateDifficultyConfig(authored);

    // Assert
    expect(hydrated)
      .toEqual([]);
  });
});

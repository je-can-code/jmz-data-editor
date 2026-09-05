import { describe, expect, it } from "vitest";
import {
  cloneJuiceDefaults,
  hydrateJabsConfig,
  hydrateJuiceConfig,
  hydrateLootConfig,
  JUICE_DEFAULTS,
  JUICE_PROFILE_KEY_PATTERN,
  LOOT_DEFAULTS,
} from "@core/domain/valueObjects/jabs-config.ts";

/**
 * Editor-side counterpart to the plugin's strict {@code juice} validator. The editor must:
 *
 *   - hydrate a fully populated juice block when {@code config.jabs.json} is missing it entirely
 *     (so the form is editable and can be re-saved as a complete file)
 *   - round-trip every authored leaf without dropping anything
 *   - preserve the {@code default} profile even when the file omits it (the plugin treats default
 *     as mandatory at game load, so the editor seeds it locally to keep the dropdown usable)
 */
describe("hydrateJuiceConfig", () =>
{
  it("returns the documented defaults when rawJuice is undefined / null", () =>
  {
    expect(hydrateJuiceConfig(undefined))
      .toEqual(JUICE_DEFAULTS);
    expect(hydrateJuiceConfig(null))
      .toEqual(JUICE_DEFAULTS);
  });

  it("does not share references with JUICE_DEFAULTS (mutation safety)", () =>
  {
    const hydrated = hydrateJuiceConfig(undefined);

    hydrated.target.physicalSquishIntensity = 999;
    hydrated.profiles[ "default" ]!.tiltMul = 0;

    expect(JUICE_DEFAULTS.target.physicalSquishIntensity)
      .toBe(0.12);
    expect(JUICE_DEFAULTS.profiles[ "default" ]!.tiltMul)
      .toBe(1);
  });

  it("fills only the missing leaves and preserves authored values", () =>
  {
    const partial = {
      target: {
        physicalSquishIntensity: 0.4,
        // intentionally omits magicalSquishIntensity / squishFrames / healingRecipientScale / flurryDecayPercent
      },
      profiles: {
        heavy: {
          tiltMul: 1.5,
          swingMul: 0.7,
        },
      },
    };

    const hydrated = hydrateJuiceConfig(partial);

    expect(hydrated.target.physicalSquishIntensity)
      .toBe(0.4);
    expect(hydrated.target.magicalSquishIntensity)
      .toBe(JUICE_DEFAULTS.target.magicalSquishIntensity);
    expect(hydrated.profiles[ "heavy" ])
      .toEqual({
        tiltMul: 1.5,
        swingMul: 0.7,
      });
    expect(hydrated.profiles[ "default" ])
      .toEqual({
        tiltMul: 1,
        swingMul: 1,
      });
    // caster + casting fully fall back to defaults since the partial omitted them entirely.
    expect(hydrated.caster)
      .toEqual(JUICE_DEFAULTS.caster);
    expect(hydrated.casting)
      .toEqual(JUICE_DEFAULTS.casting);
  });

  it("accepts numeric strings (config authors may quote numbers)", () =>
  {
    const hydrated = hydrateJuiceConfig({
      casting: { pulseAmplitude: "0.05" },
    });

    expect(hydrated.casting.pulseAmplitude)
      .toBe(0.05);
  });

  it("falls back to the documented default when a leaf is non-finite garbage", () =>
  {
    const hydrated = hydrateJuiceConfig({
      caster: {
        strikeTiltRadians: "not a number",
      },
    });

    expect(hydrated.caster.strikeTiltRadians)
      .toBe(JUICE_DEFAULTS.caster.strikeTiltRadians);
  });

  it("normalizes partial profile rows by inserting tiltMul=1 / swingMul=1 fallbacks", () =>
  {
    const hydrated = hydrateJuiceConfig({
      profiles: {
        partial: { tiltMul: 1.4 },
      },
    });

    expect(hydrated.profiles[ "partial" ])
      .toEqual({
        tiltMul: 1.4,
        swingMul: 1,
      });
  });

  it("always materializes a default profile row even when the file lacks one", () =>
  {
    const hydrated = hydrateJuiceConfig({
      profiles: {
        heavy: {
          tiltMul: 1,
          swingMul: 1,
        },
      },
    });

    expect(hydrated.profiles[ "default" ])
      .toEqual({
        tiltMul: 1,
        swingMul: 1,
      });
    expect(Object.keys(hydrated.profiles)
      .sort())
      .toEqual([
        "default",
        "heavy",
      ]);
  });
});

/**
 * The {@code loot} block carries the baseline loot magnet radius J-ABS reads at boot. The hydrator
 * owes callers a complete block whether or not the file authored one, because anything missing from
 * {@link hydrateJabsConfig}'s return is written away the next time the board saves — and the plugin
 * destructures this block without checking, so losing it is a crash on next launch rather than a
 * cosmetic diff.
 */
describe("hydrateLootConfig", () =>
{
  it("returns the documented defaults when rawLoot is undefined / null", () =>
  {
    // Arrange- nothing to arrange; absence is the input under test.

    // Act & Assert
    expect(hydrateLootConfig(undefined))
      .toEqual(LOOT_DEFAULTS);
    expect(hydrateLootConfig(null))
      .toEqual(LOOT_DEFAULTS);
  });

  it("honors an authored numeric radius over the default", () =>
  {
    // Arrange- a value deliberately unequal to the default, so a hydrator that ignored the file
    // entirely would still read as the default and be caught.
    const raw = { magnetRadius: 9 };

    // Act
    const hydrated = hydrateLootConfig(raw);

    // Assert
    expect(hydrated.magnetRadius)
      .toBe(9);
  });

  it("falls back to the default when the authored radius is not a number", () =>
  {
    // Arrange- a corrupt entry; honoring it would hand the game a string to do arithmetic with.
    const raw = { magnetRadius: "eight" };

    // Act
    const hydrated = hydrateLootConfig(raw);

    // Assert
    expect(hydrated.magnetRadius)
      .toBe(LOOT_DEFAULTS.magnetRadius);
  });

  it("does not share references with LOOT_DEFAULTS", () =>
  {
    // Arrange
    const hydrated = hydrateLootConfig(undefined);

    // Act
    hydrated.magnetRadius = 99;

    // Assert
    expect(LOOT_DEFAULTS.magnetRadius)
      .toBe(2);
  });
});

describe("hydrateJabsConfig", () =>
{
  it("returns a complete shape (teams + juice) when raw root is null / undefined", () =>
  {
    const hydrated = hydrateJabsConfig(null);

    expect(hydrated.teams)
      .toEqual([]);
    expect(hydrated.juice)
      .toEqual(JUICE_DEFAULTS);
  });

  it("preserves authored teams while still filling the juice block from defaults", () =>
  {
    const hydrated = hydrateJabsConfig({
      teams: [
        {
          id: 0,
          key: "ALLY",
          name: "Allies",
          opposes: [ 1 ],
        },
        {
          id: 1,
          key: "ENEMY",
          name: "Enemies",
          opposes: [ 0 ],
        },
      ],
    });

    expect(hydrated.teams.length)
      .toBe(2);
    expect(hydrated.teams[ 0 ]!.key)
      .toBe("ALLY");
    expect(hydrated.juice.profiles[ "default" ])
      .toEqual({
        tiltMul: 1,
        swingMul: 1,
      });
  });

  it("keeps the authored food groups", () =>
  {
    // Arrange - the groups are a vocabulary rather than a computed thing, so hydration must pass them through
    // untouched. Anything it fails to carry is erased from disk on the next save.
    const withFoodTypes = {
      teams: [],
      foodTypes: [
        {
          key: "protein",
          name: "Protein",
          iconIndex: 0,
        },
      ],
    };

    // Act
    const hydrated = hydrateJabsConfig(withFoodTypes);

    // Assert
    expect(hydrated.foodTypes)
      .toEqual([
        {
          key: "protein",
          name: "Protein",
          iconIndex: 0,
        },
      ]);
  });

  it("offers no food groups when the file authors none", () =>
  {
    // Arrange - an older file predates the block entirely, and the board has to render against something.
    const withoutFoodTypes = { teams: [] };

    // Act
    const hydrated = hydrateJabsConfig(withoutFoodTypes);

    // Assert
    expect(hydrated.foodTypes)
      .toEqual([]);
  });

  it("drops unrelated top-level keys so saved files stay clean", () =>
  {
    // Arrange
    const withJunk = {
      teams: [],
      extraneous: "should not appear",
    };

    // Act
    const hydrated = hydrateJabsConfig(withJunk);

    // Assert- this list is every block the file is allowed to carry. Dropping unknown keys is the
    // point of the hydrator, but it also means a real block missing from JabsConfigRoot would be
    // erased from disk on the next save, so this assertion is what keeps that from going unnoticed.
    expect(Object.keys(hydrated)
      .sort())
      .toEqual([
        "bosses",
        "foodTypes",
        "juice",
        "loot",
        "metrics",
        "teams",
      ]);
  });

  it("preserves an authored bosses block rather than discarding it", () =>
  {
    // Arrange
    const withBosses = {
      teams: [],
      bosses: [ { key: "gluttonwolf", map: 75 } ],
    };

    // Act
    const hydrated = hydrateJabsConfig(withBosses);

    // Assert
    expect(hydrated.bosses)
      .toHaveLength(1);
    expect(hydrated.bosses[ 0 ].key)
      .toBe("gluttonwolf");
  });

  it("yields an empty bosses block for a config authored before boss fights existed", () =>
  {
    // Arrange
    const legacyConfig = { teams: [] };

    // Act
    const hydrated = hydrateJabsConfig(legacyConfig);

    // Assert
    expect(hydrated.bosses)
      .toEqual([]);
  });
});

describe("cloneJuiceDefaults", () =>
{
  it("returns a fresh object that is structurally equal to JUICE_DEFAULTS", () =>
  {
    const clone = cloneJuiceDefaults();
    expect(clone)
      .toEqual(JUICE_DEFAULTS);
    expect(clone)
      .not
      .toBe(JUICE_DEFAULTS);
    expect(clone.target)
      .not
      .toBe(JUICE_DEFAULTS.target);
    expect(clone.profiles[ "default" ])
      .not
      .toBe(JUICE_DEFAULTS.profiles[ "default" ]);
  });
});

describe("JUICE_PROFILE_KEY_PATTERN", () =>
{
  it("matches the plugin's accepted charset", () =>
  {
    expect(JUICE_PROFILE_KEY_PATTERN.test("default"))
      .toBe(true);
    expect(JUICE_PROFILE_KEY_PATTERN.test("heavy_weapon-1"))
      .toBe(true);
    expect(JUICE_PROFILE_KEY_PATTERN.test("a4"))
      .toBe(true);
  });

  it("rejects spaces and other punctuation", () =>
  {
    expect(JUICE_PROFILE_KEY_PATTERN.test("heavy weapon"))
      .toBe(false);
    expect(JUICE_PROFILE_KEY_PATTERN.test("aff_+=+-f21354"))
      .toBe(false);
    expect(JUICE_PROFILE_KEY_PATTERN.test(""))
      .toBe(false);
  });
});
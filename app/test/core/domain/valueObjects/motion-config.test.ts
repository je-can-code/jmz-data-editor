import { describe, expect, it } from "vitest";
import {
  DEATH_DEFAULTS,
  hydrateDeathConfig,
  hydrateLootConfig,
  hydrateMotionConfig,
  LOOT_DEFAULTS,
  serializeMotionConfig,
} from "@core/domain/valueObjects/motion-config.ts";

/**
 * Editor-side view of `config.motion.json`. The contract it owes callers has two halves.
 *
 * First, nothing may be lost. Whatever a save writes is what the plugins read at boot, and they
 * destructure these blocks without checking, so a motion type the editor failed to carry is not a
 * missing default — it is a crash. That is why motion types are gathered from whatever the file
 * holds rather than from a list: the plugin registry is open-ended, and a list here would silently
 * stop covering anything added to it.
 *
 * Second, what survives a load has to survive a save unchanged. The board edits a grouped shape
 * that does not match the file's flat layout, so hydrate and serialize are inverses and a break in
 * either direction rewrites a file nobody asked to change.
 */
describe("hydrateMotionConfig", () =>
{
  it("gathers motion types from the root while keeping the named sections out of them", () =>
  {
    // Arrange
    const raw = {
      breathe: { amount: 0.05, period: 150 },
      float: { distance: 12, period: 180 },
      death: { defaultStyle: "swift", durations: { swift: 30 } },
      loot: { expiryWarnFrames: 300 },
    };

    // Act
    const hydrated = hydrateMotionConfig(raw);

    // Assert- death and loot are sections, not motion types, and must not appear in both places.
    expect(Object.keys(hydrated.types)
      .sort())
      .toEqual([ "breathe", "float" ]);
  });

  it("carries a motion type it has never heard of", () =>
  {
    // Arrange- the whole reason types are not enumerated. A type registered in the plugins after
    // this file was written still has to round-trip.
    const raw = { wobble: { intensity: 3, period: 90 } };

    // Act
    const hydrated = hydrateMotionConfig(raw);

    // Assert
    expect(hydrated.types[ "wobble" ])
      .toEqual({ intensity: 3, period: 90 });
  });

  it("keeps string parameters alongside numeric ones", () =>
  {
    // Arrange- a handful of types take a named direction, axis or colour, and coercing those to
    // numbers would write NaN into a field the plugin reads as text.
    const raw = { spin: { period: 120, direction: "cw" } };

    // Act
    const hydrated = hydrateMotionConfig(raw);

    // Assert
    expect(hydrated.types[ "spin" ])
      .toEqual({ period: 120, direction: "cw" });
  });

  it("drops a parameter that is neither a number nor a string", () =>
  {
    // Arrange- a corrupt entry beside a valid one, so the valid one surviving proves the block was
    // processed rather than rejected wholesale.
    const raw = { shake: { strength: 4, axis: "x", nested: { bad: true } } };

    // Act
    const hydrated = hydrateMotionConfig(raw);

    // Assert
    expect(hydrated.types[ "shake" ])
      .toEqual({ strength: 4, axis: "x" });
  });

  it("skips a root entry that is not an object at all", () =>
  {
    // Arrange- a stray scalar at the root is not a motion type, and writing one back would hand the
    // plugin something it cannot destructure.
    const raw = {
      breathe: { amount: 0.05 },
      version: 3,
    };

    // Act
    const hydrated = hydrateMotionConfig(raw);

    // Assert
    expect(Object.keys(hydrated.types))
      .toEqual([ "breathe" ]);
  });

  it("returns a complete shape when the file is missing entirely", () =>
  {
    // Arrange- nothing to arrange; absence is the input under test.

    // Act
    const hydrated = hydrateMotionConfig(null);

    // Assert
    expect(hydrated.types)
      .toEqual({});
    expect(hydrated.death)
      .toEqual(DEATH_DEFAULTS);
    expect(hydrated.loot)
      .toEqual(LOOT_DEFAULTS);
  });
});

describe("hydrateDeathConfig", () =>
{
  it("returns the documented defaults when the block is absent", () =>
  {
    // Arrange- nothing to arrange.

    // Act & Assert
    expect(hydrateDeathConfig(undefined))
      .toEqual(DEATH_DEFAULTS);
  });

  it("honors an authored duration over the default", () =>
  {
    // Arrange- a value deliberately unequal to the default.
    const raw = { durations: { swift: 99 } };

    // Act
    const hydrated = hydrateDeathConfig(raw);

    // Assert- the authored style changes while its untouched siblings keep their defaults, which is
    // what proves the merge rather than a wholesale replacement.
    expect(hydrated.durations[ "swift" ])
      .toBe(99);
    expect(hydrated.durations[ "moderate" ])
      .toBe(60);
  });

  it("keeps a style the defaults have never heard of", () =>
  {
    // Arrange- styles are open-ended; the plugin warns about an unknown name rather than refusing
    // it, so the editor must not quietly delete one.
    const raw = { durations: { glacial: 300 } };

    // Act
    const hydrated = hydrateDeathConfig(raw);

    // Assert
    expect(hydrated.durations[ "glacial" ])
      .toBe(300);
  });

  it("falls back to the default when an authored duration is not a number", () =>
  {
    // Arrange- honoring this would hand the game a string to do arithmetic with.
    const raw = { durations: { swift: "quick" } };

    // Act
    const hydrated = hydrateDeathConfig(raw);

    // Assert
    expect(hydrated.durations[ "swift" ])
      .toBe(30);
  });

  it("falls back to the default when the authored default style is not a string", () =>
  {
    // Arrange
    const raw = { defaultStyle: 7 };

    // Act
    const hydrated = hydrateDeathConfig(raw);

    // Assert
    expect(hydrated.defaultStyle)
      .toBe("swift");
  });

  it("does not share references with DEATH_DEFAULTS", () =>
  {
    // Arrange
    const hydrated = hydrateDeathConfig(undefined);

    // Act
    hydrated.durations[ "swift" ] = 999;

    // Assert
    expect(DEATH_DEFAULTS.durations[ "swift" ])
      .toBe(30);
  });
});

describe("hydrateLootConfig", () =>
{
  it("returns the documented defaults when the block is absent", () =>
  {
    // Arrange- nothing to arrange.

    // Act & Assert
    expect(hydrateLootConfig(undefined))
      .toEqual(LOOT_DEFAULTS);
  });

  it("honors authored window widths", () =>
  {
    // Arrange- both deliberately unequal to their defaults.
    const raw = { expiryWarnFrames: 600, expiryFadeFrames: 240 };

    // Act
    const hydrated = hydrateLootConfig(raw);

    // Assert
    expect(hydrated.expiryWarnFrames)
      .toBe(600);
    expect(hydrated.expiryFadeFrames)
      .toBe(240);
  });

  it("fills the untouched half of a partially authored flicker", () =>
  {
    // Arrange- only the minimum is authored, so the other two must come from defaults rather than
    // arriving undefined.
    const raw = { flicker: { min: 0.05 } };

    // Act
    const hydrated = hydrateLootConfig(raw);

    // Assert
    expect(hydrated.flicker)
      .toEqual({ min: 0.05, max: 1.0, interval: 8 });
  });

  it("falls back to the default when an authored value is not a number", () =>
  {
    // Arrange
    const raw = { expiryWarnFrames: "five seconds" };

    // Act
    const hydrated = hydrateLootConfig(raw);

    // Assert
    expect(hydrated.expiryWarnFrames)
      .toBe(300);
  });

  it("does not share references with LOOT_DEFAULTS", () =>
  {
    // Arrange
    const hydrated = hydrateLootConfig(undefined);

    // Act
    hydrated.flicker.min = 0.99;

    // Assert
    expect(LOOT_DEFAULTS.flicker.min)
      .toBe(0.2);
  });
});

describe("serializeMotionConfig", () =>
{
  it("flattens motion types back to the root beside the named sections", () =>
  {
    // Arrange
    const hydrated = hydrateMotionConfig({
      breathe: { amount: 0.05, period: 150 },
      death: { defaultStyle: "swift", durations: { swift: 30 } },
    });

    // Act
    const serialized = serializeMotionConfig(hydrated);

    // Assert- the file's layout has motion types at the root, not nested under a `types` key.
    expect(serialized[ "breathe" ])
      .toEqual({ amount: 0.05, period: 150 });
    expect(serialized[ "types" ])
      .toBeUndefined();
  });

  it("round-trips a complete config without losing or changing anything", () =>
  {
    // Arrange- one entry of each awkward kind: a numeric type, a type carrying a string, an unknown
    // type, and both named sections.
    const original = {
      breathe: { amount: 0.05, period: 150 },
      spin: { period: 120, direction: "cw" },
      wobble: { intensity: 3 },
      death: { defaultStyle: "moderate", durations: { swift: 30, moderate: 60, slow: 120 } },
      loot: {
        expiryWarnFrames: 300,
        expiryFadeFrames: 120,
        flicker: { min: 0.2, max: 1.0, interval: 8 },
      },
    };

    // Act
    const serialized = serializeMotionConfig(hydrateMotionConfig(original));

    // Assert
    expect(serialized)
      .toEqual(original);
  });
});

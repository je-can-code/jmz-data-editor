import { describe, expect, it } from "vitest";
import {
  buildJuiceProfileOptions,
  pickSelectedJuiceProfileOption,
} from "@boards/skills/jabsJuiceProfileOptions.ts";
import type { JuiceProfilesMap } from "@core/domain/valueObjects/jabs-config.ts";

/**
 * Editor-side option builder for the per-skill "Profile key" Autocomplete. Tests cover:
 *
 *   - the deterministic order (None sentinel first, default second, then authored keys)
 *   - the "default" row being injected even when {@code config.jabs.json} forgets it
 *   - orphan keys (skill-authored but missing from {@code juice.profiles}) being appended with a
 *     visible "(not in profiles)" suffix
 *   - the selected-option resolver always landing on a member of the option list
 */
describe("buildJuiceProfileOptions", () =>
{
  const sampleProfiles: JuiceProfilesMap = {
    default: {
      tiltMul: 1,
      swingMul: 1,
    },
    heavy: {
      tiltMul: 1.2,
      swingMul: 0.85,
    },
    dagger: {
      tiltMul: 0.8,
      swingMul: 1.4,
    },
  };

  it("places the None sentinel first and default immediately after", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, null);

    expect(options[ 0 ]!.value)
      .toBe(null);
    expect(options[ 0 ]!.label)
      .toContain("None");
    expect(options[ 1 ]!.value)
      .toBe("default");
  });

  it("emits a default row even when the profiles map omits it", () =>
  {
    const options = buildJuiceProfileOptions(
      {
        heavy: {
          tiltMul: 1.2,
          swingMul: 0.85,
        },
      },
      null
    );

    const values = options.map(o => o.value);
    expect(values)
      .toEqual([
        null,
        "default",
        "heavy",
      ]);
  });

  it("falls back to {None, default} when profiles is null (config still loading)", () =>
  {
    const options = buildJuiceProfileOptions(null, null);

    expect(options.map(o => o.value))
      .toEqual([
        null,
        "default",
      ]);
    expect(options.every(o => o.isOrphan === false))
      .toBe(true);
  });

  it("appends a labeled orphan row when the skill references an unknown profile", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, "legacyKey");
    const orphan = options.find(o => o.value === "legacyKey");

    expect(orphan)
      .toBeDefined();
    expect(orphan!.isOrphan)
      .toBe(true);
    expect(orphan!.label)
      .toBe("legacyKey (not in profiles)");
    // orphan rows go at the end so the canonical profiles stay grouped.
    expect(options[ options.length - 1 ]!.value)
      .toBe("legacyKey");
  });

  it("does not append an orphan row when the current key already matches a known profile", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, "heavy");

    expect(options.filter(o => o.isOrphan)
      .length)
      .toBe(0);
    expect(options.find(o => o.value === "heavy")!.label)
      .toBe("heavy");
  });

  it("treats whitespace-only current keys as null (no orphan row)", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, "   ");

    expect(options.filter(o => o.isOrphan)
      .length)
      .toBe(0);
  });
});

describe("pickSelectedJuiceProfileOption", () =>
{
  const sampleProfiles: JuiceProfilesMap = {
    default: {
      tiltMul: 1,
      swingMul: 1,
    },
    heavy: {
      tiltMul: 1.2,
      swingMul: 0.85,
    },
  };

  it("returns the None sentinel for a null / empty current key", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, null);

    expect(pickSelectedJuiceProfileOption(options, null).value)
      .toBe(null);
    expect(pickSelectedJuiceProfileOption(options, "").value)
      .toBe(null);
    expect(pickSelectedJuiceProfileOption(options, "   ").value)
      .toBe(null);
  });

  it("returns the matching known-row option when present", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, "heavy");
    const picked = pickSelectedJuiceProfileOption(options, "heavy");

    expect(picked.value)
      .toBe("heavy");
    expect(picked.isOrphan)
      .toBe(false);
  });

  it("returns the orphan row for a skill-authored key missing from profiles", () =>
  {
    const options = buildJuiceProfileOptions(sampleProfiles, "legacyKey");
    const picked = pickSelectedJuiceProfileOption(options, "legacyKey");

    expect(picked.value)
      .toBe("legacyKey");
    expect(picked.isOrphan)
      .toBe(true);
    expect(picked.label)
      .toBe("legacyKey (not in profiles)");
  });
});
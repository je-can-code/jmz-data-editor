import type { JuiceProfilesMap } from "@core/domain/valueObjects/jabs-config.ts";

/**
 * Row shape for the juice profile-key Autocomplete on the skill panel. `value === null` is the
 * sentinel "inherit from gear" option (clears {@code SkillJabsExtension.juiceWeaponStyle}); known
 * profile rows carry their own key as both value and label. Orphan rows — keys authored on a skill
 * but missing from {@code config.jabs.json -> juice.profiles} — set {@code isOrphan} so the renderer
 * can append a "(not in profiles)" hint without rewriting the underlying tag.
 */
type JuiceProfileOption = {
  value: string | null;
  label: string;
  isOrphan: boolean;
};

/**
 * Builds the ordered option list for the skill panel's profile-key dropdown.
 *
 *   - The first row is always "None — inherit from gear" with {@code value: null}.
 *   - "default" follows immediately so it is the obvious next choice when overriding.
 *   - The remaining authored profile keys appear in insertion order (skipping "default" if already
 *     present in the map).
 *   - If the skill's current key is non-empty and not in {@code profiles}, an orphan row is appended
 *     so the existing tag remains selectable without silently dropping the value.
 *
 * The "default" row is materialized locally when {@code profiles} omits it; this matches the editor's
 * hydration policy and keeps the dropdown functional even if {@code config.jabs.json} is broken.
 *
 * @param profiles The {@code juice.profiles} map from {@link JabsConfigRoot} (or {@code null} when
 *   the config hasn't finished loading).
 * @param currentKey The skill's current {@code juiceWeaponStyle} value (may be {@code null}).
 */
function buildJuiceProfileOptions(
  profiles: JuiceProfilesMap | null,
  currentKey: string | null
): JuiceProfileOption[]
{
  const knownKeys = profiles === null
    ? []
    : Object.keys(profiles);

  // "default" is mandatory in config.jabs.json; we still hard-include it here so the dropdown is usable
  // even before the file finishes loading (or if a misconfigured file omits it somehow).
  const orderedKnown = knownKeys.includes("default")
    ? [ "default", ...knownKeys.filter(k => k !== "default") ]
    : [ "default", ...knownKeys ];

  const options: JuiceProfileOption[] = [
    {
      value: null,
      label: "None — inherit from gear",
      isOrphan: false,
    },
    ...orderedKnown.map<JuiceProfileOption>(key => (
      {
        value: key,
        label: key,
        isOrphan: false,
      }
    )),
  ];

  // surface skill-authored keys that don't (yet) exist in the profiles map. picking one of these is
  // intentional: the user can keep the legacy tag while they author the matching row in the config
  // board, and the orphan label communicates the mismatch without blocking the work.
  if (currentKey !== null && currentKey.trim() !== "" && orderedKnown.includes(currentKey) === false)
  {
    options.push({
      value: currentKey,
      label: `${currentKey} (not in profiles)`,
      isOrphan: true,
    });
  }

  return options;
}

/**
 * Resolves the option that should be marked selected in the dropdown given the skill's currently
 * authored key. Always returns a member of {@code options} — orphan rows are guaranteed to be present
 * in the list by {@link buildJuiceProfileOptions}.
 *
 * @param options The output of {@link buildJuiceProfileOptions}.
 * @param currentKey The skill's current {@code juiceWeaponStyle} value (may be {@code null}).
 */
function pickSelectedJuiceProfileOption(
  options: JuiceProfileOption[],
  currentKey: string | null
): JuiceProfileOption
{
  if (currentKey === null || currentKey.trim() === "")
  {
    return options[ 0 ]!;
  }

  const match = options.find(opt => opt.value === currentKey);
  if (match !== undefined)
  {
    return match;
  }

  // defensive fallback — buildJuiceProfileOptions appends an orphan row when currentKey is unknown,
  // so this branch should be unreachable in practice. we synthesize a row here only to keep the
  // return type guaranteed-non-null for downstream consumers.
  return {
    value: currentKey,
    label: `${currentKey} (not in profiles)`,
    isOrphan: true,
  };
}

export {
  buildJuiceProfileOptions,
  pickSelectedJuiceProfileOption,
};
export type {
  JuiceProfileOption,
};
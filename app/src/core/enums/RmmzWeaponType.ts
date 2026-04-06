/**
 * RPG Maker MZ skill required weapon indices (`RPG_Skill.requiredWtypeId1` / `requiredWtypeId2`), resolved against
 * {@link Rmmz.System.RPG_System.weaponTypes}. Index {@code 0} is always {@code "None"} in a default project.
 */

type RmmzWeaponTypeOption = {
  value: number;
  label: string;
  group: string;
};

/**
 * @param raw Database value; non-finite or negative values become {@code 0}. Truncated toward zero.
 */
function normalizeRequiredWtypeId(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 0;
  }
  const t = Math.trunc(raw);
  if (t < 0)
  {
    return 0;
  }
  return t;
}

/**
 * @param names From {@code SystemService.weaponTypes}; empty/undefined falls back to a single {@code None} row at index 0.
 */
function effectiveWeaponTypeNames(names: readonly string[] | undefined): string[]
{
  if (names === undefined || names.length === 0)
  {
    return [ 'None' ];
  }
  return [ ...names ];
}

/**
 * Builds one Autocomplete row per system weapon type. Index 0 is grouped as {@code No requirement}; others as {@code Weapon types}.
 */
function weaponTypeOptionsFromNames(names: readonly string[] | undefined): RmmzWeaponTypeOption[]
{
  const list = effectiveWeaponTypeNames(names);
  return list.map((
    label,
    index
  ) =>
  {
    const trimmed = label.trim();
    const display = trimmed === ''
      ? (index === 0
        ? 'None'
        : `Type ${index}`)
      : label;
    return {
      value: index,
      label: display,
      group: index === 0
        ? 'No requirement'
        : 'Weapon types',
    };
  });
}

/**
 * Options for the editor: system rows plus an extra row when {@code wtypeId} is out of range for the current System.json.
 */
function weaponTypeAutocompleteOptions(
  wtypeId: number,
  names: readonly string[] | undefined
): RmmzWeaponTypeOption[]
{
  const base = weaponTypeOptionsFromNames(names);
  const n = base.length;
  if (wtypeId >= 0 && wtypeId < n)
  {
    return base;
  }
  if (Number.isInteger(wtypeId) && wtypeId >= 0)
  {
    return [
      ...base,
      {
        value: wtypeId,
        label: `#${wtypeId} (not in System.json)`,
        group: 'Invalid',
      },
    ];
  }
  return base;
}

/**
 * Controlled Autocomplete value for a required weapon type id.
 */
function weaponTypeOptionForValue(
  wtypeId: number,
  names: readonly string[] | undefined
): RmmzWeaponTypeOption
{
  const opts = weaponTypeAutocompleteOptions(wtypeId, names);
  const found = opts.find((o) => o.value === wtypeId);
  if (found !== undefined)
  {
    return found;
  }
  return opts[ 0 ];
}

export {
  normalizeRequiredWtypeId,
  weaponTypeAutocompleteOptions,
  weaponTypeOptionForValue,
  weaponTypeOptionsFromNames,
};

export type { RmmzWeaponTypeOption };

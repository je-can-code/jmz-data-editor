/**
 * RPG Maker MZ skill type index (`RPG_Skill.stypeId`), resolved against
 * {@link Rmmz.System.RPG_System.skillTypes}. Index {@code 0} is always {@code "None"} in a default project.
 */

type RmmzSkillStypeOption = {
  value: number;
  label: string;
  group: string;
};

/**
 * @param raw Database value; non-finite or negative values become {@code 0}. Truncated toward zero.
 */
function normalizeSkillStypeId(raw: number): number
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
 * @param names From {@code SystemService.skillTypes}; empty/undefined falls back to a single {@code None} row at index 0.
 */
function effectiveSkillTypeNames(names: readonly string[] | undefined): string[]
{
  if (names === undefined || names.length === 0)
  {
    return [ 'None' ];
  }
  return [ ...names ];
}

/**
 * Builds one Autocomplete row per system skill type. Index 0 is grouped as {@code No type}; others as {@code Skill types}.
 */
function skillStypeOptionsFromNames(names: readonly string[] | undefined): RmmzSkillStypeOption[]
{
  const list = effectiveSkillTypeNames(names);
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
        ? 'No type'
        : 'Skill types',
    };
  });
}

/**
 * Options for the editor: system rows plus an extra row when {@code stypeId} is out of range for the current System.json.
 */
function skillStypeAutocompleteOptions(
  stypeId: number,
  names: readonly string[] | undefined
): RmmzSkillStypeOption[]
{
  const base = skillStypeOptionsFromNames(names);
  const n = base.length;
  if (stypeId >= 0 && stypeId < n)
  {
    return base;
  }
  if (Number.isInteger(stypeId) && stypeId >= 0)
  {
    return [
      ...base,
      {
        value: stypeId,
        label: `#${stypeId} (not in System.json)`,
        group: 'Invalid',
      },
    ];
  }
  return base;
}

/**
 * Controlled Autocomplete value for {@code stypeId}.
 */
function skillStypeOptionForValue(
  stypeId: number,
  names: readonly string[] | undefined
): RmmzSkillStypeOption
{
  const opts = skillStypeAutocompleteOptions(stypeId, names);
  const found = opts.find((o) => o.value === stypeId);
  if (found !== undefined)
  {
    return found;
  }
  return opts[ 0 ];
}

export {
  normalizeSkillStypeId,
  skillStypeAutocompleteOptions,
  skillStypeOptionForValue,
  skillStypeOptionsFromNames,
};

export type { RmmzSkillStypeOption };

import RPG_Animation = Rmmz.Implementations.RPG_Animation;

type RmmzSkillAnimationOption = {
  value: number;
  label: string;
  group: string;
  detail: string;
};

/**
 * @param raw Database {@code animationId}; truncated; non-finite becomes {@code 0}. {@code -1} is preserved (weapon default).
 */
function normalizeSkillAnimationId(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 0;
  }
  return Math.trunc(raw);
}

/**
 * Base list: built-in {@code -1} / {@code 0} plus rows from {@code Animations.json} (index 1+).
 */
function buildSkillAnimationAutocompleteOptions(
  raw: readonly (RPG_Animation | null)[] | undefined
): RmmzSkillAnimationOption[]
{
  const out: RmmzSkillAnimationOption[] = [
    {
      value: -1,
      label: 'Weapon Attack',
      group: 'Built-in',
      detail: 'MZ animationId -1',
    },
    {
      value: 0,
      label: 'None',
      group: 'Built-in',
      detail: 'No database animation',
    },
  ];

  if (raw === undefined || raw.length <= 1)
  {
    return out;
  }

  for (let i = 1; i < raw.length; i++)
  {
    const row = raw[ i ];
    if (row === null || typeof row !== 'object')
    {
      continue;
    }
    const id = typeof row.id === 'number'
      ? row.id
      : i;
    const name = typeof row.name === 'string' && row.name.length > 0
      ? row.name
      : `Animation ${id}`;
    out.push({
      value: id,
      label: `${id}: ${name}`,
      group: 'Animations',
      detail: name,
    });
  }

  return out;
}

/**
 * Ensures the current {@code animationId} appears in the list when it is not built-in and not in {@code Animations.json}.
 */
function skillAnimationAutocompleteOptionsForSkill(
  animationId: number,
  base: readonly RmmzSkillAnimationOption[]
): RmmzSkillAnimationOption[]
{
  const normalized = normalizeSkillAnimationId(animationId);
  if (base.some((o) => o.value === normalized))
  {
    return [ ...base ];
  }
  return [
    ...base,
    {
      value: normalized,
      label: `#${normalized} (not in Animations.json)`,
      group: 'Invalid',
      detail: 'Orphan id',
    },
  ];
}

/**
 * Controlled Autocomplete value for {@code animationId}.
 */
function skillAnimationOptionForValue(
  animationId: number,
  base: readonly RmmzSkillAnimationOption[]
): RmmzSkillAnimationOption
{
  const opts = skillAnimationAutocompleteOptionsForSkill(animationId, base);
  const normalized = normalizeSkillAnimationId(animationId);
  const found = opts.find((o) => o.value === normalized);
  if (found !== undefined)
  {
    return found;
  }
  return opts[ 0 ];
}

export {
  buildSkillAnimationAutocompleteOptions,
  normalizeSkillAnimationId,
  skillAnimationAutocompleteOptionsForSkill,
  skillAnimationOptionForValue,
};

export type { RmmzSkillAnimationOption };

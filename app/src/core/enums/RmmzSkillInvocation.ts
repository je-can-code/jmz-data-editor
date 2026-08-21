/**
 * Normalizers for MZ skill invocation fields (speed, success rate, repeats).
 * {@link Rmmz.Core.RPG_UsableItem.tpGain} is stored on the skill domain model as a database field; it is not normalized here.
 */

function normalizeSkillSpeed(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 0;
  }
  return Math.trunc(raw);
}

/**
 * Success rate 0–100 (percent).
 */
function normalizeSkillSuccessRate(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 100;
  }
  const t = Math.trunc(raw);
  if (t < 0)
  {
    return 0;
  }
  if (t > 100)
  {
    return 100;
  }
  return t;
}

/**
 * At least one application per use.
 */
function normalizeSkillRepeats(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 1;
  }
  const t = Math.trunc(raw);
  if (t < 1)
  {
    return 1;
  }
  return t;
}

export {
  normalizeSkillRepeats,
  normalizeSkillSpeed,
  normalizeSkillSuccessRate,
};

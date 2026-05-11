enum JabsAiTrait
{
  Careful = 'careful',
  Executor = 'executor',
  Reckless = 'reckless',
  Tactical = 'tactical',
  Berserker = 'berserker',
  Cleanser = 'cleanser',
  Healer = 'healer',
  Buffer = 'buffer',
}

interface JabsAiTraitsData
{
  careful: boolean;
  executor: boolean;
  reckless: boolean;
  tactical: boolean;
  berserker: boolean;
  cleanser: boolean;
  healer: boolean;
  buffer: boolean;
}

/**
 * Skill-choice AI traits owned by `JABS_EnemyAI` on the plugin side. These flags influence which
 * skill an AI-controlled battler picks during phase 2 of its action loop — they do NOT describe
 * coordination / positioning. Leader / follower / guardian / ward / solo / sentinel live on the
 * companion {@link JabsBattlerRoles} value object because they are battlefield roles, not skill-
 * selection traits.
 *
 * All eight flags are independently toggleable; mutual exclusivity rules live with whatever value
 * object owns the conflicting concept (e.g. leader vs follower lives on roles, not here).
 */
class JabsAiTraits
  implements JabsAiTraitsData
{
  public careful: boolean;
  public executor: boolean;
  public reckless: boolean;
  public tactical: boolean;
  public berserker: boolean;
  public cleanser: boolean;
  public healer: boolean;
  public buffer: boolean;

  constructor(data?: Partial<JabsAiTraitsData>)
  {
    this.careful = data?.careful ?? false;
    this.executor = data?.executor ?? false;
    this.reckless = data?.reckless ?? false;
    this.tactical = data?.tactical ?? false;
    this.berserker = data?.berserker ?? false;
    this.cleanser = data?.cleanser ?? false;
    this.healer = data?.healer ?? false;
    this.buffer = data?.buffer ?? false;
  }

  /**
   * Sets the attack-trait subset from the active-strings array. The three support-trait flags
   * (cleanser / healer / buffer) are left untouched. Use this when the UI is editing only the
   * attack axis — pairs cleanly with {@link setSupportTraits} for the support axis.
   *
   * @param active The array of active attack-trait strings.
   */
  public setAttackTraits(active: string[]): void
  {
    this.careful = active.includes(JabsAiTrait.Careful);
    this.executor = active.includes(JabsAiTrait.Executor);
    this.reckless = active.includes(JabsAiTrait.Reckless);
    this.tactical = active.includes(JabsAiTrait.Tactical);
    this.berserker = active.includes(JabsAiTrait.Berserker);
  }

  /**
   * Sets the support-trait subset from the active-strings array. The five attack-trait flags
   * (careful / executor / reckless / tactical / berserker) are left untouched.
   *
   * @param active The array of active support-trait strings.
   */
  public setSupportTraits(active: string[]): void
  {
    this.cleanser = active.includes(JabsAiTrait.Cleanser);
    this.healer = active.includes(JabsAiTrait.Healer);
    this.buffer = active.includes(JabsAiTrait.Buffer);
  }

  /**
   * Synchronizes all eight boolean properties from a single array of active trait strings.
   * Convenience wrapper that delegates to {@link setAttackTraits} and {@link setSupportTraits}
   * for callers that have a flat list of active flags rather than a per-axis view.
   *
   * @param newTraits The full array of active trait strings across both axes.
   */
  public updateFromStrings(newTraits: string[]): void
  {
    this.setAttackTraits(newTraits);
    this.setSupportTraits(newTraits);
  }
}

/**
 * The five attack-axis traits, in canonical display order. Mirrors the plugin's
 * `//region attack traits` grouping in `JABS_EnemyAI.js` so the editor's row layout matches
 * the source's mental model.
 */
const JabsAttackTraits: ReadonlyArray<JabsAiTrait> = [
  JabsAiTrait.Careful,
  JabsAiTrait.Executor,
  JabsAiTrait.Reckless,
  JabsAiTrait.Tactical,
  JabsAiTrait.Berserker,
];

/**
 * The three support-axis traits, in canonical display order. Mirrors the plugin's
 * `//region support traits` grouping in `JABS_EnemyAI.js`. `decideAction` consults these
 * priority-first (cleanser -> healer -> buffer) before the attack layer.
 */
const JabsSupportTraits: ReadonlyArray<JabsAiTrait> = [
  JabsAiTrait.Cleanser,
  JabsAiTrait.Healer,
  JabsAiTrait.Buffer,
];

/**
 * Authoring-time descriptions for each AI trait. Sourced from the behavior in
 * `JABS_EnemyAI.decideAction` and the support/attack helpers it delegates to — not just the
 * JSDoc — so the editor's tooltip copy matches what the plugin actually does at runtime.
 *
 * Priority order inside `decideAction` (for reference, since stacking traits is allowed):
 *   support layer (cleanser -> healer -> buffer) -> berserker (if HP threshold met) ->
 *   attack layer (careful + executor + tactical applied in sequence) -> generic random.
 *
 * Surfaced in the trait chip-row tooltips on the Enemies board.
 */
const JabsAiTraitDescriptions: Record<JabsAiTrait, string> = {
  [JabsAiTrait.Careful]: `Avoids skills the target resists or is immune to (element rate below 100%). \
When this battler is leading followers and healing, picks the closest-fit heal rather than the \
biggest one and reacts at a 40% HP threshold instead of waiting for catastrophic damage.`,
  [JabsAiTrait.Executor]: `Narrows the candidate pool to the single most elementally effective \
skill against the target. Hard-focuses weakness exploitation.`,
  [JabsAiTrait.Reckless]: `Always casts a skill instead of falling back to basic attacks. When \
healing, widens the activation threshold to 90% HP (vs the default 60%) and always picks the \
biggest heal regardless of how much HP the ally is actually missing.`,
  [JabsAiTrait.Tactical]: `Prefers skills that apply negative states to the target. Falls \
through to normal selection when no status-applying skills are available.`,
  [JabsAiTrait.Berserker]: `When this battler's HP drops to 30% or below, abandons normal \
strategy and uses the single highest-damage skill available (factoring in crit projections). \
Ignores battle memories.`,
  [JabsAiTrait.Cleanser]: `Scans nearby allies for negative states and prioritizes cleansing \
them before attacking. Falls through to the next priority layer when no allies need cleansing.`,
  [JabsAiTrait.Healer]: `Scans nearby allies for low HP and prioritizes healing them before \
attacking. Default activation threshold is 60% HP (90% if also Reckless). Falls through when \
allies are healthy.`,
  [JabsAiTrait.Buffer]: `Scans nearby allies for missing positive states and prioritizes \
buffing them before attacking. Falls through when no buffs are needed.`,
};

export {
  JabsAiTrait,
  JabsAiTraits,
  JabsAiTraitsData,
  JabsAiTraitDescriptions,
  JabsAttackTraits,
  JabsSupportTraits
};
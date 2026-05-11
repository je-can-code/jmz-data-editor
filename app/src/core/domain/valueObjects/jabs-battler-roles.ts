enum JabsBattlerRole
{
  Leader = 'leader',
  Follower = 'follower',
  Guardian = 'guardian',
  Ward = 'ward',
  Solo = 'solo',
  Sentinel = 'sentinel',
}

/**
 * The coordination axis owns the leader vs follower mutual-exclusion pair. `null` is the
 * explicit "neither" state used by the tri-state segmented control in the UI.
 */
type JabsCoordinationRole = JabsBattlerRole.Leader | JabsBattlerRole.Follower;

/**
 * The protection axis owns the guardian vs ward mutual-exclusion pair. `null` is the explicit
 * "neither" state — a battler cannot protect itself, so the guardian/ward relationship is
 * always between two distinct battlers.
 */
type JabsProtectionRole = JabsBattlerRole.Guardian | JabsBattlerRole.Ward;

interface JabsBattlerRolesData
{
  leader: boolean;
  follower: boolean;
  guardian: boolean;
  ward: boolean;
  solo: boolean;
  sentinel: boolean;
}

/**
 * Battlefield-coordination roles owned by `JABS_BattlerRole` on the plugin side. The six flags
 * decompose into three distinct axes:
 *
 *   1. Coordination (leader / follower) — mutually exclusive. A battler either coordinates
 *      nearby followers OR defers to a leader; the plugin's leader-draft filter excludes any
 *      battler tagged as both.
 *   2. Protection (guardian / ward) — mutually exclusive. A guardian scans **allied** wards and
 *      redirects to their attackers; a battler can't protect itself, so being both is a
 *      runtime no-op and the editor enforces the exclusion as a data-model invariant.
 *   3. Modifiers (solo / sentinel) — orthogonal. Solo is the master opt-out from coordination
 *      (the plugin's runtime filter respects "Solo wins" regardless of the other flags);
 *      sentinel is a standalone hold-position flag.
 *
 * Canonical notetag is `<aiRole: X>`. Legacy `<aiTrait: leader>` / `<aiTrait: follower>` tags
 * hydrate the corresponding flags on read and get migrated to canonical form on save (see
 * `JabsDataParser`).
 */
class JabsBattlerRoles
  implements JabsBattlerRolesData
{
  public leader: boolean;
  public follower: boolean;
  public guardian: boolean;
  public ward: boolean;
  public solo: boolean;
  public sentinel: boolean;

  constructor(data?: Partial<JabsBattlerRolesData>)
  {
    this.leader = data?.leader ?? false;
    this.follower = data?.follower ?? false;
    this.guardian = data?.guardian ?? false;
    this.ward = data?.ward ?? false;
    this.solo = data?.solo ?? false;
    this.sentinel = data?.sentinel ?? false;
  }

  /**
   * Sets the coordination axis. Selecting either role always clears the other, since the plugin's
   * leader-draft filter silently excludes battlers tagged as both. Pass `null` for the explicit
   * "neither" state.
   *
   * @param role The role to set, or null to clear both.
   */
  public setCoordination(role: JabsCoordinationRole | null): void
  {
    this.leader = role === JabsBattlerRole.Leader;
    this.follower = role === JabsBattlerRole.Follower;
  }

  /**
   * Sets the protection axis. Selecting either role always clears the other — a battler cannot
   * simultaneously protect a ward and be protected as one. Pass `null` for the "neither" state.
   *
   * @param role The role to set, or null to clear both.
   */
  public setProtection(role: JabsProtectionRole | null): void
  {
    this.guardian = role === JabsBattlerRole.Guardian;
    this.ward = role === JabsBattlerRole.Ward;
  }

  /**
   * Toggles the solo opt-out modifier. Independent of the other roles at the value-object layer
   * — the plugin's runtime coordination filter respects "Solo wins" regardless of any other
   * flag, so this layer does not auto-clear the pairs and the author can save whatever
   * combination they like.
   *
   * @param active Whether solo should be on.
   */
  public setSolo(active: boolean): void
  {
    this.solo = active;
  }

  /**
   * Toggles the sentinel hold-position modifier. Fully orthogonal to the other five flags.
   *
   * @param active Whether sentinel should be on.
   */
  public setSentinel(active: boolean): void
  {
    this.sentinel = active;
  }

  /**
   * Derives the current coordination axis value from the boolean flags. Returns `null` when
   * neither leader nor follower is set — the "neither" state used by the UI segmented control.
   */
  public getCoordination(): JabsCoordinationRole | null
  {
    if (this.leader)
    {
      return JabsBattlerRole.Leader;
    }
    if (this.follower)
    {
      return JabsBattlerRole.Follower;
    }
    return null;
  }

  /**
   * Derives the current protection axis value from the boolean flags. Returns `null` when
   * neither guardian nor ward is set.
   */
  public getProtection(): JabsProtectionRole | null
  {
    if (this.guardian)
    {
      return JabsBattlerRole.Guardian;
    }
    if (this.ward)
    {
      return JabsBattlerRole.Ward;
    }
    return null;
  }
}

/**
 * Authoring-time descriptions for each battler role. Sourced from the runtime behavior in
 * `JABS_AiManager` (the leader-draft filter, `applyGuardianTargeting`, `getGuardianWardAttacker`,
 * `hasSentinelTargetExceededHomeRange`, etc.) — not just the JSDoc — so the tooltip copy matches
 * what the plugin actually does at runtime.
 *
 * Surfaced in the role segmented-control tooltips on the Enemies board.
 */
const JabsBattlerRoleDescriptions: Record<JabsBattlerRole, string> = {
  [JabsBattlerRole.Leader]: `Coordinates nearby followers within pursuit range and decides \
their skill choices each turn. Leaders themselves cannot be led by another leader.`,
  [JabsBattlerRole.Follower]: `Defers skill selection to a nearby leader. When no leader is \
engaged on the map, idles on basic attacks instead of acting independently.`,
  [JabsBattlerRole.Guardian]: `Scans for nearby allied Wards under attack and redirects this \
battler's target to their attacker. Will proactively engage threats to Wards even when idle. \
Scan range uses the explicit <guardRange> notetag if set, otherwise the sight radius.`,
  [JabsBattlerRole.Ward]: `Marks this battler as a protection target. Nearby Guardians \
redirect to whoever is attacking this Ward. The Ward itself has no special behavior — it is \
the signal Guardians react to.`,
  [JabsBattlerRole.Solo]: `Explicitly opts out of coordination — this battler is never drafted \
as a follower by any leader and ignores leader directives at runtime, regardless of other \
roles set.`,
  [JabsBattlerRole.Sentinel]: `Holds home position — disengages and returns home when the \
target moves beyond pursuit range from this battler's spawn point. Stays engaged while the \
target retreats within normal chase distance. Useful for stationary guard duty.`,
};

/**
 * Description for the "None" pill on the Coordination tri-state segmented control.
 */
const JabsCoordinationAxisNoneDescription = `No coordination role on this battler. \
Acts independently — neither leads followers nor defers to a leader.`;

/**
 * Description for the "None" pill on the Protection tri-state segmented control.
 */
const JabsProtectionAxisNoneDescription = `No protection role on this battler. \
Neither protects Wards nor is protected by Guardians.`;

export {
  JabsBattlerRole,
  JabsBattlerRoles,
  JabsBattlerRolesData,
  JabsCoordinationRole,
  JabsProtectionRole,
  JabsBattlerRoleDescriptions,
  JabsCoordinationAxisNoneDescription,
  JabsProtectionAxisNoneDescription
};
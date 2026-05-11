import { NoteNormalizer } from '../utils/NoteNormalizer.ts';
import { JabsAiTrait, JabsAiTraits } from '@core/domain/valueObjects/jabs-ai-traits.ts';
import { JabsBattlerRole, JabsBattlerRoles } from '@core/domain/valueObjects/jabs-battler-roles.ts';
import { EnemyJabsBattlerModel, JabsBattlerData } from '@core/domain/valueObjects/jabs-battler-data.ts';
import { JabsConfig, JabsConfigs } from '@core/domain/valueObjects/jabs-configs.ts';

class JabsDataParser
{
  // canonical AI trait names (skill-choice). matches the 8 flags owned by JABS_EnemyAI.
  static #aiTraitRegex = /<aiTrait: ?(careful|executor|reckless|tactical|berserker|cleanser|healer|buffer)>/i;
  // wide strip regex used on save to scrub ALL <aiTrait:*> lines — including the legacy
  // <aiTrait:leader> / <aiTrait:follower> aliases that now map to roles. running this before
  // writeBattlerRoles is what migrates a legacy note to the canonical <aiRole:*> form.
  static #aiTraitStripRegex = /<aiTrait: ?[A-Za-z]+>/i;
  // canonical battler-role names (coordination). matches the 6 flags owned by JABS_BattlerRole.
  static #aiRoleRegex = /<aiRole: ?(leader|follower|guardian|ward|solo|sentinel)>/i;
  // legacy aliases retained for hydrate-only: the plugin source still parses these for back-compat
  // but the editor always writes the canonical <aiRole:*> form, so reading <aiTrait:leader> off
  // disk and writing <aiRole:leader> back is a one-way migration each time an enemy is saved.
  static #legacyRoleAliasRegex = /<aiTrait: ?(leader|follower)>/i;
  // strip regex for <aiRole:*> lines on save.
  static #aiRoleStripRegex = /<aiRole: ?[A-Za-z]+>/i;
  static #configRegex = /<jabsConfig: ?(noIdle|canIdle|noHpBar|showHpBar|inanimate|notInanimate|invincible|notInvincible|noName|showName)>/i;
  static #teamIdRegex = /<teamId: ?(\d+)>/i;
  static #sightRegex = /<sight: ?(\d+)>/i;
  static #pursuitRegex = /<pursuit: ?(\d+)>/i;
  static #prepareSpeedRegex = /<prepare: ?(\d+)>/i;
  static #alertDurationRegex = /<alertDuration: ?(\d+)>/i;
  static #alertSightBoostRegex = /<alertedSightBoost: ?(\d+)>/i;
  static #alertPursuitBoostRegex = /<alertedPursuitBoost: ?(\d+)>/i;

  static readAiTraits(originalNote: string): JabsAiTraits
  {
    const traits = new JabsAiTraits(); // Initialized with defaults (false)
    const lines = NoteNormalizer.normalize(originalNote)
      .split('\n');

    lines.forEach(line =>
    {
      this.#aiTraitRegex.lastIndex = 0;
      const match = this.#aiTraitRegex.exec(line);
      if (match)
      {
        const [ , traitName ] = match;
        if (traitName)
        {
          const key = traitName.toLowerCase();
          // Directly set properties on the class instance
          if (key in traits)
          {
            (
              traits as any
            )[ key ] = true;
          }
        }
      }
    });

    return traits;
  }

  static writeAiTraits(
    originalNote: string,
    traits: JabsAiTraits
  ): string
  {
    // strip ALL <aiTrait:*> lines (including legacy leader/follower aliases). this is the half
    // of the legacy migration owned by the trait writer; writeBattlerRoles owns the other half
    // by emitting the canonical <aiRole:*> replacements. order matters in syncNote: traits
    // must be written BEFORE roles, otherwise the role writer's strip would not remove legacy
    // <aiTrait:leader>/<aiTrait:follower> lines.
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#aiTraitStripRegex);

    // build trait lines in deterministic order, matching the enum declaration order.
    const traitLines: string[] = [];
    if (traits.careful)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Careful));
    }
    if (traits.executor)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Executor));
    }
    if (traits.reckless)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Reckless));
    }
    if (traits.tactical)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Tactical));
    }
    if (traits.berserker)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Berserker));
    }
    if (traits.cleanser)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Cleanser));
    }
    if (traits.healer)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Healer));
    }
    if (traits.buffer)
    {
      traitLines.push(this.#aiTraitKey(JabsAiTrait.Buffer));
    }

    // if none enabled, return the cleaned base as-is.
    if (traitLines.length === 0)
    {
      return base;
    }

    // append trait lines as a single block with normalized joining.
    const block = traitLines.join('\n');
    return NoteNormalizer.appendBlock(base, block);
  }

  static readBattlerRoles(originalNote: string): JabsBattlerRoles
  {
    const roles = new JabsBattlerRoles();
    const lines = NoteNormalizer.normalize(originalNote)
      .split('\n');

    lines.forEach(line =>
    {
      // first try the canonical <aiRole:X> form.
      this.#aiRoleRegex.lastIndex = 0;
      const roleMatch = this.#aiRoleRegex.exec(line);
      if (roleMatch)
      {
        const [ , roleName ] = roleMatch;
        if (roleName)
        {
          const key = roleName.toLowerCase();
          if (key in roles)
          {
            (
              roles as any
            )[ key ] = true;
          }
        }
        // line consumed by the canonical match — do not fall through to legacy.
        return;
      }

      // fall through to the legacy <aiTrait:leader>/<aiTrait:follower> aliases. these still hydrate
      // roles, because the plugin source explicitly retains them as back-compat, but writeAiTraits
      // strips them on save so a round-trip will normalize them to <aiRole:*>.
      this.#legacyRoleAliasRegex.lastIndex = 0;
      const legacyMatch = this.#legacyRoleAliasRegex.exec(line);
      if (legacyMatch)
      {
        const [ , legacyRoleName ] = legacyMatch;
        if (legacyRoleName)
        {
          const key = legacyRoleName.toLowerCase();
          if (key in roles)
          {
            (
              roles as any
            )[ key ] = true;
          }
        }
      }
    });

    return roles;
  }

  static writeBattlerRoles(
    originalNote: string,
    roles: JabsBattlerRoles
  ): string
  {
    // strip ALL <aiRole:*> lines. legacy <aiTrait:leader>/<aiTrait:follower> lines were already
    // scrubbed by writeAiTraits earlier in the syncNote sequence, so no second pass is needed
    // here.
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#aiRoleStripRegex);

    // build role lines in deterministic order, matching the enum declaration order.
    const roleLines: string[] = [];
    if (roles.leader)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Leader));
    }
    if (roles.follower)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Follower));
    }
    if (roles.guardian)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Guardian));
    }
    if (roles.ward)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Ward));
    }
    if (roles.solo)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Solo));
    }
    if (roles.sentinel)
    {
      roleLines.push(this.#aiRoleKey(JabsBattlerRole.Sentinel));
    }

    // if none enabled, return the cleaned base as-is.
    if (roleLines.length === 0)
    {
      return base;
    }

    const block = roleLines.join('\n');
    return NoteNormalizer.appendBlock(base, block);
  }

  static readBattlerData(originalNote: string): JabsBattlerData
  {
    const battlerData = new EnemyJabsBattlerModel();
    const lines = NoteNormalizer.normalize(originalNote)
      .split('\n');

    lines.forEach(line =>
    {
      // Sight
      this.#sightRegex.lastIndex = 0;
      let match = this.#sightRegex.exec(line);
      if (match)
      {
        battlerData.sight = Number(match[ 1 ]);
      }

      // Pursuit
      this.#pursuitRegex.lastIndex = 0;
      match = this.#pursuitRegex.exec(line);
      if (match)
      {
        battlerData.pursuit = Number(match[ 1 ]);
      }

      // Prepare Speed
      this.#prepareSpeedRegex.lastIndex = 0;
      match = this.#prepareSpeedRegex.exec(line);
      if (match)
      {
        battlerData.prepareSpeed = Number(match[ 1 ]);
      }

      // Alert Duration
      this.#alertDurationRegex.lastIndex = 0;
      match = this.#alertDurationRegex.exec(line);
      if (match)
      {
        battlerData.alertDuration = Number(match[ 1 ]);
      }

      // Alerted Sight Boost
      this.#alertSightBoostRegex.lastIndex = 0;
      match = this.#alertSightBoostRegex.exec(line);
      if (match)
      {
        battlerData.alertSightBoost = Number(match[ 1 ]);
      }

      // Alerted Pursuit Boost
      this.#alertPursuitBoostRegex.lastIndex = 0;
      match = this.#alertPursuitBoostRegex.exec(line);
      if (match)
      {
        battlerData.alertPursuitBoost = Number(match[ 1 ]);
      }
    });

    return battlerData;
  }

  static writeBattlerData(
    originalNote: string,
    jabsBattlerData: JabsBattlerData
  ): string
  {
    // Match any battler-data line.
    const battlerLineRegex = /<(sight|pursuit|prepare|alertDuration|alertedSightBoost|alertedPursuitBoost): ?\d+>/i;

    // Remove existing battler lines and normalize.
    const base = NoteNormalizer.removeLinesMatching(originalNote, battlerLineRegex);

    // Build new lines in deterministic order (only if > 0).
    const battlerDataLines: string[] = [];
    if (jabsBattlerData.sight > 0)
    {
      battlerDataLines.push(`<sight:${jabsBattlerData.sight}>`);
    }
    if (jabsBattlerData.pursuit > 0)
    {
      battlerDataLines.push(`<pursuit:${jabsBattlerData.pursuit}>`);
    }
    if (jabsBattlerData.prepareSpeed > 0)
    {
      battlerDataLines.push(`<prepare:${jabsBattlerData.prepareSpeed}>`);
    }
    if (jabsBattlerData.alertDuration > 0)
    {
      battlerDataLines.push(`<alertDuration:${jabsBattlerData.alertDuration}>`);
    }
    if (jabsBattlerData.alertSightBoost
      > 0)
    {
      battlerDataLines.push(`<alertedSightBoost:${jabsBattlerData.alertSightBoost}>`);
    }
    if (jabsBattlerData.alertPursuitBoost
      > 0)
    {
      battlerDataLines.push(`<alertedPursuitBoost:${jabsBattlerData.alertPursuitBoost}>`);
    }

    if (battlerDataLines.length === 0)
    {
      // Nothing to write; return the cleaned base.
      return base;
    }

    // Append as a normalized block (LF-only, no extra gaps).
    const block = battlerDataLines.join('\n');
    return NoteNormalizer.appendBlock(base, block);
  }

  static readTeamId(originalNote: string): number | null
  {
    const lines = NoteNormalizer.normalize(originalNote)
      .split('\n');

    let teamId: number | null = null;
    lines.forEach(line =>
    {
      this.#teamIdRegex.lastIndex = 0;
      const match = this.#teamIdRegex.exec(line);
      if (match)
      {
        const parsed = Number(match[ 1 ]);
        teamId = Number.isFinite(parsed) ? parsed : null;
      }
    });

    return teamId;
  }

  static writeTeamId(
    originalNote: string,
    teamId: number | null
  ): string
  {
    // strip any existing teamId tag.
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#teamIdRegex);

    // omit the tag when null to preserve engine/plugin defaults.
    if (teamId === null)
    {
      return base;
    }

    // append the new tag.
    const tag = `<teamId:${teamId}>`;
    return NoteNormalizer.appendBlock(base, tag);
  }

  static readConfigs(originalNote: string): JabsConfigs
  {
    // Initialize all configs as false by default
    const configs = new JabsConfigs();

    // Map lowercased capture → actual camelCase key
    const keyMap: Record<string, keyof JabsConfigs> = {
      noidle: 'noIdle',
      canidle: 'canIdle',
      nohpbar: 'noHpBar',
      showhpbar: 'showHpBar',
      inanimate: 'inanimate',
      notinanimate: 'notInanimate',
      invincible: 'invincible',
      notinvincible: 'notInvincible',
      noname: 'noName',
      showname: 'showName',
    };

    // Normalize newlines to LF then split
    const lines = NoteNormalizer.normalize(originalNote)
      .split('\n');

    // Check each line for configs
    lines.forEach(line =>
    {
      this.#configRegex.lastIndex = 0;

      const match = this.#configRegex.exec(line);
      if (match)
      {
        const [ , configName ] = match;
        if (configName)
        {
          const lc = configName.toLowerCase();
          const mapped = keyMap[ lc ];
          if (mapped)
          {
            (configs as any)[ mapped ] = true;
          }
        }
      }
    });

    return configs;
  }

  static writeConfigs(
    originalNote: string,
    configs: JabsConfigs
  ): string
  {
    // Remove all existing config lines and get a normalized base
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#configRegex);

    // Build new config lines in deterministic order
    const configLines: string[] = [];
    if (configs.noIdle)
    {
      configLines.push(this.#configKey(JabsConfig.NoIdle));
    }
    if (configs.canIdle)
    {
      configLines.push(this.#configKey(JabsConfig.CanIdle));
    }
    if (configs.noHpBar)
    {
      configLines.push(this.#configKey(JabsConfig.NoHpBar));
    }
    if (configs.showHpBar)
    {
      configLines.push(this.#configKey(JabsConfig.ShowHpBar));
    }
    if (configs.inanimate)
    {
      configLines.push(this.#configKey(JabsConfig.Inanimate));
    }
    if (configs.notInanimate)
    {
      configLines.push(this.#configKey(JabsConfig.NotInanimate));
    }
    if (configs.invincible)
    {
      configLines.push(this.#configKey(JabsConfig.Invincible));
    }
    if (configs.notInvincible)
    {
      configLines.push(this.#configKey(JabsConfig.NotInvincible));
    }
    if (configs.noName)
    {
      configLines.push(this.#configKey(JabsConfig.NoName));
    }
    if (configs.showName)
    {
      configLines.push(this.#configKey(JabsConfig.ShowName));
    }

    if (configLines.length === 0)
    {
      return base; // nothing to add
    }

    return NoteNormalizer.appendBlock(base, configLines.join('\n'));
  }

  static #aiTraitKey = (trait: JabsAiTrait) => `<aiTrait:${trait}>`;

  static #aiRoleKey = (role: JabsBattlerRole) => `<aiRole:${role}>`;

  static #configKey = (config: JabsConfig) => `<jabsConfig:${config}>`;
}


export { JabsDataParser };

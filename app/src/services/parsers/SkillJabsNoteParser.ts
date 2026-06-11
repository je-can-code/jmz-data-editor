import type { SkillJabsExtension } from '@core/domain/entities/jabs/SkillJabsExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Single place for all JABS {@code ON SKILLS} notetag read/write (mirrors {@code J.ABS.RegExp} in JABS).
 */
class SkillJabsNoteParser
{
  // Same patterns as J.ABS RegExp (initialization.js), order preserved for writes.
  static readonly #RE_ACTION_ID = /<actionId:[ ]?(\d+)>/gi;

  static readonly #RE_HIDE_MENU = /<hideFromJabsMenu>/gi;

  static readonly #RE_CAST_TIME = /<castTime:[ ]?(\d+)>/gi;

  static readonly #RE_CAST_ANIM = /<castAnimation:[ ]?(\d+)>/gi;

  static readonly #RE_COOLDOWN = /<cooldown:[ ]?(\d+)>/gi;

  static readonly #RE_UNIQUE_COOLDOWN = /<uniqueCooldown>/gi;

  static readonly #RE_OGCD = /<ogcd>/gi;

  static readonly #RE_GLOBAL_COOLDOWN_FRAMES = /<gcd:[ ]?(\d+)>/gi;

  static readonly #RE_DEGREES = /<degrees:[ ]?(\d+)>/gi;

  static readonly #RE_RADIUS = /<radius:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_HITBOX = /<hitbox:[ ]?(circle|rhombus|square|frontsquare|line|arc|wall|cross)>/gi;

  static readonly #RE_PROJECTILE = /<projectile:[ ]?(\d+)>/gi;

  static readonly #RE_FORMATION = /<formation:[ ]?(line|spray|cross|xburst|nova)>/gi;

  static readonly #RE_THICKNESS = /<thickness:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_DIRECT = /<direct>/i;

  static readonly #RE_DIRECT_LOCK = /<directLock>/i;

  static readonly #RE_PROXIMITY = /<proximity:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_DURATION = /<duration:[ ]?(\d+)>/gi;

  static readonly #RE_KNOCKBACK = /<knockback:[ ]?(\d+)>/gi;

  static readonly #RE_DELAY = /<delay:[ ]?(\[-?\d+,[ ]?(true|false)(?:,[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?))?])>/gi;

  static readonly #RE_LINGER = /<linger:[ ]?(\d+)>/gi;

  static readonly #RE_SELF_ANIM = /<selfAnimationId:[ ]?(\d+)>/gi;

  static readonly #RE_ON_CAST_ANIM = /<onCastAnimationId:[ ]?(\d+)>/gi;

  static readonly #RE_COMBO = /<combo:[ ]?(\[\d+,[ ]?\d+])>/gi;

  static readonly #RE_COMBO_STARTER = /<comboStarter>/gi;

  static readonly #RE_AI_SKILL_EXCL = /<aiSkillExclusion>/gi;

  static readonly #RE_FREE_COMBO = /<freeCombo>/gi;

  static readonly #RE_NO_AUTO_ASSIGN = /<noAutoAssign>/gi;

  /** Not a skill tag in editor; still stripped so mistaken notes are removed on save. */
  static readonly #RE_NO_AUTO_ASSIGN_TYPE_STRIP = /<noAutoAssignType:[ ]?(\[[\d, ]+])>/gi;

  static readonly #RE_UPGRADE_OVER = /<upgradeOverSkill:[ ]?(\d+)>/i;

  static readonly #RE_NO_UPGRADE = /<noUpgrade>/i;

  static readonly #RE_ONLY_UPGRADE = /<onlyUpgrade>/i;

  static readonly #RE_AGGRO = /<aggro:[ ]?(-?\d+)>/gi;

  static readonly #RE_AGGRO_MULT = /<aggroMultiplier:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_UNPARRYABLE = /<unparryable>/gi;

  static readonly #RE_BONUS_HITS_SKILL_NOTE = /<bonus-hits:[ ]?(\d+)>/gi;

  /** Legacy camelCase tag; stripped on save, never written. */
  static readonly #RE_BONUS_HITS_LEGACY = /<bonusHits:[ ]?(\d+)>/gi;

  static readonly #RE_PIERCE = /<pierce:[ ]?(\[\d+,[ ]?\d+])>/gi;

  static readonly #RE_GUARD = /<guard:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_PARRY = /<parry:[ ]?(\d+)>/gi;

  static readonly #RE_COUNTER_PARRY = /<counterParry:[ ]?(\[\d+(?:\.\d+)?(?:,\s*\d+(?:\.\d+)?)*])>/gi;

  static readonly #RE_COUNTER_GUARD = /<counterGuard:[ ]?(\[\d+(?:\.\d+)?(?:,\s*\d+(?:\.\d+)?)*])>/gi;

  static readonly #RE_DODGE = /<dodge:[ ]?(\d+)>/gi;

  static readonly #RE_DODGE_SPEED = /<dodgeSpeed:[ ]?(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)>/gi;

  static readonly #RE_MOVE_TYPE = /<moveType:[ ]?(forward|backward|directional)>/gi;

  static readonly #RE_INVIN_DODGE = /<invincibleDodge>/gi;

  static readonly #RE_IFRAMES = /<iframes:[ ]?(\[\d+,[ ]?\d+])>/gi;

  static readonly #RE_ON_DEFEATED_TARGET = /<onDefeatedTarget>/gi;

  static readonly #RE_VIS_OFFSET = /<visOffset:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_ANCHOR = /<visAnchor:[ ]?(\[(?:0|1|0?\.\d+),[ ]?(?:0|1|0?\.\d+)])>/gi;

  static readonly #RE_VIS_ROTATE = /<visRotate>/gi;

  static readonly #RE_VIS_SCALE = /<visScale:[ ]?(\[-?\d+(?:\.\d+)?,[ ]?-?\d+(?:\.\d+)?])>/gi;

  static readonly #RE_VIS_Z = /<visZ:[ ]?(-?\d+)>/gi;

  static readonly #RE_VIS_DEBUG = /<visDebug>/gi;

  static readonly #RE_VIS_U = /<visOffsetU:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_D = /<visOffsetD:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_L = /<visOffsetL:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_R = /<visOffsetR:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_UR = /<visOffsetUR:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_UL = /<visOffsetUL:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_DR = /<visOffsetDR:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_VIS_DL = /<visOffsetDL:[ ]?(\[-?\d+,[ ]?-?\d+])>/gi;

  static readonly #RE_NO_CAST_PREVIEW = /<noCastPreview>/gi;

  static readonly #RE_CAST_PREVIEW_WARN = /<castPreviewWarnAt:[ ]?(\d+)>/gi;

  // J-ABS-Juice (J.ABS.EXT.JUICE.RegExp): caster swing / pulse motion polish, all read from RPG_Skill notes.
  static readonly #RE_JUICE_ICON = /<jabsJuiceIcon:[ ]?(\d+)>/gi;

  static readonly #RE_JUICE_WEAPON_STYLE = /<jabsJuiceWeaponStyle:[ ]?([a-zA-Z0-9_-]+)>/gi;

  static readonly #RE_JUICE_MOTION = /<juiceMotion:[ ]?([a-zA-Z0-9_-]+)>/gi;

  static readonly #RE_JUICE_SPAN = /<juiceSpan:[ ]?(\d+)>/gi;

  static readonly #RE_JUICE_SPIN_COUNT = /<juiceSpinCount:[ ]?(\d+)>/gi;

  static readonly #RE_JUICE_STAB_TIP_DEGREES = /<juiceStabTipDegrees:[ ]?(-?\d+)>/gi;

  static readonly #RE_JUICE_PROFILE_GUN = /<juiceProfileGun>/gi;

  static readonly #STRIP_ORDER: RegExp[] = [
    SkillJabsNoteParser.#RE_ACTION_ID,
    SkillJabsNoteParser.#RE_HIDE_MENU,
    SkillJabsNoteParser.#RE_CAST_TIME,
    SkillJabsNoteParser.#RE_CAST_ANIM,
    SkillJabsNoteParser.#RE_COOLDOWN,
    SkillJabsNoteParser.#RE_UNIQUE_COOLDOWN,
    SkillJabsNoteParser.#RE_OGCD,
    SkillJabsNoteParser.#RE_GLOBAL_COOLDOWN_FRAMES,
    SkillJabsNoteParser.#RE_DEGREES,
    SkillJabsNoteParser.#RE_RADIUS,
    SkillJabsNoteParser.#RE_HITBOX,
    SkillJabsNoteParser.#RE_PROJECTILE,
    SkillJabsNoteParser.#RE_FORMATION,
    SkillJabsNoteParser.#RE_THICKNESS,
    SkillJabsNoteParser.#RE_DIRECT,
    SkillJabsNoteParser.#RE_DIRECT_LOCK,
    SkillJabsNoteParser.#RE_PROXIMITY,
    SkillJabsNoteParser.#RE_DURATION,
    SkillJabsNoteParser.#RE_KNOCKBACK,
    SkillJabsNoteParser.#RE_DELAY,
    SkillJabsNoteParser.#RE_LINGER,
    SkillJabsNoteParser.#RE_ON_DEFEATED_TARGET,
    SkillJabsNoteParser.#RE_SELF_ANIM,
    SkillJabsNoteParser.#RE_ON_CAST_ANIM,
    SkillJabsNoteParser.#RE_COMBO,
    SkillJabsNoteParser.#RE_COMBO_STARTER,
    SkillJabsNoteParser.#RE_AI_SKILL_EXCL,
    SkillJabsNoteParser.#RE_FREE_COMBO,
    SkillJabsNoteParser.#RE_NO_AUTO_ASSIGN,
    SkillJabsNoteParser.#RE_NO_AUTO_ASSIGN_TYPE_STRIP,
    SkillJabsNoteParser.#RE_UPGRADE_OVER,
    SkillJabsNoteParser.#RE_NO_UPGRADE,
    SkillJabsNoteParser.#RE_ONLY_UPGRADE,
    SkillJabsNoteParser.#RE_AGGRO,
    SkillJabsNoteParser.#RE_AGGRO_MULT,
    SkillJabsNoteParser.#RE_UNPARRYABLE,
    SkillJabsNoteParser.#RE_BONUS_HITS_SKILL_NOTE,
    SkillJabsNoteParser.#RE_BONUS_HITS_LEGACY,
    SkillJabsNoteParser.#RE_PIERCE,
    SkillJabsNoteParser.#RE_GUARD,
    SkillJabsNoteParser.#RE_PARRY,
    SkillJabsNoteParser.#RE_COUNTER_PARRY,
    SkillJabsNoteParser.#RE_COUNTER_GUARD,
    SkillJabsNoteParser.#RE_DODGE,
    SkillJabsNoteParser.#RE_DODGE_SPEED,
    SkillJabsNoteParser.#RE_MOVE_TYPE,
    SkillJabsNoteParser.#RE_INVIN_DODGE,
    SkillJabsNoteParser.#RE_IFRAMES,
    SkillJabsNoteParser.#RE_VIS_OFFSET,
    SkillJabsNoteParser.#RE_VIS_ANCHOR,
    SkillJabsNoteParser.#RE_VIS_ROTATE,
    SkillJabsNoteParser.#RE_VIS_SCALE,
    SkillJabsNoteParser.#RE_VIS_Z,
    SkillJabsNoteParser.#RE_VIS_DEBUG,
    SkillJabsNoteParser.#RE_VIS_U,
    SkillJabsNoteParser.#RE_VIS_D,
    SkillJabsNoteParser.#RE_VIS_L,
    SkillJabsNoteParser.#RE_VIS_R,
    SkillJabsNoteParser.#RE_VIS_UR,
    SkillJabsNoteParser.#RE_VIS_UL,
    SkillJabsNoteParser.#RE_VIS_DR,
    SkillJabsNoteParser.#RE_VIS_DL,
    SkillJabsNoteParser.#RE_NO_CAST_PREVIEW,
    SkillJabsNoteParser.#RE_CAST_PREVIEW_WARN,
    SkillJabsNoteParser.#RE_JUICE_ICON,
    SkillJabsNoteParser.#RE_JUICE_WEAPON_STYLE,
    SkillJabsNoteParser.#RE_JUICE_MOTION,
    SkillJabsNoteParser.#RE_JUICE_SPAN,
    SkillJabsNoteParser.#RE_JUICE_SPIN_COUNT,
    SkillJabsNoteParser.#RE_JUICE_STAB_TIP_DEGREES,
    SkillJabsNoteParser.#RE_JUICE_PROFILE_GUN,
  ];
  static readonly #VIS_ANCHOR_DEFAULT = 0.5;
  static readonly #VIS_SCALE_DEFAULT = 1;

  /**
   * Removes every JABS ON SKILLS tag this parser manages.
   */
  static stripSkillTags(note: string): string
  {
    let n = note;
    for (const re of SkillJabsNoteParser.#STRIP_ORDER)
    {
      n = n.replace(SkillJabsNoteParser.#ensureGlobal(re), '');
    }
    return NoteNormalizer.normalize(n);
  }

  /**
   * Fills {@link SkillJabsExtension} from {@code note}.
   */
  static hydrate(
    ext: SkillJabsExtension,
    note: string
  ): void
  {
    ext.actionId = SkillJabsNoteParser.#readPositiveInt(note, SkillJabsNoteParser.#RE_ACTION_ID);
    ext.hideFromJabsMenu = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_HIDE_MENU);

    ext.castTime = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_CAST_TIME);
    ext.castAnimation = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_CAST_ANIM);

    ext.cooldown = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_COOLDOWN);
    ext.uniqueCooldown = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_UNIQUE_COOLDOWN);
    ext.ogcd = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_OGCD);
    ext.globalCooldownOverride = SkillJabsNoteParser.#readPositiveInt(
      note,
      SkillJabsNoteParser.#RE_GLOBAL_COOLDOWN_FRAMES
    );

    ext.degrees = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_DEGREES);
    ext.rangeRadius = SkillJabsNoteParser.#readFloat(note, SkillJabsNoteParser.#RE_RADIUS);
    ext.hitboxShape = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_HITBOX);
    ext.projectileCount = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_PROJECTILE);
    ext.projectileFormation = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_FORMATION);
    ext.thickness = SkillJabsNoteParser.#readFloat(note, SkillJabsNoteParser.#RE_THICKNESS);

    ext.direct = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_DIRECT);
    ext.directLock = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_DIRECT_LOCK);
    ext.proximity = SkillJabsNoteParser.#readFloat(note, SkillJabsNoteParser.#RE_PROXIMITY);
    ext.duration = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_DURATION);
    ext.knockback = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_KNOCKBACK);
    ext.delayRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_DELAY);
    ext.linger = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_LINGER);
    ext.onDefeatedTarget = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_ON_DEFEATED_TARGET);

    ext.selfAnimationId = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_SELF_ANIM);
    ext.onCastAnimationId = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_ON_CAST_ANIM);

    ext.comboRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_COMBO);
    ext.comboStarter = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_COMBO_STARTER);
    ext.aiSkillExclusion = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_AI_SKILL_EXCL);
    ext.freeCombo = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_FREE_COMBO);

    ext.noAutoAssign = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_NO_AUTO_ASSIGN);
    ext.upgradeOverSkillId = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_UPGRADE_OVER);
    ext.noUpgrade = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_NO_UPGRADE);
    ext.onlyUpgrade = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_ONLY_UPGRADE);

    ext.bonusAggro = SkillJabsNoteParser.#readInt(note, SkillJabsNoteParser.#RE_AGGRO);
    ext.aggroMultiplier = SkillJabsNoteParser.#readFloat(note, SkillJabsNoteParser.#RE_AGGRO_MULT);

    ext.unparryable = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_UNPARRYABLE);
    {
      const fromSkillNote = SkillJabsNoteParser.#readNonNegInt(
        note,
        SkillJabsNoteParser.#RE_BONUS_HITS_SKILL_NOTE
      );
      const fromLegacy = SkillJabsNoteParser.#readNonNegInt(
        note,
        SkillJabsNoteParser.#RE_BONUS_HITS_LEGACY
      );
      ext.jabsBonusHitsFromSkillNote = fromSkillNote !== null
        ? fromSkillNote
        : fromLegacy;
    }
    {
      const pierceCap = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_PIERCE);
      const piercePair = SkillJabsNoteParser.#parseBracketTwoNonNegInts(pierceCap);
      ext.pierceMaxCount = piercePair === null
        ? null
        : piercePair.a;
      ext.pierceDelayFrames = piercePair === null
        ? null
        : piercePair.b;
    }

    {
      const guardCap = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_GUARD);
      const guardPair = SkillJabsNoteParser.#parseBracketTwoSignedInts(guardCap);
      ext.guardFlat = guardPair === null
        ? null
        : guardPair.a;
      ext.guardPercent = guardPair === null
        ? null
        : guardPair.b;
    }
    ext.parry = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_PARRY);
    {
      const cap = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_COUNTER_PARRY);
      const parsed = SkillJabsNoteParser.#parseCounterSkillChance(cap);
      ext.counterParrySkillId = parsed === null
        ? null
        : parsed.skillId;
      ext.counterParryChance = parsed === null
        ? null
        : parsed.chance;
    }
    {
      const cap = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_COUNTER_GUARD);
      const parsed = SkillJabsNoteParser.#parseCounterSkillChance(cap);
      ext.counterGuardSkillId = parsed === null
        ? null
        : parsed.skillId;
      ext.counterGuardChance = parsed === null
        ? null
        : parsed.chance;
    }

    ext.dodgeSteps = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_DODGE);
    ext.dodgeSpeed = SkillJabsNoteParser.#readFloat(note, SkillJabsNoteParser.#RE_DODGE_SPEED);
    ext.moveType = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_MOVE_TYPE);
    ext.invincibleDodge = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_INVIN_DODGE);
    {
      const cap = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_IFRAMES);
      const pair = SkillJabsNoteParser.#parseBracketTwoNonNegInts(cap);
      ext.iframesStartFrame = pair === null
        ? null
        : pair.a;
      ext.iframesEndFrame = pair === null
        ? null
        : pair.b;
    }
    if (ext.invincibleDodge === true)
    {
      ext.iframesStartFrame = null;
      ext.iframesEndFrame = null;
    }

    ext.visOffsetRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_OFFSET);
    ext.visAnchorRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_ANCHOR);
    ext.visRotate = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_VIS_ROTATE);
    ext.visScaleRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_SCALE);
    ext.visZ = SkillJabsNoteParser.#readInt(note, SkillJabsNoteParser.#RE_VIS_Z);
    ext.visDebug = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_VIS_DEBUG);
    ext.visOffsetURaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_U);
    ext.visOffsetDRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_D);
    ext.visOffsetLRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_L);
    ext.visOffsetRRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_R);
    ext.visOffsetURRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_UR);
    ext.visOffsetULRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_UL);
    ext.visOffsetDRRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_DR);
    ext.visOffsetDLRaw = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_VIS_DL);

    SkillJabsNoteParser.#normalizeRedundantVisualTags(ext);

    ext.noCastPreview = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_NO_CAST_PREVIEW);
    ext.castPreviewWarnAt = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_CAST_PREVIEW_WARN);
    if (
      ext.castPreviewWarnAt !== null
      && ext.castTime !== null
      && ext.castPreviewWarnAt > ext.castTime
    )
    {
      ext.castPreviewWarnAt = ext.castTime;
    }

    // J-ABS-Juice swing / motion polish. Each tag is optional; absent means "use plugin inference / defaults".
    ext.juiceIconIndex = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_JUICE_ICON);
    ext.juiceWeaponStyle = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_JUICE_WEAPON_STYLE);
    ext.juiceMotion = SkillJabsNoteParser.#readCapture(note, SkillJabsNoteParser.#RE_JUICE_MOTION);
    ext.juiceArcSpanDegrees = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_JUICE_SPAN);
    ext.juiceSpinCount = SkillJabsNoteParser.#readNonNegInt(note, SkillJabsNoteParser.#RE_JUICE_SPIN_COUNT);
    // stab-tip degrees is signed: arc 0 points at Pixi +x; negative bearings rotate the bore clockwise.
    ext.juiceStabTipDegrees = SkillJabsNoteParser.#readInt(note, SkillJabsNoteParser.#RE_JUICE_STAB_TIP_DEGREES);
    ext.juiceProfileGun = SkillJabsNoteParser.#testAny(note, SkillJabsNoteParser.#RE_JUICE_PROFILE_GUN);
  }

  /**
   * Serializes {@link SkillJabsExtension} tags, prepended to {@code baseNote} (already stripped).
   */
  static writeSkillTags(
    ext: SkillJabsExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];

    if (ext.actionId !== null && ext.actionId >= 1)
    {
      parts.push(`<actionId:${Math.trunc(ext.actionId)}>`);
    }
    if (ext.hideFromJabsMenu)
    {
      parts.push('<hideFromJabsMenu>');
    }

    if (ext.castTime !== null)
    {
      parts.push(`<castTime:${Math.trunc(ext.castTime)}>`);
    }
    if (ext.castAnimation !== null)
    {
      parts.push(`<castAnimation:${Math.trunc(ext.castAnimation)}>`);
    }

    if (ext.cooldown !== null)
    {
      parts.push(`<cooldown:${Math.trunc(ext.cooldown)}>`);
    }
    if (ext.uniqueCooldown)
    {
      parts.push('<uniqueCooldown>');
    }
    if (ext.ogcd)
    {
      parts.push('<ogcd>');
    }
    if (ext.globalCooldownOverride !== null && ext.globalCooldownOverride >= 1)
    {
      parts.push(`<gcd:${Math.trunc(ext.globalCooldownOverride)}>`);
    }

    if (ext.degrees !== null)
    {
      parts.push(`<degrees:${Math.trunc(ext.degrees)}>`);
    }
    if (ext.rangeRadius !== null)
    {
      parts.push(`<radius:${SkillJabsNoteParser.#fmtNum(ext.rangeRadius)}>`);
    }
    if (ext.hitboxShape !== null && ext.hitboxShape.trim() !== '')
    {
      parts.push(`<hitbox:${ext.hitboxShape.trim()
        .toLowerCase()}>`);
    }
    if (ext.projectileCount !== null)
    {
      parts.push(`<projectile:${Math.trunc(ext.projectileCount)}>`);
    }
    if (ext.projectileFormation !== null && ext.projectileFormation.trim() !== '')
    {
      parts.push(`<formation:${ext.projectileFormation.trim()
        .toLowerCase()}>`);
    }
    if (ext.thickness !== null)
    {
      parts.push(`<thickness:${SkillJabsNoteParser.#fmtNum(ext.thickness)}>`);
    }

    if (ext.direct)
    {
      parts.push('<direct>');
    }
    if (ext.directLock)
    {
      parts.push('<directLock>');
    }
    if (ext.proximity !== null)
    {
      parts.push(`<proximity:${SkillJabsNoteParser.#fmtNum(ext.proximity)}>`);
    }
    if (ext.duration !== null)
    {
      parts.push(`<duration:${Math.trunc(ext.duration)}>`);
    }
    if (ext.knockback !== null)
    {
      parts.push(`<knockback:${Math.trunc(ext.knockback)}>`);
    }
    if (ext.delayRaw !== null && ext.delayRaw.trim() !== '')
    {
      parts.push(`<delay:${ext.delayRaw.trim()}>`);
    }
    if (ext.linger !== null)
    {
      parts.push(`<linger:${Math.trunc(ext.linger)}>`);
    }
    if (ext.onDefeatedTarget)
    {
      parts.push('<onDefeatedTarget>');
    }

    if (ext.selfAnimationId !== null)
    {
      parts.push(`<selfAnimationId:${Math.trunc(ext.selfAnimationId)}>`);
    }
    if (ext.onCastAnimationId !== null)
    {
      parts.push(`<onCastAnimationId:${Math.trunc(ext.onCastAnimationId)}>`);
    }

    if (ext.comboRaw !== null && ext.comboRaw.trim() !== '')
    {
      parts.push(`<combo:${ext.comboRaw.trim()}>`);
    }
    if (ext.comboStarter)
    {
      parts.push('<comboStarter>');
    }
    if (ext.aiSkillExclusion)
    {
      parts.push('<aiSkillExclusion>');
    }
    if (ext.freeCombo)
    {
      parts.push('<freeCombo>');
    }

    if (ext.noAutoAssign)
    {
      parts.push('<noAutoAssign>');
    }
    if (ext.upgradeOverSkillId !== null && ext.upgradeOverSkillId > 0)
    {
      parts.push(`<upgradeOverSkill:${Math.trunc(ext.upgradeOverSkillId)}>`);
    }
    if (ext.noUpgrade)
    {
      parts.push('<noUpgrade>');
    }
    if (ext.onlyUpgrade)
    {
      parts.push('<onlyUpgrade>');
    }

    if (ext.bonusAggro !== null)
    {
      parts.push(`<aggro:${Math.trunc(ext.bonusAggro)}>`);
    }
    if (ext.aggroMultiplier !== null)
    {
      parts.push(`<aggroMultiplier:${SkillJabsNoteParser.#fmtNum(ext.aggroMultiplier)}>`);
    }

    if (ext.unparryable)
    {
      parts.push('<unparryable>');
    }
    if (ext.jabsBonusHitsFromSkillNote !== null)
    {
      parts.push(`<bonus-hits:${Math.trunc(ext.jabsBonusHitsFromSkillNote)}>`);
    }
    if (ext.pierceMaxCount !== null)
    {
      const delay = ext.pierceDelayFrames === null
        ? 0
        : Math.trunc(ext.pierceDelayFrames);
      parts.push(`<pierce:[${Math.trunc(ext.pierceMaxCount)}, ${delay}]>`);
    }

    if (ext.guardFlat !== null || ext.guardPercent !== null)
    {
      const flat = ext.guardFlat === null
        ? 0
        : Math.trunc(ext.guardFlat);
      const pct = ext.guardPercent === null
        ? 0
        : Math.trunc(ext.guardPercent);
      parts.push(`<guard:[${flat}, ${pct}]>`);
    }
    if (ext.parry !== null)
    {
      parts.push(`<parry:${Math.trunc(ext.parry)}>`);
    }
    if (ext.counterParrySkillId !== null && ext.counterParrySkillId >= 1)
    {
      const c = SkillJabsNoteParser.#counterChancePercentForWrite(ext.counterParryChance);
      parts.push(
        `<counterParry:[${Math.trunc(ext.counterParrySkillId)}, ${c}]>`
      );
    }
    if (ext.counterGuardSkillId !== null && ext.counterGuardSkillId >= 1)
    {
      const c = SkillJabsNoteParser.#counterChancePercentForWrite(ext.counterGuardChance);
      parts.push(
        `<counterGuard:[${Math.trunc(ext.counterGuardSkillId)}, ${c}]>`
      );
    }

    if (ext.dodgeSteps !== null)
    {
      parts.push(`<dodge:${Math.trunc(ext.dodgeSteps)}>`);
    }
    if (ext.dodgeSpeed !== null)
    {
      parts.push(`<dodgeSpeed:${SkillJabsNoteParser.#fmtNum(ext.dodgeSpeed)}>`);
    }
    if (ext.moveType !== null && ext.moveType.trim() !== '')
    {
      parts.push(`<moveType:${ext.moveType.trim()
        .toLowerCase()}>`);
    }
    if (ext.invincibleDodge)
    {
      parts.push('<invincibleDodge>');
    }
    if (
      ext.invincibleDodge === false
      && ext.iframesStartFrame !== null
      && ext.iframesEndFrame !== null
    )
    {
      parts.push(
        `<iframes:[${Math.trunc(ext.iframesStartFrame)}, ${Math.trunc(ext.iframesEndFrame)}]>`
      );
    }

    if (
      ext.visOffsetRaw !== null
      && ext.visOffsetRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetRaw) === false
    )
    {
      parts.push(`<visOffset:${ext.visOffsetRaw.trim()}>`);
    }
    if (
      ext.visAnchorRaw !== null
      && ext.visAnchorRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisAnchor(ext.visAnchorRaw) === false
    )
    {
      parts.push(`<visAnchor:${ext.visAnchorRaw.trim()}>`);
    }
    if (ext.visRotate)
    {
      parts.push('<visRotate>');
    }
    if (
      ext.visScaleRaw !== null
      && ext.visScaleRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisScale(ext.visScaleRaw) === false
    )
    {
      parts.push(`<visScale:${ext.visScaleRaw.trim()}>`);
    }
    if (ext.visZ !== null)
    {
      parts.push(`<visZ:${Math.trunc(ext.visZ)}>`);
    }
    if (ext.visDebug)
    {
      parts.push('<visDebug>');
    }
    if (
      ext.visOffsetURaw !== null
      && ext.visOffsetURaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetURaw) === false
    )
    {
      parts.push(`<visOffsetU:${ext.visOffsetURaw.trim()}>`);
    }
    if (
      ext.visOffsetDRaw !== null
      && ext.visOffsetDRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetDRaw) === false
    )
    {
      parts.push(`<visOffsetD:${ext.visOffsetDRaw.trim()}>`);
    }
    if (
      ext.visOffsetLRaw !== null
      && ext.visOffsetLRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetLRaw) === false
    )
    {
      parts.push(`<visOffsetL:${ext.visOffsetLRaw.trim()}>`);
    }
    if (
      ext.visOffsetRRaw !== null
      && ext.visOffsetRRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetRRaw) === false
    )
    {
      parts.push(`<visOffsetR:${ext.visOffsetRRaw.trim()}>`);
    }
    if (
      ext.visOffsetURRaw !== null
      && ext.visOffsetURRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetURRaw) === false
    )
    {
      parts.push(`<visOffsetUR:${ext.visOffsetURRaw.trim()}>`);
    }
    if (
      ext.visOffsetULRaw !== null
      && ext.visOffsetULRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetULRaw) === false
    )
    {
      parts.push(`<visOffsetUL:${ext.visOffsetULRaw.trim()}>`);
    }
    if (
      ext.visOffsetDRRaw !== null
      && ext.visOffsetDRRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetDRRaw) === false
    )
    {
      parts.push(`<visOffsetDR:${ext.visOffsetDRRaw.trim()}>`);
    }
    if (
      ext.visOffsetDLRaw !== null
      && ext.visOffsetDLRaw.trim() !== ''
      && SkillJabsNoteParser.#isRedundantVisOffsetZero(ext.visOffsetDLRaw) === false
    )
    {
      parts.push(`<visOffsetDL:${ext.visOffsetDLRaw.trim()}>`);
    }

    if (ext.noCastPreview)
    {
      parts.push('<noCastPreview>');
    }
    if (ext.castPreviewWarnAt !== null)
    {
      let warnAt = Math.trunc(ext.castPreviewWarnAt);
      if (ext.castTime !== null && warnAt > ext.castTime)
      {
        warnAt = Math.trunc(ext.castTime);
      }
      parts.push(`<castPreviewWarnAt:${warnAt}>`);
    }

    // J-ABS-Juice tags. Negative / blank values "fall back to plugin inference", so the corresponding tags are omitted.
    if (ext.juiceIconIndex !== null && ext.juiceIconIndex >= 0)
    {
      parts.push(`<jabsJuiceIcon:${Math.trunc(ext.juiceIconIndex)}>`);
    }
    if (ext.juiceWeaponStyle !== null && ext.juiceWeaponStyle.trim() !== '')
    {
      parts.push(`<jabsJuiceWeaponStyle:${ext.juiceWeaponStyle.trim()}>`);
    }
    if (ext.juiceMotion !== null && ext.juiceMotion.trim() !== '')
    {
      // kebab-case is the canonical form; mirrors how hitboxShape / projectileFormation normalize on write.
      parts.push(`<juiceMotion:${ext.juiceMotion.trim()
        .toLowerCase()}>`);
    }
    if (ext.juiceArcSpanDegrees !== null && ext.juiceArcSpanDegrees >= 0)
    {
      parts.push(`<juiceSpan:${Math.trunc(ext.juiceArcSpanDegrees)}>`);
    }
    if (ext.juiceSpinCount !== null && ext.juiceSpinCount >= 1)
    {
      // plugin clamps 1–8 at runtime; mirror the upper bound so saved notes never read as "unsafe".
      let spin = Math.trunc(ext.juiceSpinCount);
      if (spin < 1)
      {
        spin = 1;
      }
      if (spin > 8)
      {
        spin = 8;
      }
      parts.push(`<juiceSpinCount:${spin}>`);
    }
    if (ext.juiceStabTipDegrees !== null)
    {
      parts.push(`<juiceStabTipDegrees:${Math.trunc(ext.juiceStabTipDegrees)}>`);
    }
    if (ext.juiceProfileGun === true)
    {
      parts.push('<juiceProfileGun>');
    }

    const head = parts.length > 0
      ? `${parts.join('\n')}\n`
      : '';
    return NoteNormalizer.normalize(head + baseNote);
  }

  static #ensureGlobal(re: RegExp): RegExp
  {
    if (re.global)
    {
      return re;
    }
    return new RegExp(re.source, `${re.flags}g`);
  }

  /**
   * Strips visual tags that match engine defaults so notes stay minimal.
   */
  static #normalizeRedundantVisualTags(ext: SkillJabsExtension): void
  {
    if (ext.visAnchorRaw !== null && SkillJabsNoteParser.#isRedundantVisAnchor(ext.visAnchorRaw))
    {
      ext.visAnchorRaw = null;
    }
    if (ext.visScaleRaw !== null && SkillJabsNoteParser.#isRedundantVisScale(ext.visScaleRaw))
    {
      ext.visScaleRaw = null;
    }
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetURaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetDRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetLRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetRRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetURRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetULRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetDRRaw');
    SkillJabsNoteParser.#clearVisOffsetIfZero(ext, 'visOffsetDLRaw');
  }

  static #clearVisOffsetIfZero(
    ext: SkillJabsExtension,
    key:
      | 'visOffsetRaw'
      | 'visOffsetURaw'
      | 'visOffsetDRaw'
      | 'visOffsetLRaw'
      | 'visOffsetRRaw'
      | 'visOffsetURRaw'
      | 'visOffsetULRaw'
      | 'visOffsetDRRaw'
      | 'visOffsetDLRaw'
  ): void
  {
    const v = ext[ key ];
    if (v !== null && SkillJabsNoteParser.#isRedundantVisOffsetZero(v))
    {
      ext[ key ] = null;
    }
  }

  static #parseBracketInteriorTwo(raw: string): [ string, string ] | null
  {
    const t = raw.trim();
    const inner = t.startsWith('[') && t.endsWith(']')
      ? t.slice(1, -1)
        .trim()
      : t;
    const comma = inner.indexOf(',');
    if (comma === -1)
    {
      return null;
    }
    const a = inner.slice(0, comma)
      .trim();
    const b = inner.slice(comma + 1)
      .trim();
    if (a === '' || b === '')
    {
      return null;
    }
    return [ a, b ];
  }

  static #isRedundantVisAnchor(raw: string): boolean
  {
    const pair = SkillJabsNoteParser.#parseBracketInteriorTwo(raw);
    if (pair === null)
    {
      return false;
    }
    const x = parseFloat(pair[ 0 ]);
    const y = parseFloat(pair[ 1 ]);
    if (Number.isNaN(x) || Number.isNaN(y))
    {
      return false;
    }
    return (
      Math.abs(x - SkillJabsNoteParser.#VIS_ANCHOR_DEFAULT) < 1e-5
      && Math.abs(y - SkillJabsNoteParser.#VIS_ANCHOR_DEFAULT) < 1e-5
    );
  }

  static #isRedundantVisScale(raw: string): boolean
  {
    const pair = SkillJabsNoteParser.#parseBracketInteriorTwo(raw);
    if (pair === null)
    {
      return false;
    }
    const x = parseFloat(pair[ 0 ]);
    const y = parseFloat(pair[ 1 ]);
    if (Number.isNaN(x) || Number.isNaN(y))
    {
      return false;
    }
    return (
      Math.abs(x - SkillJabsNoteParser.#VIS_SCALE_DEFAULT) < 1e-5
      && Math.abs(y - SkillJabsNoteParser.#VIS_SCALE_DEFAULT) < 1e-5
    );
  }

  static #isRedundantVisOffsetZero(raw: string): boolean
  {
    const pair = SkillJabsNoteParser.#parseBracketInteriorTwo(raw);
    if (pair === null)
    {
      return false;
    }
    const x = parseInt(pair[ 0 ], 10);
    const y = parseInt(pair[ 1 ], 10);
    if (Number.isNaN(x) || Number.isNaN(y))
    {
      return false;
    }
    return x === 0 && y === 0;
  }

  static #readCapture(
    note: string,
    re: RegExp
  ): string | null
  {
    const g = SkillJabsNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    const m = g.exec(note);
    if (m === null)
    {
      return null;
    }
    const s = m[ 1 ];
    if (typeof s !== 'string' || s.length === 0)
    {
      return null;
    }
    return s;
  }

  static #testAny(
    note: string,
    re: RegExp
  ): boolean
  {
    const g = SkillJabsNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    return g.test(note);
  }

  static #readPositiveInt(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = SkillJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseInt(s, 10);
    if (Number.isNaN(v) || v < 1)
    {
      return null;
    }
    return v;
  }

  static #readNonNegInt(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = SkillJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseInt(s, 10);
    if (Number.isNaN(v) || v < 0)
    {
      return null;
    }
    return v;
  }

  static #readInt(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = SkillJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseInt(s, 10);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  static #readFloat(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = SkillJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseFloat(s);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  static #parseBracketTwoNonNegInts(bracket: string | null): { a: number; b: number } | null
  {
    if (bracket === null || bracket.trim() === '')
    {
      return null;
    }
    const m = bracket.trim()
      .match(/^\[\s*(\d+)\s*,\s*(\d+)\s*\]$/u);
    if (m === null)
    {
      return null;
    }
    const a = parseInt(m[ 1 ], 10);
    const b = parseInt(m[ 2 ], 10);
    if (Number.isNaN(a) || Number.isNaN(b))
    {
      return null;
    }
    return {
      a,
      b
    };
  }

  static #parseBracketTwoSignedInts(bracket: string | null): { a: number; b: number } | null
  {
    if (bracket === null || bracket.trim() === '')
    {
      return null;
    }
    const m = bracket.trim()
      .match(/^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/u);
    if (m === null)
    {
      return null;
    }
    const a = parseInt(m[ 1 ], 10);
    const b = parseInt(m[ 2 ], 10);
    if (Number.isNaN(a) || Number.isNaN(b))
    {
      return null;
    }
    return {
      a,
      b
    };
  }

  static #parseCounterSkillChance(bracket: string | null): { skillId: number; chance: number } | null
  {
    if (bracket === null || bracket.trim() === '')
    {
      return null;
    }
    const m = bracket.trim()
      .match(/^\[\s*(\d+)\s*,\s*(-?(?:\d+(?:\.\d+)?))\s*\]$/u);
    if (m === null)
    {
      return null;
    }
    const skillId = parseInt(m[ 1 ], 10);
    const chance = parseFloat(m[ 2 ]);
    if (Number.isNaN(skillId) || Number.isNaN(chance))
    {
      return null;
    }
    if (skillId < 1)
    {
      return null;
    }
    return {
      skillId,
      chance
    };
  }

  static #fmtNum(n: number): string
  {
    if (Number.isInteger(n))
    {
      return String(n);
    }
    return String(n);
  }

  /** Counter-parry / counter-guard chance as integer percent 1–100 for note output. */
  static #counterChancePercentForWrite(chance: number | null): number
  {
    if (chance === null)
    {
      return 100;
    }
    const r = Math.round(chance);
    if (r < 1)
    {
      return 1;
    }
    if (r > 100)
    {
      return 100;
    }
    return r;
  }
}

export { SkillJabsNoteParser };

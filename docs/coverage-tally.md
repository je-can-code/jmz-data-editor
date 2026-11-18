# What the editors cannot change yet

A tally, taken 2026-11-18 against `feat/boss-pass`, of everything Chef Adventure's plugins read that neither the
data editor nor the map editor can change. A tag counts as editable only when a control writes it: a tag that can
only be typed into a note box counts as not editable. Plugin parameters are out of scope.

Each row is one notetag entry from `rmmz-plugins/docs/notetag-reference.md` on one place it applies, or one place
Chef Adventure uses it. "CA uses" counts matches of the plugins' own regexes in the game's data today. Where an
entry's variants apply to different tables, each table is judged only on its own variants. "Checked: read" means
the verdict was confirmed by reading the code; "script" means the import graph found no writer for that tag
reachable from that place's board, and the row was not read on its own.

## At a glance

- **Weighted by what Chef Adventure uses:** 77.5% of the game's 86,116 tag lines sit on tags a control writes (72.4% of the 29,427 in database notes). Of the 722 tag-and-place gaps, the game uses 231; the rest are tags the plugins accept on tables the game never puts them on.
- **Notetags on database rows:** of 766 tag-and-table pairs, 109 are editable, 10 partly, and 647 not (87 of those are on Actors, which has no board).
- **Whole files nothing changes:**
  - `config.message.json` (J-Message, J-Message-Bubbles, J-Message-Chatter): no route, no board.
  - `config.lighting.json` and `config.lighting-time.json`: the map editor reads both (light defaults, the day and night curve) for its previews; nothing saves either, and no board shows them.
  - `Troops.json`: no route at all.
  - `Actors.json` and `Animations.json`: read for pickers only.
- **Fields missing from files the editor does change:**
  - `Enemies.json`: the action list (each action's `skillId`, `conditionType`, `conditionParam1`, `conditionParam2`, `rating`; 928 actions), the battler image (`battlerName`, `battlerHue`) and the vanilla `dropItems`.
  - `config.difficulty.json`: each layer's `description` and `unlocked` survive a save, but no control edits them.
  - `config.jabs.json`: the `loot` block (`magnetRadius`, `magnetSpeed`, `magnetAcceleration`) has no tab.
  - Smaller: a class's `expParams`, an item's `animationId`, and `messageType` on skills and states.
- **The most-used tags with a gap:**

| Place | Plugin | Tag | CA uses | Note |
|---|---|---|---:|---|
| Event page comment | J-ABS | `<enemyIds:[ENEMY_IDS]>` | 3172 |  |
| Enemies | J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 2392 | only the BuffPlus quadrant is shown on this board; editable on Classes, States |
| Event page comment | J-ABS | `<respawn:[METHOD, PARAM]>` | 1607 |  |
| Event page comment | J-Escribe | `<text:EVENT_TEXT>` / `<icon:ICON_INDEX>` | 1426 |  |
| Event page comment | J-ABS | `<jabsConfig:noIdle\|canIdle\|noHpBar\|showHpBar\|hideStates\|showStates\|noName\|showName\|inv... | 930 | editable on Enemies |
| Event page comment | J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 907 | the light quick panel edits reach, colour, intensity and effect on an event's first lit page; nothing adds or removes a light, or reaches a later page |
| Event page comment | J-Pixelistics | `<areaEvent:[WIDTH, HEIGHT]>` | 761 | shown, not editable |
| Event page comment | J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 712 | missing: `uniquePassive`; editable on Skills |
| Event page comment | J-TIME | `<{unit}RangePage:START-END>` / `<{unit}RangeChoice:START-END>` | 639 | shown, not editable |
| Event page comment | J-Escribe | `<proximityText:DISTANCE>` / `<proximityIcon:DISTANCE>` | 436 |  |
| Enemies | J-Omnipedia-Monster | `<hideFromMonsterpedia>` / `<monsterFamilyIcon:ICON_INDEX>` / `<descriptionLine:TEXT>` | 344 |  |
| Weapons | J-ABS | `<skillId:SKILL_ID>` / `<offhandSkillId:SKILL_ID>` / `<offhandEligible>` | 340 |  |

## Notetags on database rows

### Skills

39 editable, 5 partly, 85 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-ABS | `<degrees:VAL>` / `<thickness:VAL>` / `<innerRadius:VAL>` | 273 | missing: `innerRadius` | read |
| J-ABS-Juice | `<noJuice>` / `<juiceMotion:NAME>` | 176 | missing: `noJuice` | read |
| J-SkillExtend | `<extend:[NUM]>` / `<extend:[NUM,NUM,...]>` | 109 |  | script |
| J-ABS-Juice | `<juiceSpan:N>` / `<juiceRepeatCount:N>` / `<juiceDuration:N>` | 62 | missing: `juiceDuration` | read |
| J-ABS-Juice | `<castMotion:NAME>` / `<castMotionPeriod:N>` / `<castMotionIntensity:PERCENT>` | 54 |  | script |
| J-Base | `<type:CLASSIFIER>` | 53 |  | script |
| J-ABS-Tools | `<gapCloseMode:blink\|jump\|travel>` / `<gapClosePosition:infront\|behind\|same>` / `<respe... | 51 |  | script |
| J-Passive-Conditional | `<passiveSourceRule:[KIND, PARAM?]>` | 40 |  | script |
| J-ABS | `<cannotMoveToInterrupt>` / `<interrupt:MAGNIFIER>` / `<thisCannotBeInterrupted>` / `<c... | 37 |  | script |
| J-SkillExtend | `<onCastSelfState:[STATE_ID, CHANCE]>` / `<onHitSelfState:[STATE_ID, CHANCE]>` | 30 |  | script |
| J-ABS-Tools | `<gapClose:key>` / `<gapCloseTarget:key>` / `<gapCloseAny>` / `<blockGapClose>` | 29 | editable on States | read |
| J-ABS-Poses | `<poseSuffix:[SUFFIX, INDEX, DURATION]>` | 25 |  | script |
| J-ABS-Targeting | `<targeted>` | 24 |  | script |
| J-ABS-Food | `<endFoodChain>` | 18 |  | script |
| J-ABS-Tools | `<pullForward:MAGNITUDE>` | 13 |  | script |
| J-Passive-Conditional | `<passiveStateCount:[STATE_ID, KIND, PARAM]>` | 13 |  | script |
| J-SkillExtend | `<extendType:CLASSIFIER>` | 13 |  | script |
| J-SkillExtend | `<onCastExecuteSkill:[SKILL_ID, CHANCE]>` | 13 |  | script |
| J-SkillExtend | `<onCastLoseState:[STATE_ID, CHANCE]>` / `<onHitLoseState:[STATE_ID, CHANCE]>` | 12 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 11 |  | script |
| J-Resources | `<hp-gain:VALUE>` / `<mp-cost:VALUE>` / `<mp-gain:VALUE>` / `<tp-cost:VALUE>` / `<tp-ga... | 11 | missing: `hp-gain`, `mp-gain`, `tp-gain` | read |
| J-ABS | `<purgeStates:[TYPE, ALLOW_DEATH, COUNT]>` / `<noLogs>` | 10 |  | script |
| J-ABS-Charge | `<chargeTier:[TIER, DURATION, RELEASED_SKILL, CHARGE_ANIM?, DONE_ANIM?]>` | 8 |  | script |
| J-ABS | `<directStateTarget:STATE_ID>` | 7 |  | script |
| J-ABS-Tools | `<thisOnGapCloseEnd:[SKILL_IDS...]>` / `<onGapCloseEnd:[SKILL_IDS...]>` | 7 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 4 |  | script |
| J-ABS-Shield | `<shieldBypass>` / `<shieldBypass:[TYPES...]>` | 4 |  | script |
| J-ABS-Shield | `<shieldDamage:[FORMULA]>` | 4 |  | script |
| J-SkillExtend | `<onCastExecuteSkillIfAfflicted:[SKILL_ID, CHANCE, STATE_REQUIREMENT]>` | 4 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 3 |  | script |
| J-ABS | `<ignoreTerrain>` | 3 |  | script |
| J-ABS | `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>` / `<thisSkillHistoryBonus:[WIN... | 3 | editable on States | read |
| J-ABS | `<skillId:SKILL_ID>` / `<offhandSkillId:SKILL_ID>` / `<offhandEligible>` | 3 |  | read |
| J-SkillExtend | `<onCastRemoveState:[STATE_ID, CHANCE]>` / `<onHitRemoveState:[STATE_ID, CHANCE]>` | 3 |  | script |
| J-ABS | `<aggroPercent:VAL>` | 2 |  | script |
| J-ABS | `<aiFollowUp:[STATE_IDS]>` / `<aiFollowUpOnly>` | 2 |  | script |
| J-ABS | `<channel:[SKILL_ID, TOTAL_DURATION]>` / `<channelTickSpeed:VAL>` / `<onChannelComplete... | 2 |  | script |
| J-ABS-Hitstop | `<hitstop:FRAMES>` / `<noHitstop>` | 2 |  | script |
| J-CriticalFactors | `<thisCritApply:[STATE_ID, CHANCE]>` / `<thisCritSelf:[STATE_ID, CHANCE]>` / `<onCritAp... | 2 |  | script |
| J-Passive-Conditional | `<passiveStateRule:[STATE_ID, KIND, PARAM?]>` | 2 |  | script |
| J-SkillExtend | `<onCastSelfStateIfAfflicted:[STATE_TO_APPLY, CHANCE, STATE_REQUIREMENT]>` | 2 |  | script |
| J-ABS | `<autoAssignSkills>` / `<autoUpgradeSkills>` / `<noAutoAssignType:[TYPE_IDS...]>` / `<n... | 1 | missing: `noAutoAssignType` | read |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 1 |  | script |
| J-ABS | `<thisRangeBuff:N>` / `<thisRangeRate:N>` / `<thisRadiusBuff:N>` / `<thisRadiusRate:N>`... | 1 |  | script |
| J-ABS-MoveSpeed | `<speedBoost:NUM>` | 1 | editable on States | read |
| J-CriticalFactors | `<thisCritMultiplier:[FORMULA]>` | 1 |  | script |
| J-CriticalFactors | `<thisCritsAlwaysIfStateType:TYPE>` / `<critAlwaysIfStateType:TYPE>` | 1 |  | script |
| J-Passive-Conditional | `<autoApplyState:[STATE_ID, CONDITION, PARAM]>` | 1 | editable on States | read |
| J-Passive-Conditional | `<autoExecuteSkill:[SKILL_ID, CONDITION, PARAM]>` | 1 | editable on States | read |
| J-Resources | `<stackCost:[STATE_ID, COUNT]>` | 1 |  | script |
| J-SkillExtend | `<toggleGroupOnExecute:[STATE_ID, STATE_ID, ...]>` | 1 |  | script |
| J-ABS | `<guardInterval:FRAMES>` | 0 |  | script |
| J-ABS | `<noDamage>` | 0 |  | script |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 0 |  | script |
| J-ABS | `<notMyAggro:VAL>` / `<notMyAggroPercent:VAL>` | 0 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 0 |  | script |
| J-ABS-Formula | `<onApplyFormula:[TRIGGER, AFFECT, RESOURCE, FORMULA]>` | 0 |  | script |
| J-ABS-Formula | `<onApplySkill:[TRIGGER, AFFECT, SKILL_ID]>` | 0 |  | script |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseFastCooldown:[FORMULA]>` / `<fastCooldownFlat:[FORMULA]>` / `<fastCooldownRate:[F... | 0 | editable on States | read |
| J-Aptitude | `<aptMultiplier:AMOUNT>` / `<aptMultiplier:-AMOUNT>` | 0 |  | script |
| J-Base | `<har:VALUE>` | 0 |  | read |
| J-CriticalFactors | `<critMultiplierBase:NUM>` / `<critMultiplier:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<critReductionBase:NUM>` / `<critReduction:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<forceCritProcs>` | 0 |  | script |
| J-CriticalFactors | `<thisCritChanceIfState:[STATE_ID, BONUS_CHANCE]>` / `<critChanceIfState:[STATE_ID, BON... | 0 |  | script |
| J-CriticalFactors | `<thisCritsAlwaysIfState:[STATE_ID, ...]>` / `<critAlwaysIfState:[STATE_ID, ...]>` | 0 |  | script |
| J-CriticalFactors | J-NaturalGrowths compat: `<cdmBuffPlus>` / `<cdmBuffRate>` / `<cdmGrowthPlus>` / `<cdmG... | 0 | editable on Classes, Enemies, States | read |
| J-DropsControl | `<dropMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | `<dropQuantity:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 0 |  | script |
| J-DropsControl | `<goldMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | J-NaturalGrowths + SDP compat: `<dorBuffPlus>` / `<dorBuffRate>` / `<dorGrowthPlus>` / ... | 0 |  | script |
| J-Elementalistics | `<absorbElements:[NUM]>` / `<absorbElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-Elementalistics | `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>` | 0 | editable on States | read |
| J-Elementalistics | `<pierceElement:[ELEMENT_ID, PIERCE_PERCENT]>` / `<thisPierceElement:[ELEMENT_ID, PIERC... | 0 |  | script |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-LevelMaster | `<lv:NUM>` / `<lvl:NUM>` / `<level:NUM>` | 0 | editable on Enemies, States | read |
| J-LevelMaster | `<maxLevelBoost:AMOUNT>` | 0 | editable on States | read |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 0 |  | script |
| J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 0 | editable on Classes, Enemies, States | read |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Proficiency | `<proficiencyBonus:NUM>` | 0 | editable on States | read |
| J-Proficiency | `<proficiencyGivingBlock>` / `<proficiencyGainingBlock>` | 0 | editable on States | read |
| J-Resources | `<itemCost:[ITEM_ID, COUNT]>` | 0 |  | script |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-SkillExtend | `<onCastStripState:[STATE_ID, CHANCE]>` / `<onHitStripState:[STATE_ID, CHANCE]>` | 0 |  | script |
| J-SkillSlots | `<baseSlotPoints:[FORMULA]>` / `<maxSlotPoints:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<unslottedSkills:[SKILL_IDS]>` | 0 | editable on Classes | read |

Editable: `<hideFromJabsMenu>`, `<castTime:VAL>`, `<passive:[STATE_IDS]>`, `<radius:VAL>`, `<proximity:VAL>`, `<hitbox:circle\|rhombus\|arc\|square\|line\|wall\|cross>`, `<actionId:EVENT_ID>`, `<cooldown:VAL>`, `<combo:[COMBO_SKILL_ID, LINK_TIME?, EXPIRE_FRAMES?]>`, `<duration:FRAMES>`, `<direct>`, `<attackElements:[NUM]>`, `<knockback:VAL>`, `<delay:[DURATION, TOUCHABLE, TRIGGER_RADIUS?]>`, `<pierce:[TIMES, DELAY]>`, `<counterGuard:[SKILL, CHANCE]>`, `<projectile:VAL>`, `<bonus-hits:VAL>`, `<juiceStabTipDegrees:N>`, `<thisApplyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>`, `<moveType:forward\|backward\|directional>`, `<guard:[FLAT, PERCENT]>`, `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>`, `<on-attack-hp-gain:VALUE>`, `<aggro:VAL>`, `<toggleOnExecute:STATE_ID>`, `<thisCritsAlways>`, `<invincibleDodge>`, `<noGlobalCooldown>`, `<onOwnDefeat:[SKILL_ID, CHANCE]>`, `<thisCritChance:[FORMULA]>`, `<noCastPreview>`, `<visAnchor:[AX, AY]>`, `<visOffset:[X, Y]>`, `<jabsJuiceIcon:N>`, `<jabsJuiceWeaponStyle:key>`, `<hp-cost-can-kill>`, `<hp-cost:VALUE>`, `<slotCost:AMOUNT>`.

### States

38 editable, 2 partly, 96 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-Passive-Affix | `<rewardMultiplier:[TYPE, VALUE]>` | 229 |  | script |
| J-Base | `<type:CLASSIFIER>` | 121 |  | script |
| J-Passive | `<hideFromPassiveList>` | 93 |  | script |
| J-DropsControl | `<dropQuantity:NUM>` | 45 |  | script |
| J-ABS | `<spread:[CHANCE, RANGE]>` / `<viral>` / `<spreadTick:FRAMES>` / `<spreadPerTick:N>` / ... | 42 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 34 |  | script |
| J-SkillExtend | `<extendType:CLASSIFIER>` | 31 |  | script |
| J-ABS | `<radiusBuff:N>` / `<radiusRate:N>` / `<proximityBuff:N>` / `<proximityRate:N>` / `<thi... | 30 |  | script |
| J-Elementalistics | `<pierceElement:[ELEMENT_ID, PIERCE_PERCENT]>` / `<thisPierceElement:[ELEMENT_ID, PIERC... | 29 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 28 |  | script |
| J-ABS-Juice | `<motion:[squish]>` / `<motion:[tilt]>` / `<motion:[flip]>` / `<motion:[charge]>` | 28 |  | script |
| J-Motion | `<motion:[TYPE]>` / `<motion:[TYPE, PARAM, ...]>` | 28 |  | script |
| J-Motion-ABS | `<motion:[TYPE, PARAM, ...]>` on a state | 28 |  | script |
| J-Motion-Passive | `<motion:[TYPE, PARAM, ...]>` on a passive state | 28 |  | script |
| J-ABS | `<applyStateOnExpire:[STATE_ID, CHANCE]>` | 22 |  | script |
| J-ABS | `<perDebuffBuff:N>` | 21 |  | script |
| J-DropsControl | `<drops:[TYPE,ID,CHANCE]>` | 19 | editable on Enemies | read |
| J-ABS | `<slotTransform:[SLOT_KEY, SKILL_ID]>` | 18 |  | script |
| J-ABS-Food | `<foodChain:TYPE>` | 18 |  | script |
| J-ABS-Food | `<foodGroupColor:#RRGGBB>` | 18 |  | script |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 18 | missing: `castSpeedRate` | read |
| J-ABS | `<cdr:[FORMULA]>` | 16 |  | script |
| J-Passive-Conditional | `<autoApplyStateOnNearby:[STATE_ID, KIND, MIN_COUNT, COOLDOWN_FRAMES, TRIGGER_TILES?]>` | 16 |  | script |
| J-ABS | `<bonus-hits-global:VAL>` / `<bonus-hits-basic:VAL>` / `<bonus-hits-skill:VAL>` (+ form... | 14 |  | script |
| J-Passive-Conditional | `<removeStateOnMove:[STATE_ID]>` | 12 |  | script |
| J-CriticalFactors | `<thisCritApply:[STATE_ID, CHANCE]>` / `<thisCritSelf:[STATE_ID, CHANCE]>` / `<onCritAp... | 11 |  | script |
| J-ABS | `<castTimeDamageBonus:N>` / `<thisCastTimeDamageBonus:N>` | 10 |  | script |
| J-ABS-Shield | `<sar:PERCENT_POINTS>` / `<ser:PERCENT_POINTS>` | 10 |  | read |
| J-ABS | `<knockbackResist:VAL>` / `<proximityKnockback:[RADIUS, PCT]>` / `<knockbackAmp:PCT>` /... | 9 |  | script |
| J-SkillExtend | `<extend:[NUM]>` / `<extend:[NUM,NUM,...]>` | 9 |  | read |
| J-ABS | `<bonusDamageIfStateType:[TYPE, PCT]>` / `<bonusDamagePerStateType:[TYPE, PCT]>` | 7 |  | script |
| J-ABS | `<stacksConvertToState:[NEW_STATE_ID, STACKS_REQUIRED]>` / `<removeOnConvert>` / `<conv... | 7 |  | script |
| J-Passive-Conditional | `<removeOnSkillResolution:[STYPE_ID, CHANCE]>` | 7 |  | script |
| J-ABS | `<rangeBuff:N>` / `<rangeRate:N>` | 6 |  | script |
| J-ABS | `<projectileDuration:PERCENT_POINTS>` | 5 |  | script |
| J-Aptitude | `<aptMultiplier:AMOUNT>` / `<aptMultiplier:-AMOUNT>` | 5 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 5 | editable on Skills | read |
| J-Passive-Affix | `<affix-tier:NUM>` | 5 |  | script |
| J-Passive-Conditional | `<passiveStateCount:[STATE_ID, KIND, PARAM]>` | 5 |  | script |
| J-Resources | `<hcr:[VALUE]>` | 5 |  | read |
| J-ABS | `<ignoreParry:PCT>` / `<thisIgnoreParry:PCT>` | 4 |  | script |
| J-ABS | `<encoreRepeats:[FORMULA]>` / `<accumulate>` | 3 |  | script |
| J-ABS | `<immuneToAll>` / `<immuneToStates>` / `<immuneToNegatives>` / `<stateTypeImmune:TYPE>`... | 3 |  | script |
| J-ABS | `<luckyRolls:[FORMULA]>` / `<thisLuckyRolls:[FORMULA]>` / `<cursedRolls:[FORMULA]>` / `... | 3 |  | script |
| J-ABS | `<onEvadeApply:[STATE_ID, CHANCE]>` / `<onEvadeApplySelf:[STATE_ID, CHANCE]>` / `<onEva... | 3 |  | script |
| J-ABS | `<skillTransform:[BASE, OVERRIDE]>` | 3 |  | script |
| J-ABS | `<tickSpeedFlat:VAL>` / `<tickSpeedPercent:VAL>` / `<tickSpeedTypePercent:[TYPE, VAL]>`... | 3 |  | script |
| J-Resources-ABS | `<on-attack-hp-gain:VALUE>` / `<on-attack-mp-gain:VALUE>` / `<on-attack-tp-gain:VALUE>`... | 3 | editable on Skills | read |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 2 |  | script |
| J-ABS | `<bonusDamageForMyStateCount:PCT>` / `<thisBonusDamageForMyStateCount:PCT>` | 2 |  | script |
| J-ABS | `<noDamage>` | 2 |  | script |
| J-ABS | `<stackMaxBoost:VAL>` / `<thisStackMaxBoost:VAL>` | 2 |  | script |
| J-ABS | `<stackOnExpire>` | 2 |  | script |
| J-ABS | `<veryLucky>` / `<veryCursed>` | 2 |  | script |
| J-ABS-Tools | `<gapClose:key>` / `<gapCloseTarget:key>` / `<gapCloseAny>` / `<blockGapClose>` | 2 | missing: `gapClose`, `gapCloseAny`, `blockGapClose` | read |
| J-Passive-Conditional | `<autoInflictState:[STATE_ID, CONDITION, COOLDOWN_FRAMES]>` | 2 |  | script |
| J-Passive-Conditional | `<autoModifyCooldowns:[AMOUNT, CONDITION, THROTTLE_FRAMES, UNIT, RANGE?, TARGET_KEY?]>` | 2 |  | script |
| J-SkillExtend | `<onCastSelfState:[STATE_ID, CHANCE]>` / `<onHitSelfState:[STATE_ID, CHANCE]>` | 2 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 1 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 1 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 1 |  | script |
| J-ABS | `<dotAmpRate:VAL>` / `<hotAmpRate:VAL>` / `<thisDotAmpRate:VAL>` / `<thisHotAmpRate:VAL>` | 1 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 1 | editable on Skills | read |
| J-ABS | `<purgeStates:[TYPE, ALLOW_DEATH, COUNT]>` / `<noLogs>` | 1 |  | script |
| J-ABS | `<thisStateDurationFlat:VAL>` / `<thisStateDurationPerc:VAL>` / `<thisStateDurationForm... | 1 |  | script |
| J-ABS | `<vulnerabilityPerAuthoredStateStack:PCT>` | 1 |  | script |
| J-ABS-Food | `<foodChainImpervious>` | 1 |  | script |
| J-Base | `<har:VALUE>` | 1 |  | read |
| J-CriticalFactors | `<forceCritProcs>` | 1 |  | script |
| J-DropsControl | J-NaturalGrowths + SDP compat: `<dorBuffPlus>` / `<dorBuffRate>` / `<dorGrowthPlus>` / ... | 1 |  | script |
| J-Passive-Conditional | `<removeOnSkillExecution:[STYPE_ID, CHANCE]>` | 1 |  | script |
| J-Popups-ABS | `<noHpPopup>` / `<noMpPopup>` / `<noTpPopup>` / `<noSlipPopup>` | 1 |  | script |
| J-SDP | `<sdpBlackout>` | 1 |  | script |
| J-SDP | `<sdpBonusFormula:[FORMULA]>` | 1 |  | script |
| J-SkillExtend | `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>` | 1 | editable on Skills | read |
| J-ABS | `<bonusDamageIfSelfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfSelfState:[STATE_ID, PC... | 0 |  | script |
| J-ABS | `<lootMagnetBuff:N>` / `<lootMagnetRate:N>` | 0 |  | read |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 0 |  | script |
| J-ABS | `<per:[FORMULA]>` | 0 |  | read |
| J-ABS | `<visionMultiplier:VAL>` | 0 |  | script |
| J-Aptitude | `<aptitude:[SKILL_ID, REQUIRED_AP]>` | 0 | editable on Classes | read |
| J-Aptitude-Typed | `<aptitudeTyped:[SKILL_ID, REQUIRED_AP, DOMAIN, ID_OR_NAME]>` | 0 | editable on Classes | read |
| J-Base | `<maxTp:VALUE>` | 0 | editable on Armors, Enemies, Weapons | read |
| J-CriticalFactors | `<thisCritChanceIfState:[STATE_ID, BONUS_CHANCE]>` / `<critChanceIfState:[STATE_ID, BON... | 0 |  | script |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-LevelMaster | `<hideLevel>` | 0 |  | script |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 0 |  | script |
| J-Motion-ABS | `<deathMotion:STYLE>` | 0 |  | script |
| J-Motion-ABS | `<noDeathMotion>` | 0 |  | script |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-Resources-ABS | `<when-hit-hp-gain:VALUE>` / `<when-hit-mp-gain:VALUE>` / `<when-hit-tp-gain:VALUE>` (+... | 0 |  | script |
| J-SkillExtend | `<onCastLoseState:[STATE_ID, CHANCE]>` / `<onHitLoseState:[STATE_ID, CHANCE]>` | 0 |  | script |
| J-SkillExtend | `<onCastRemoveState:[STATE_ID, CHANCE]>` / `<onHitRemoveState:[STATE_ID, CHANCE]>` | 0 |  | script |
| J-SkillExtend | `<onCastSelfStateIfAfflicted:[STATE_TO_APPLY, CHANCE, STATE_REQUIREMENT]>` | 0 |  | script |
| J-SkillExtend | `<onCastStripState:[STATE_ID, CHANCE]>` / `<onHitStripState:[STATE_ID, CHANCE]>` | 0 |  | script |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<unslottedSkills:[SKILL_IDS]>` | 0 | editable on Classes | read |

Editable: `<stateDuration:FRAMES>`, `<stackType:refresh\|extend\|stack>`, `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>`, `<autoExecuteSkill:[SKILL_ID, CONDITION, PARAM]>`, `<affix-weight:N>`, `<enemy-prefix>`, `<autoApplyState:[STATE_ID, CONDITION, PARAM]>`, `<speedBoost:NUM>`, `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>`, `<hpFormula:[FORMULA]>`, `<lst:VALUE>`, `<rooted>`, `<hpFlat:VAL>`, `<stateDurationFlat:VAL>`, J-NaturalGrowths compat: `<cdmBuffPlus>`, `<shield:[FORMULA]>`, `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>`, `<shieldBreak:[SKILL_IDS...]>`, `<baseFastCooldown:[FORMULA]>`, `<critReductionBase:NUM>`, `<sdpMultiplier:AMOUNT>`, `<shieldProtect>`, `<tier-color-hex:#RRGGBB>`, `<dropMultiplier:NUM>`, `<aggroLock>`, `<shieldCap:[FORMULA]>`, `<critMultiplierBase:NUM>`, `<shieldType:[TYPES...]>`, `<proficiencyGivingBlock>`, `<shieldPriority:PRIORITY>`, `<goldMultiplier:NUM>`, `<absorbElements:[NUM]>`, `<strictElements:[NUM]>`, `<lv:NUM>`, `<maxLevelBoost:AMOUNT>`, `<expPlus:[FORMULA]>`, `<proficiencyBonus:NUM>`, `<slotCostModifier:AMOUNT>`.

### Enemies

15 editable, 3 partly, 85 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 2392 | only the BuffPlus quadrant is shown on this board; editable on Classes, States | read |
| J-Omnipedia-Monster | `<hideFromMonsterpedia>` / `<monsterFamilyIcon:ICON_INDEX>` / `<descriptionLine:TEXT>` | 344 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 290 | editable on Skills | read |
| J-ABS | `<enemy-weight:WEIGHT>` | 235 |  | script |
| J-ABS | `<knockbackResist:VAL>` / `<proximityKnockback:[RADIUS, PCT]>` / `<knockbackAmp:PCT>` /... | 148 |  | script |
| J-ABS-Pixelistics | `<hitboxSize:N>` / `<hitboxSize:[W, H]>` | 147 |  | script |
| J-ABS | `<noRewardPoints>` | 100 |  | script |
| J-Omnipedia-Monster | `<monsterType:KEY>` | 100 |  | script |
| J-ABS | `<immuneToAll>` / `<immuneToStates>` / `<immuneToNegatives>` / `<stateTypeImmune:TYPE>`... | 82 |  | script |
| J-Passive-Conditional | `<passiveStateRule:[STATE_ID, KIND, PARAM?]>` | 44 |  | script |
| J-Passive-Affix | `<no-rng-passives>` / `<no-rng-passive-prefixes>` / `<no-rng-passive-suffixes>` | 43 | missing: `no-rng-passives` | read |
| J-HUD-TargetFrame | `<targetFrameText:TEXT>` / `<targetFrameIcon:ICON_INDEX>` | 41 |  | script |
| J-ABS | `<respawn:[METHOD, PARAM]>` | 37 |  | script |
| J-Elementalistics | `<absorbElements:[NUM]>` / `<absorbElements:[NUM,NUM,...]>` | 26 | editable on States | read |
| J-CriticalFactors | J-NaturalGrowths compat: `<cdmBuffPlus>` / `<cdmBuffRate>` / `<cdmGrowthPlus>` / `<cdmG... | 24 | only the BuffPlus quadrant is shown on this board; editable on Classes, States | read |
| J-Passive-Conditional | `<passiveStateCount:[STATE_ID, KIND, PARAM]>` | 19 |  | script |
| J-Elementalistics | `<strictElements:[NUM]>` / `<strictElements:[NUM,NUM,...]>` | 10 | editable on States | read |
| J-HUD-TargetFrame | `<hideTargetFrame>` / `<hideTargetFrameText>` / `<hideTargetHpBar>` / `<hideTargetMpBar... | 10 |  | script |
| J-Proficiency | `<proficiencyGivingBlock>` / `<proficiencyGainingBlock>` | 10 | editable on States | read |
| J-ABS-DangerIndicator | `<noDangerIndicator>` / `<showDangerIndicator>` | 6 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 3 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 2 | editable on Skills | read |
| J-ABS | `<bonus-hits-global:VAL>` / `<bonus-hits-basic:VAL>` / `<bonus-hits-skill:VAL>` (+ form... | 1 |  | script |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 1 |  | script |
| J-ABS-Tools | `<gapClose:key>` / `<gapCloseTarget:key>` / `<gapCloseAny>` / `<blockGapClose>` | 1 | editable on States | read |
| J-LevelMaster | `<hideLevel>` | 1 |  | script |
| J-LevelMaster | `<learning:[SKILL_ID, LEVEL_LEARNED]>` | 1 |  | script |
| J-Passive-Conditional | `<autoExecuteSkill:[SKILL_ID, CONDITION, PARAM]>` | 1 | editable on States | read |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageForMyStateCount:PCT>` / `<thisBonusDamageForMyStateCount:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageIfSelfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfSelfState:[STATE_ID, PC... | 0 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfStateType:[TYPE, PCT]>` / `<bonusDamagePerStateType:[TYPE, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 0 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 0 |  | script |
| J-ABS | `<castTimeDamageBonus:N>` / `<thisCastTimeDamageBonus:N>` | 0 |  | script |
| J-ABS | `<cdr:[FORMULA]>` | 0 |  | script |
| J-ABS | `<dotAmpRate:VAL>` / `<hotAmpRate:VAL>` / `<thisDotAmpRate:VAL>` / `<thisHotAmpRate:VAL>` | 0 |  | script |
| J-ABS | `<encoreRepeats:[FORMULA]>` / `<accumulate>` | 0 |  | script |
| J-ABS | `<guardSkillId:SKILL_ID>` | 0 |  | script |
| J-ABS | `<ignoreParry:PCT>` / `<thisIgnoreParry:PCT>` | 0 |  | script |
| J-ABS | `<lootMagnetBuff:N>` / `<lootMagnetRate:N>` | 0 |  | read |
| J-ABS | `<luckyRolls:[FORMULA]>` / `<thisLuckyRolls:[FORMULA]>` / `<cursedRolls:[FORMULA]>` / `... | 0 |  | script |
| J-ABS | `<no:exp>` / `<no:gold>` | 0 |  | script |
| J-ABS | `<noCastPreview>` / `<castPreviewWarnAt:FRAMES>` / `<noCastPreviews>` | 0 | editable on Skills | read |
| J-ABS | `<noDamage>` | 0 |  | script |
| J-ABS | `<onEvadeApply:[STATE_ID, CHANCE]>` / `<onEvadeApplySelf:[STATE_ID, CHANCE]>` / `<onEva... | 0 |  | script |
| J-ABS | `<per:[FORMULA]>` | 0 |  | read |
| J-ABS | `<perDebuffBuff:N>` | 0 |  | script |
| J-ABS | `<projectileDuration:PERCENT_POINTS>` | 0 |  | script |
| J-ABS | `<radiusBuff:N>` / `<radiusRate:N>` / `<proximityBuff:N>` / `<proximityRate:N>` / `<thi... | 0 |  | script |
| J-ABS | `<rangeBuff:N>` / `<rangeRate:N>` | 0 |  | script |
| J-ABS | `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>` / `<thisSkillHistoryBonus:[WIN... | 0 | editable on States | read |
| J-ABS | `<skillTransform:[BASE, OVERRIDE]>` | 0 |  | script |
| J-ABS | `<slotTransform:[SLOT_KEY, SKILL_ID]>` | 0 |  | script |
| J-ABS | `<stateDurationFlat:VAL>` / `<stateDurationPerc:VAL>` / `<stateDurationFormula:[FORMULA]>` | 0 | editable on States | read |
| J-ABS | `<tickSpeedFlat:VAL>` / `<tickSpeedPercent:VAL>` / `<tickSpeedTypePercent:[TYPE, VAL]>`... | 0 |  | script |
| J-ABS | `<veryLucky>` / `<veryCursed>` | 0 |  | script |
| J-ABS | `<visionMultiplier:VAL>` | 0 |  | script |
| J-ABS | `<vulnerabilityPerAuthoredStateStack:PCT>` | 0 |  | script |
| J-ABS-Food | `<foodChainImpervious>` | 0 |  | script |
| J-ABS-Hitstop | `<hitstopScale:P%>` | 0 |  | script |
| J-ABS-Pixelistics | `<hitboxReveal:N>` | 0 |  | script |
| J-ABS-Shield | `<sar:PERCENT_POINTS>` / `<ser:PERCENT_POINTS>` | 0 |  | read |
| J-ABS-Shield | `<shieldBreak:[SKILL_IDS...]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseFastCooldown:[FORMULA]>` / `<fastCooldownFlat:[FORMULA]>` / `<fastCooldownRate:[F... | 0 | editable on States | read |
| J-Aptitude | `<no:ap>` | 0 |  | script |
| J-Aptitude-Typed | `<apTyped:[AMOUNT, DOMAIN, ID_OR_NAME]>` | 0 |  | script |
| J-Base | `<har:VALUE>` | 0 |  | read |
| J-CriticalFactors | `<critReductionBase:NUM>` / `<critReduction:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<forceCritProcs>` | 0 |  | script |
| J-DropsControl | `<dropQuantity:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 0 |  | script |
| J-Elementalistics | `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>` | 0 | editable on States | read |
| J-Elementalistics | `<pierceElement:[ELEMENT_ID, PIERCE_PERCENT]>` / `<thisPierceElement:[ELEMENT_ID, PIERC... | 0 |  | script |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-Motion-ABS | `<deathMotion:STYLE>` | 0 |  | script |
| J-Motion-ABS | `<noDeathMotion>` | 0 |  | script |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Passive-Affix | `<rewardMultiplier:[TYPE, VALUE]>` | 0 |  | script |
| J-Resources | `<hcr:[VALUE]>` | 0 |  | read |
| J-Resources-ABS | `<lst:VALUE>` / `<mst:VALUE>` / `<tst:VALUE>` | 0 | shown, not editable; editable on Armors, Classes, States, Weapons | read |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-Resources-ABS | `<when-hit-hp-gain:VALUE>` / `<when-hit-mp-gain:VALUE>` / `<when-hit-tp-gain:VALUE>` (+... | 0 |  | script |
| J-SDP | `<no:sdp>` | 0 |  | script |
| J-SDP | `<sdpMultiplier:AMOUNT>` / `<sdpMultiplier:-AMOUNT>` | 0 | editable on States | read |
| J-SkillExtend | `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>` | 0 | editable on Skills | read |

Editable: `<drops:[TYPE,ID,CHANCE]>`, `<alertDuration:DURATION>`, `<expPlus:[FORMULA]>`, `<lv:NUM>`, `<aiTrait:TRAIT>`, `<ap:AMOUNT>`, `<sdpPoints:VALUE>`, `<sdpDropData:[SDP_KEY, DROP_CHANCE]>`, `<sight:RADIUS>`, `<pursuit:RADIUS>`, `<jabsConfig:noIdle\|canIdle\|noHpBar\|showHpBar\|hideStates\|showStates\|noName\|showName\|invincible\|notInvincible\|inanimate\|notInanimate>`, `<maxTp:VALUE>`, `<aiRole:leader\|follower\|guardian\|ward\|solo\|sentinel>`, `<prepare:FRAMES>`, `<passive-affix-prefix-chance:PERCENT>`.

### Classes

7 editable, 0 partly, 77 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-LevelMaster | `<{param}GrowthCurve:[FORMULA]>` (8 base params, `mhp` … `luk`) / `<mtpGrowthCurve:[FOR... | 24 |  | script |
| J-ABS | `<autoAssignSkills>` / `<autoUpgradeSkills>` / `<noAutoAssignType:[TYPE_IDS...]>` / `<n... | 0 | editable on Skills | read |
| J-ABS | `<bonus-hits-global:VAL>` / `<bonus-hits-basic:VAL>` / `<bonus-hits-skill:VAL>` (+ form... | 0 |  | script |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageForMyStateCount:PCT>` / `<thisBonusDamageForMyStateCount:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageIfSelfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfSelfState:[STATE_ID, PC... | 0 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfStateType:[TYPE, PCT]>` / `<bonusDamagePerStateType:[TYPE, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 0 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 0 |  | script |
| J-ABS | `<castTimeDamageBonus:N>` / `<thisCastTimeDamageBonus:N>` | 0 |  | script |
| J-ABS | `<cdr:[FORMULA]>` | 0 |  | script |
| J-ABS | `<dotAmpRate:VAL>` / `<hotAmpRate:VAL>` / `<thisDotAmpRate:VAL>` / `<thisHotAmpRate:VAL>` | 0 |  | script |
| J-ABS | `<encoreRepeats:[FORMULA]>` / `<accumulate>` | 0 |  | script |
| J-ABS | `<ignoreParry:PCT>` / `<thisIgnoreParry:PCT>` | 0 |  | script |
| J-ABS | `<immuneToAll>` / `<immuneToStates>` / `<immuneToNegatives>` / `<stateTypeImmune:TYPE>`... | 0 |  | script |
| J-ABS | `<knockbackResist:VAL>` / `<proximityKnockback:[RADIUS, PCT]>` / `<knockbackAmp:PCT>` /... | 0 |  | script |
| J-ABS | `<lootMagnetBuff:N>` / `<lootMagnetRate:N>` | 0 |  | script |
| J-ABS | `<luckyRolls:[FORMULA]>` / `<thisLuckyRolls:[FORMULA]>` / `<cursedRolls:[FORMULA]>` / `... | 0 |  | script |
| J-ABS | `<noDamage>` | 0 |  | script |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 0 |  | script |
| J-ABS | `<onEvadeApply:[STATE_ID, CHANCE]>` / `<onEvadeApplySelf:[STATE_ID, CHANCE]>` / `<onEva... | 0 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 0 | editable on Skills | read |
| J-ABS | `<per:[FORMULA]>` | 0 |  | read |
| J-ABS | `<perDebuffBuff:N>` | 0 |  | script |
| J-ABS | `<projectileDuration:PERCENT_POINTS>` | 0 |  | script |
| J-ABS | `<radiusBuff:N>` / `<radiusRate:N>` / `<proximityBuff:N>` / `<proximityRate:N>` / `<thi... | 0 |  | script |
| J-ABS | `<rangeBuff:N>` / `<rangeRate:N>` | 0 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 0 |  | script |
| J-ABS | `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>` / `<thisSkillHistoryBonus:[WIN... | 0 | editable on States | read |
| J-ABS | `<skillTransform:[BASE, OVERRIDE]>` | 0 |  | script |
| J-ABS | `<slotTransform:[SLOT_KEY, SKILL_ID]>` | 0 |  | script |
| J-ABS | `<stateDurationFlat:VAL>` / `<stateDurationPerc:VAL>` / `<stateDurationFormula:[FORMULA]>` | 0 | editable on States | read |
| J-ABS | `<tickSpeedFlat:VAL>` / `<tickSpeedPercent:VAL>` / `<tickSpeedTypePercent:[TYPE, VAL]>`... | 0 |  | script |
| J-ABS | `<veryLucky>` / `<veryCursed>` | 0 |  | script |
| J-ABS | `<visionMultiplier:VAL>` | 0 |  | script |
| J-ABS | `<vulnerabilityPerAuthoredStateStack:PCT>` | 0 |  | script |
| J-ABS-AllyAI | `<defaultAi:PRESET>` | 0 |  | script |
| J-ABS-Food | `<foodChainImpervious>` | 0 |  | script |
| J-ABS-MoveSpeed | `<speedBoost:NUM>` | 0 | editable on States | read |
| J-ABS-Shield | `<sar:PERCENT_POINTS>` / `<ser:PERCENT_POINTS>` | 0 |  | read |
| J-ABS-Shield | `<shieldBreak:[SKILL_IDS...]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseFastCooldown:[FORMULA]>` / `<fastCooldownFlat:[FORMULA]>` / `<fastCooldownRate:[F... | 0 | editable on States | read |
| J-ABS-Tools | `<thisOnGapCloseEnd:[SKILL_IDS...]>` / `<onGapCloseEnd:[SKILL_IDS...]>` | 0 |  | script |
| J-Aptitude | `<aptMultiplier:AMOUNT>` / `<aptMultiplier:-AMOUNT>` | 0 |  | script |
| J-Base | `<har:VALUE>` | 0 |  | read |
| J-Base | `<maxTp:VALUE>` | 0 | editable on Armors, Enemies, Weapons | read |
| J-CriticalFactors | `<critMultiplierBase:NUM>` / `<critMultiplier:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<critReductionBase:NUM>` / `<critReduction:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<forceCritProcs>` | 0 |  | script |
| J-DropsControl | `<dropMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | `<dropQuantity:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 0 |  | script |
| J-DropsControl | `<goldMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | J-NaturalGrowths + SDP compat: `<dorBuffPlus>` / `<dorBuffRate>` / `<dorGrowthPlus>` / ... | 0 |  | script |
| J-Elementalistics | `<absorbElements:[NUM]>` / `<absorbElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-Elementalistics | `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>` | 0 | editable on States | read |
| J-Elementalistics | `<pierceElement:[ELEMENT_ID, PIERCE_PERCENT]>` / `<thisPierceElement:[ELEMENT_ID, PIERC... | 0 |  | script |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-Elementalistics | `<strictElements:[NUM]>` / `<strictElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-LevelMaster | `<lv:NUM>` / `<lvl:NUM>` / `<level:NUM>` | 0 | editable on Enemies, States | read |
| J-LevelMaster | `<maxLevelBoost:AMOUNT>` | 0 | editable on States | read |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 0 |  | script |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 0 | editable on Skills | read |
| J-Proficiency | `<proficiencyBonus:NUM>` | 0 | editable on States | read |
| J-Proficiency | `<proficiencyGivingBlock>` / `<proficiencyGainingBlock>` | 0 | editable on States | read |
| J-Resources | `<hcr:[VALUE]>` | 0 |  | read |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-Resources-ABS | `<when-hit-hp-gain:VALUE>` / `<when-hit-mp-gain:VALUE>` / `<when-hit-tp-gain:VALUE>` (+... | 0 |  | script |
| J-SDP | `<sdpBlackout>` | 0 |  | script |
| J-SDP | `<sdpMultiplier:AMOUNT>` / `<sdpMultiplier:-AMOUNT>` | 0 | editable on States | read |
| J-SkillExtend | `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>` | 0 | editable on Skills | read |
| J-SkillSlots | `<baseSlotPoints:[FORMULA]>` / `<maxSlotPoints:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<slotCostModifier:AMOUNT>` | 0 | editable on States | read |

Editable: `<aptitude:[SKILL_ID, REQUIRED_AP]>`, `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>`, `<unlockableForActors:[ACTOR_IDS]>`, `<unslottedSkills:[SKILL_IDS]>`, `<aptitudeTyped:[SKILL_ID, REQUIRED_AP, DOMAIN, ID_OR_NAME]>`, J-NaturalGrowths compat: `<cdmBuffPlus>`, `<lst:VALUE>`.

### Weapons

3 editable, 0 partly, 86 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-ABS | `<skillId:SKILL_ID>` / `<offhandSkillId:SKILL_ID>` / `<offhandEligible>` | 340 |  | script |
| J-JAFTING-Refine | `<noRefine>` / `<notRefinementBase>` / `<notRefinementMaterial>` | 126 |  | script |
| J-JAFTING-Refine | `<maxRefineCount:NUM>` | 108 |  | script |
| J-JAFTING-Refine | `<maxRefinedTraits:NUM>` | 108 |  | script |
| J-ABS-MoveSpeed | `<speedBoost:NUM>` | 98 | editable on States | read |
| J-CriticalFactors | J-NaturalGrowths compat: `<cdmBuffPlus>` / `<cdmBuffRate>` / `<cdmGrowthPlus>` / `<cdmG... | 29 | editable on Classes, Enemies, States | read |
| J-ABS | `<ignoreParry:PCT>` / `<thisIgnoreParry:PCT>` | 9 |  | script |
| J-ABS | `<stateDurationFlat:VAL>` / `<stateDurationPerc:VAL>` / `<stateDurationFormula:[FORMULA]>` | 3 | editable on States | read |
| J-ABS | `<counterGuard:[SKILL, CHANCE]>` / `<counterParry:[SKILL, CHANCE]>` / `<unparryable>` | 1 | editable on Skills | read |
| J-ABS | `<bonus-hits-global:VAL>` / `<bonus-hits-basic:VAL>` / `<bonus-hits-skill:VAL>` (+ form... | 0 |  | script |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageForMyStateCount:PCT>` / `<thisBonusDamageForMyStateCount:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageIfSelfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfSelfState:[STATE_ID, PC... | 0 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfStateType:[TYPE, PCT]>` / `<bonusDamagePerStateType:[TYPE, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 0 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 0 |  | script |
| J-ABS | `<castTimeDamageBonus:N>` / `<thisCastTimeDamageBonus:N>` | 0 |  | script |
| J-ABS | `<cdr:[FORMULA]>` | 0 |  | script |
| J-ABS | `<dotAmpRate:VAL>` / `<hotAmpRate:VAL>` / `<thisDotAmpRate:VAL>` / `<thisHotAmpRate:VAL>` | 0 |  | script |
| J-ABS | `<encoreRepeats:[FORMULA]>` / `<accumulate>` | 0 |  | script |
| J-ABS | `<guardSkillId:SKILL_ID>` | 0 |  | script |
| J-ABS | `<immuneToAll>` / `<immuneToStates>` / `<immuneToNegatives>` / `<stateTypeImmune:TYPE>`... | 0 |  | script |
| J-ABS | `<knockbackResist:VAL>` / `<proximityKnockback:[RADIUS, PCT]>` / `<knockbackAmp:PCT>` /... | 0 |  | script |
| J-ABS | `<lootMagnetBuff:N>` / `<lootMagnetRate:N>` | 0 |  | read |
| J-ABS | `<luckyRolls:[FORMULA]>` / `<thisLuckyRolls:[FORMULA]>` / `<cursedRolls:[FORMULA]>` / `... | 0 |  | script |
| J-ABS | `<noDamage>` | 0 |  | script |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 0 |  | script |
| J-ABS | `<onEvadeApply:[STATE_ID, CHANCE]>` / `<onEvadeApplySelf:[STATE_ID, CHANCE]>` / `<onEva... | 0 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 0 | editable on Skills | read |
| J-ABS | `<per:[FORMULA]>` | 0 |  | read |
| J-ABS | `<perDebuffBuff:N>` | 0 |  | script |
| J-ABS | `<projectileDuration:PERCENT_POINTS>` | 0 |  | script |
| J-ABS | `<radiusBuff:N>` / `<radiusRate:N>` / `<proximityBuff:N>` / `<proximityRate:N>` / `<thi... | 0 |  | script |
| J-ABS | `<rangeBuff:N>` / `<rangeRate:N>` | 0 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 0 |  | script |
| J-ABS | `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>` / `<thisSkillHistoryBonus:[WIN... | 0 | editable on States | read |
| J-ABS | `<skillTransform:[BASE, OVERRIDE]>` | 0 |  | script |
| J-ABS | `<slotTransform:[SLOT_KEY, SKILL_ID]>` | 0 |  | script |
| J-ABS | `<tickSpeedFlat:VAL>` / `<tickSpeedPercent:VAL>` / `<tickSpeedTypePercent:[TYPE, VAL]>`... | 0 |  | script |
| J-ABS | `<veryLucky>` / `<veryCursed>` | 0 |  | script |
| J-ABS | `<visionMultiplier:VAL>` | 0 |  | script |
| J-ABS | `<vulnerabilityPerAuthoredStateStack:PCT>` | 0 |  | script |
| J-ABS-Food | `<foodChainImpervious>` | 0 |  | script |
| J-ABS-Shield | `<sar:PERCENT_POINTS>` / `<ser:PERCENT_POINTS>` | 0 |  | read |
| J-ABS-Shield | `<shieldBreak:[SKILL_IDS...]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseFastCooldown:[FORMULA]>` / `<fastCooldownFlat:[FORMULA]>` / `<fastCooldownRate:[F... | 0 | editable on States | read |
| J-Aptitude | `<aptitude:[SKILL_ID, REQUIRED_AP]>` | 0 | editable on Classes | read |
| J-Aptitude | `<aptMultiplier:AMOUNT>` / `<aptMultiplier:-AMOUNT>` | 0 |  | script |
| J-Aptitude-Typed | `<aptitudeTyped:[SKILL_ID, REQUIRED_AP, DOMAIN, ID_OR_NAME]>` | 0 | editable on Classes | read |
| J-Base | `<har:VALUE>` | 0 |  | read |
| J-Base | `<max:VALUE>` | 0 |  | script |
| J-Base | `<this(mhp\|mmp\|mtp\|atk\|def\|mat\|mdf\|agi\|luk\|hit\|eva\|cri\|cev\|mev\|mrf\|cnt\|hrg\|mrg\|trg\|tgr\|... | 0 |  | script |
| J-CriticalFactors | `<critMultiplierBase:NUM>` / `<critMultiplier:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<critReductionBase:NUM>` / `<critReduction:NUM>` | 0 | editable on States | read |
| J-CriticalFactors | `<forceCritProcs>` | 0 |  | script |
| J-DropsControl | `<dropMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | `<dropQuantity:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgradeId:ID>` | 0 |  | script |
| J-DropsControl | `<goldMultiplier:NUM>` | 0 | editable on States | read |
| J-DropsControl | J-NaturalGrowths + SDP compat: `<dorBuffPlus>` / `<dorBuffRate>` / `<dorGrowthPlus>` / ... | 0 |  | script |
| J-Elementalistics | `<absorbElements:[NUM]>` / `<absorbElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-Elementalistics | `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>` | 0 | editable on States | read |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-Elementalistics | `<strictElements:[NUM]>` / `<strictElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-JAFTING-Refine | `<transferrableEffectsBelow>` | 0 |  | script |
| J-LevelMaster | `<lv:NUM>` / `<lvl:NUM>` / `<level:NUM>` | 0 | editable on Enemies, States | read |
| J-LevelMaster | `<maxLevelBoost:AMOUNT>` | 0 | editable on States | read |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 0 |  | script |
| J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 0 | editable on Classes, Enemies, States | read |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 0 | editable on Skills | read |
| J-Proficiency | `<proficiencyBonus:NUM>` | 0 | editable on States | read |
| J-Proficiency | `<proficiencyGivingBlock>` / `<proficiencyGainingBlock>` | 0 | editable on States | read |
| J-Resources | `<hcr:[VALUE]>` | 0 |  | read |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-Resources-ABS | `<when-hit-hp-gain:VALUE>` / `<when-hit-mp-gain:VALUE>` / `<when-hit-tp-gain:VALUE>` (+... | 0 |  | script |
| J-SDP | `<sdpBlackout>` | 0 |  | script |
| J-SDP | `<sdpMultiplier:AMOUNT>` / `<sdpMultiplier:-AMOUNT>` | 0 | editable on States | read |
| J-SkillExtend | `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>` | 0 | editable on Skills | read |
| J-SkillSlots | `<baseSlotPoints:[FORMULA]>` / `<maxSlotPoints:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<slotCostModifier:AMOUNT>` | 0 | editable on States | read |
| J-SkillSlots | `<unslottedSkills:[SKILL_IDS]>` | 0 | editable on Classes | read |

Editable: `<maxTp:VALUE>`, `<ingredientType:TYPE>`, `<lst:VALUE>`.

### Armors

3 editable, 0 partly, 84 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-DropsControl | `<dropUpgradeId:ID>` | 184 |  | script |
| J-JAFTING-Refine | `<transferrableEffectsBelow>` | 90 |  | script |
| J-ABS-MoveSpeed | `<speedBoost:NUM>` | 35 | editable on States | read |
| J-ABS | `<guardSkillId:SKILL_ID>` | 20 |  | script |
| J-Elementalistics | `<boostElement:[ELEMENT_ID, PERCENT_BOOST]>` | 12 | editable on States | read |
| J-ABS | `<skillId:SKILL_ID>` / `<offhandSkillId:SKILL_ID>` / `<offhandEligible>` | 10 |  | script |
| J-ABS-Shield | `<sar:PERCENT_POINTS>` / `<ser:PERCENT_POINTS>` | 10 |  | read |
| J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 10 | editable on Classes, Enemies, States | read |
| J-Proficiency | `<proficiencyBonus:NUM>` | 10 | editable on States | read |
| J-SDP | `<sdpMultiplier:AMOUNT>` / `<sdpMultiplier:-AMOUNT>` | 9 | editable on States | read |
| J-ABS | `<cdr:[FORMULA]>` | 5 |  | script |
| J-ABS | `<per:[FORMULA]>` | 5 |  | read |
| J-Aptitude | `<aptMultiplier:AMOUNT>` / `<aptMultiplier:-AMOUNT>` | 5 |  | script |
| J-Base | `<har:VALUE>` | 5 |  | read |
| J-CriticalFactors | `<critMultiplierBase:NUM>` / `<critMultiplier:NUM>` | 5 | editable on States | read |
| J-CriticalFactors | `<critReductionBase:NUM>` / `<critReduction:NUM>` | 5 | editable on States | read |
| J-DropsControl | `<dropMultiplier:NUM>` | 5 | editable on States | read |
| J-DropsControl | `<goldMultiplier:NUM>` | 5 | editable on States | read |
| J-Resources | `<hcr:[VALUE]>` | 5 |  | read |
| J-ABS | `<knockbackResist:VAL>` / `<proximityKnockback:[RADIUS, PCT]>` / `<knockbackAmp:PCT>` /... | 4 |  | script |
| J-ABS | `<stateDurationFlat:VAL>` / `<stateDurationPerc:VAL>` / `<stateDurationFormula:[FORMULA]>` | 4 | editable on States | read |
| J-ABS | `<bonus-hits-global:VAL>` / `<bonus-hits-basic:VAL>` / `<bonus-hits-skill:VAL>` (+ form... | 3 |  | script |
| J-Elementalistics | `<absorbElements:[NUM]>` / `<absorbElements:[NUM,NUM,...]>` | 3 | editable on States | read |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageForMyStateCount:PCT>` / `<thisBonusDamageForMyStateCount:PCT>` | 0 |  | script |
| J-ABS | `<bonusDamageIfSelfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfSelfState:[STATE_ID, PC... | 0 |  | script |
| J-ABS | `<bonusDamageIfState:[STATE_ID, PCT]>` / `<thisBonusDamageIfState:[STATE_ID, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfStateType:[TYPE, PCT]>` / `<bonusDamagePerStateType:[TYPE, PCT]>` | 0 |  | script |
| J-ABS | `<bonusDamageIfTargetHpBelow:[THRESHOLD_PCT, PCT_PER_POINT]>` / `<thisBonusDamageIfTarg... | 0 |  | script |
| J-ABS | `<bonusDamagePerStateStack:[STATE_ID, PCT]>` / `<thisBonusDamagePerStateStack:[STATE_ID... | 0 |  | script |
| J-ABS | `<castTimeDamageBonus:N>` / `<thisCastTimeDamageBonus:N>` | 0 |  | script |
| J-ABS | `<dotAmpRate:VAL>` / `<hotAmpRate:VAL>` / `<thisDotAmpRate:VAL>` / `<thisHotAmpRate:VAL>` | 0 |  | script |
| J-ABS | `<encoreRepeats:[FORMULA]>` / `<accumulate>` | 0 |  | script |
| J-ABS | `<ignoreParry:PCT>` / `<thisIgnoreParry:PCT>` | 0 |  | script |
| J-ABS | `<immuneToAll>` / `<immuneToStates>` / `<immuneToNegatives>` / `<stateTypeImmune:TYPE>`... | 0 |  | script |
| J-ABS | `<lootMagnetBuff:N>` / `<lootMagnetRate:N>` | 0 |  | read |
| J-ABS | `<luckyRolls:[FORMULA]>` / `<thisLuckyRolls:[FORMULA]>` / `<cursedRolls:[FORMULA]>` / `... | 0 |  | script |
| J-ABS | `<noDamage>` | 0 |  | script |
| J-ABS | `<noSelfKill>` / `<thisNoSelfKill>` / `<noTargetKill>` / `<thisNoTargetKill>` | 0 |  | script |
| J-ABS | `<onEvadeApply:[STATE_ID, CHANCE]>` / `<onEvadeApplySelf:[STATE_ID, CHANCE]>` / `<onEva... | 0 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 0 | editable on Skills | read |
| J-ABS | `<perDebuffBuff:N>` | 0 |  | script |
| J-ABS | `<projectileDuration:PERCENT_POINTS>` | 0 |  | script |
| J-ABS | `<radiusBuff:N>` / `<radiusRate:N>` / `<proximityBuff:N>` / `<proximityRate:N>` / `<thi... | 0 |  | script |
| J-ABS | `<rangeBuff:N>` / `<rangeRate:N>` | 0 |  | script |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 0 |  | script |
| J-ABS | `<skillHistoryBonus:[TYPE_ID, WINDOW, PCT, COUNT_MODE]>` / `<thisSkillHistoryBonus:[WIN... | 0 | editable on States | read |
| J-ABS | `<skillTransform:[BASE, OVERRIDE]>` | 0 |  | script |
| J-ABS | `<slotTransform:[SLOT_KEY, SKILL_ID]>` | 0 |  | script |
| J-ABS | `<veryLucky>` / `<veryCursed>` | 0 |  | script |
| J-ABS | `<visionMultiplier:VAL>` | 0 |  | script |
| J-ABS | `<vulnerabilityPerAuthoredStateStack:PCT>` | 0 |  | script |
| J-ABS-Food | `<foodChainImpervious>` | 0 |  | script |
| J-ABS-Shield | `<shieldBreak:[SKILL_IDS...]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseCastTime:[FORMULA]>` / `<castTimeFlat:[FORMULA]>` / `<castSpeedRate:[FORMULA]>` | 0 | editable on States | read |
| J-ABS-Timing | `<baseFastCooldown:[FORMULA]>` / `<fastCooldownFlat:[FORMULA]>` / `<fastCooldownRate:[F... | 0 | editable on States | read |
| J-Aptitude | `<aptitude:[SKILL_ID, REQUIRED_AP]>` | 0 | editable on Classes | read |
| J-Aptitude-Typed | `<aptitudeTyped:[SKILL_ID, REQUIRED_AP, DOMAIN, ID_OR_NAME]>` | 0 | editable on Classes | read |
| J-Base | `<max:VALUE>` | 0 |  | script |
| J-Base | `<this(mhp\|mmp\|mtp\|atk\|def\|mat\|mdf\|agi\|luk\|hit\|eva\|cri\|cev\|mev\|mrf\|cnt\|hrg\|mrg\|trg\|tgr\|... | 0 |  | script |
| J-CriticalFactors | `<forceCritProcs>` | 0 |  | script |
| J-CriticalFactors | J-NaturalGrowths compat: `<cdmBuffPlus>` / `<cdmBuffRate>` / `<cdmGrowthPlus>` / `<cdmG... | 0 | editable on Classes, Enemies, States | read |
| J-DropsControl | `<dropQuantity:NUM>` | 0 |  | script |
| J-DropsControl | `<dropUpgrade:NUM>` | 0 |  | script |
| J-DropsControl | J-NaturalGrowths + SDP compat: `<dorBuffPlus>` / `<dorBuffRate>` / `<dorGrowthPlus>` / ... | 0 |  | script |
| J-Elementalistics | `<slayer:[ELEMENT_ID, PERCENT]>` | 0 |  | script |
| J-Elementalistics | `<strictElements:[NUM]>` / `<strictElements:[NUM,NUM,...]>` | 0 | editable on States | read |
| J-JAFTING-Refine | `<maxRefineCount:NUM>` | 0 |  | script |
| J-JAFTING-Refine | `<maxRefinedTraits:NUM>` | 0 |  | script |
| J-JAFTING-Refine | `<noRefine>` / `<notRefinementBase>` / `<notRefinementMaterial>` | 0 |  | script |
| J-LevelMaster | `<lv:NUM>` / `<lvl:NUM>` / `<level:NUM>` | 0 | editable on Enemies, States | read |
| J-LevelMaster | `<maxLevelBoost:AMOUNT>` | 0 | editable on States | read |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 0 |  | script |
| J-NaturalGrowths | `<baseMaxTp:[FORMULA]>` | 0 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 0 | editable on Skills | read |
| J-Proficiency | `<proficiencyGivingBlock>` / `<proficiencyGainingBlock>` | 0 | editable on States | read |
| J-Resources-ABS | `<onSelf{Trigger}Heal{Output}:[PERCENT, RANGE, MAX_DEPTH?]>` / `<onAlly{Trigger}Heal{Ou... | 0 |  | script |
| J-Resources-ABS | `<when-hit-hp-gain:VALUE>` / `<when-hit-mp-gain:VALUE>` / `<when-hit-tp-gain:VALUE>` (+... | 0 |  | script |
| J-SDP | `<sdpBlackout>` | 0 |  | script |
| J-SkillExtend | `<applyState:[STATE_ID, CHANCE, DURATION?, STACKS?]>` | 0 | editable on Skills | read |
| J-SkillSlots | `<baseSlotPoints:[FORMULA]>` / `<maxSlotPoints:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 0 |  | script |
| J-SkillSlots | `<slotCostModifier:AMOUNT>` | 0 | editable on States | read |
| J-SkillSlots | `<unslottedSkills:[SKILL_IDS]>` | 0 | editable on Classes | read |

Editable: `<ingredientType:TYPE>`, `<lst:VALUE>`, `<maxTp:VALUE>`.

### Items

4 editable, 0 partly, 47 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-ABS | `<cooldown:VAL>` / `<uniqueCooldown>` | 215 | editable on Skills | read |
| J-DropsControl | `<dropUpgradeId:ID>` | 123 |  | script |
| J-ABS | `<hideFromJabsMenu>` | 26 | editable on Skills | read |
| J-ABS | `<jabsTool>` | 6 |  | script |
| J-SDP | `<sdpPoints:VALUE>` | 6 | editable on Enemies | read |
| J-ABS | `<skillId:SKILL_ID>` / `<offhandSkillId:SKILL_ID>` / `<offhandEligible>` | 5 |  | script |
| J-ABS | `<actionId:EVENT_ID>` | 0 | editable on Skills | read |
| J-ABS | `<aggro:VAL>` / `<aggroMultiplier:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<aggroPercent:VAL>` | 0 |  | script |
| J-ABS | `<bonus-hits:VAL>` / `<bonus-hits:[FORMULA]>` | 0 | editable on Skills | read |
| J-ABS | `<bonusDamage:PCT>` / `<thisBonusDamage:PCT>` | 0 |  | script |
| J-ABS | `<cannotMoveToInterrupt>` / `<interrupt:MAGNIFIER>` / `<thisCannotBeInterrupted>` / `<c... | 0 |  | script |
| J-ABS | `<castTime:VAL>` / `<castAnimation:VAL>` / `<selfAnimationId:VAL>` / `<onCastAnimationI... | 0 | editable on Skills | read |
| J-ABS | `<channel:[SKILL_ID, TOTAL_DURATION]>` / `<channelTickSpeed:VAL>` / `<onChannelComplete... | 0 |  | script |
| J-ABS | `<combo:[COMBO_SKILL_ID, LINK_TIME?, EXPIRE_FRAMES?]>` / `<comboStarter>` / `<freeCombo... | 0 | editable on Skills | read |
| J-ABS | `<counterGuard:[SKILL, CHANCE]>` / `<counterParry:[SKILL, CHANCE]>` / `<unparryable>` | 0 | editable on Skills | read |
| J-ABS | `<degrees:VAL>` / `<thickness:VAL>` / `<innerRadius:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<delay:[DURATION, TOUCHABLE, TRIGGER_RADIUS?]>` | 0 | editable on Skills | read |
| J-ABS | `<direct>` / `<directLock>` | 0 | editable on Skills | read |
| J-ABS | `<directStateTarget:STATE_ID>` | 0 |  | script |
| J-ABS | `<duration:FRAMES>` / `<linger:FRAMES>` | 0 | editable on Skills | read |
| J-ABS | `<guard:[FLAT, PERCENT]>` / `<parry:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<hitbox:circle\|rhombus\|arc\|square\|line\|wall\|cross>` | 0 | editable on Skills | read |
| J-ABS | `<knockback:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<noCastPreview>` / `<castPreviewWarnAt:FRAMES>` / `<noCastPreviews>` | 0 | editable on Skills | read |
| J-ABS | `<noGlobalCooldown>` / `<ogcd>` / `<gcd:FRAMES>` | 0 | editable on Skills | read |
| J-ABS | `<notMyAggro:VAL>` / `<notMyAggroPercent:VAL>` | 0 |  | script |
| J-ABS | `<onOwnDefeat:[SKILL_ID, CHANCE]>` / `<onTargetDefeat:[SKILL_ID, CHANCE]>` / `<onDefeat... | 0 | editable on Skills | read |
| J-ABS | `<pierce:[TIMES, DELAY]>` | 0 | editable on Skills | read |
| J-ABS | `<projectile:VAL>` / `<formation:line\|spray\|cross\|xburst\|nova>` | 0 | editable on Skills | read |
| J-ABS | `<proximity:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<purgeStates:[TYPE, ALLOW_DEATH, COUNT]>` / `<noLogs>` | 0 |  | script |
| J-ABS | `<radius:VAL>` | 0 | editable on Skills | read |
| J-ABS | `<retaliate:[SKILL_ID, CHANCE, TYPE?]>` | 0 |  | script |
| J-ABS | `<thisRangeBuff:N>` / `<thisRangeRate:N>` / `<thisRadiusBuff:N>` / `<thisRadiusRate:N>`... | 0 |  | script |
| J-ABS | `<useOnPickup>` / `<expires:DURATION>` | 0 |  | script |
| J-ABS | `<visAnchor:[AX, AY]>` / `<visRotate>` / `<visScale:[SX, SY]>` / `<visZ:VAL>` / `<visDe... | 0 | editable on Skills | read |
| J-ABS | `<visOffset:[X, Y]>` / directional `<visOffset(U\|D\|L\|R\|UR\|UL\|DR\|DL):[X, Y]>` | 0 | editable on Skills | read |
| J-ABS-Poses | `<poseSuffix:[SUFFIX, INDEX, DURATION]>` | 0 |  | script |
| J-Base | `<max:VALUE>` | 0 |  | script |
| J-CriticalFactors | `<thisCritApply:[STATE_ID, CHANCE]>` / `<thisCritSelf:[STATE_ID, CHANCE]>` / `<onCritAp... | 0 |  | script |
| J-CriticalFactors | `<thisCritChanceIfState:[STATE_ID, BONUS_CHANCE]>` / `<critChanceIfState:[STATE_ID, BON... | 0 |  | script |
| J-CriticalFactors | `<thisCritMultiplier:[FORMULA]>` | 0 |  | script |
| J-CriticalFactors | `<thisCritsAlwaysIfState:[STATE_ID, ...]>` / `<critAlwaysIfState:[STATE_ID, ...]>` | 0 |  | script |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 0 | editable on Skills | read |
| J-Passive-OTIB | `<otib:[STATE_ID]>` / `<otib:[STATE_ID, STATE_ID, ...]>` | 0 |  | script |
| J-SDP | `<sdpUnlock:SDP_KEY>` | 0 |  | script |

Editable: `<ingredientType:TYPE>`, `<food:TYPE>`, `<thisCritChance:[FORMULA]>`, `<thisCritsAlways>`.

### Actors

The editor reads Actors only to fill pickers, so none of the 87 tags that apply to an actor can be changed. The ones Chef Adventure uses on an actor today:

| Plugin | Tag | CA uses |
|---|---|---:|
| J-NaturalGrowths | `<(PARAM)(Buff\|Growth)(Plus\|Rate):[FORMULA]>` | 6 |
| J-ABS | `<pursuit:RADIUS>` | 2 |
| J-ABS | `<sight:RADIUS>` | 2 |
| J-ABS-AllyAI | `<defaultAi:PRESET>` | 2 |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 2 |
| J-SkillSlots | `<baseSlots:[FORMULA]>` / `<maxSlots:[FORMULA]>` | 2 |

The other 81 apply to actors but are unused there today.

## Notetags on maps and events

The map editor writes these through three modules only. The battler brush writes an enemy event's page comments:
level, move speed, sight, pursuit, alert boosts and duration, the inanimate, idle, HP bar and name switches, enemy,
team, AI traits and roles, passives and motion. The weather module (`<weather>`, `<noWeather>`) and the lighting
module (`<ambient>`, `<noToneChange>`) write the map's own note. The lighting module's quick panel also rewrites an
existing `<light>` in place. Nothing writes an event's note box, and the pixel, quest, regions and time modules only
read what is there.

### Event page comments

13 editable, 2 partly, 30 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-ABS | `<enemyIds:[ENEMY_IDS]>` | 3172 |  | script |
| J-ABS | `<respawn:[METHOD, PARAM]>` | 1607 |  | read |
| J-Escribe | `<text:EVENT_TEXT>` / `<icon:ICON_INDEX>` | 1426 |  | read |
| J-ABS | `<jabsConfig:noIdle\|canIdle\|noHpBar\|showHpBar\|hideStates\|showStates\|noName\|showName\|inv... | 930 | editable on Enemies | read |
| J-Lighting | `<light:[TILES]>` / `<light:[TILES, COLOR]>` / `<light:[TILES, COLOR, INTENSITY]>` / `<... | 907 | the light quick panel edits reach, colour, intensity and effect on an event's first lit page; nothing adds or removes a light, or reaches a later page | read |
| J-Pixelistics | `<areaEvent:[WIDTH, HEIGHT]>` | 761 | shown, not editable | read |
| J-Passive | `<passive:[STATE_IDS]>` / `<uniquePassive:[STATE_IDS]>` | 712 | missing: `uniquePassive`; editable on Skills | read |
| J-TIME | `<{unit}RangePage:START-END>` / `<{unit}RangeChoice:START-END>` | 639 | shown, not editable | read |
| J-Escribe | `<proximityText:DISTANCE>` / `<proximityIcon:DISTANCE>` | 436 |  | script |
| J-TIME | `<timeRangePage:HH:MM-HH:MM>` / `<timeRangeChoice:HH:MM-HH:MM>` | 310 | shown, not editable | read |
| J-Omnipedia-Quest | `<pageQuestCondition:[...]>` / `<choiceQuestCondition:[...]>` | 255 | shown, not editable | read |
| J-TIME | `<{unit}Page:VALUE>` / `<{unit}Choice:VALUE>` | 55 | shown, not editable | read |
| J-Passive-Affix | `<no-rng-passives>` / `<no-rng-passive-prefixes>` / `<no-rng-passive-suffixes>` | 20 | editable on Enemies | read |
| J-Message-Chatter | `<chatterRadius:TILES>` / `<chatterCooldown:FRAMES>` / `<chatterDelay:FRAMES>` / `<chat... | 11 |  | script |
| J-Message-Chatter | `<chatter:LINE>` | 8 |  | script |
| J-Message | `<switchOnChoiceCondition:SWITCH_ID>` / `<switchOffChoiceCondition:SWITCH_ID>` | 6 |  | script |
| J-ABS-Pixelistics | `<hitboxSize:N>` / `<hitboxSize:[W, H]>` | 3 |  | script |
| J-Minimap | `<minimap:MARKER_TYPE>` / `<mm:MARKER_TYPE>` | 3 |  | script |
| J-ABS-DangerIndicator | `<noDangerIndicator>` / `<showDangerIndicator>` | 2 |  | script |
| J-HUD-TargetFrame | `<hideTargetFrame>` / `<hideTargetFrameText>` / `<hideTargetHpBar>` / `<hideTargetMpBar... | 2 |  | script |
| J-Pixelistics | `<relativeTransfer>` | 2 |  | script |
| J-ABS | `<guardRange:NUM>` | 1 |  | read |
| J-ABS | `<noRespawn>` | 1 |  | read |
| J-ABS | `<proximity:VAL>` | 1 | editable on Skills | read |
| J-ABS | `<respawnAnimation:ANIMATION_ID>` | 1 |  | read |
| J-HUD-TargetFrame | `<targetFrameText:TEXT>` / `<targetFrameIcon:ICON_INDEX>` | 1 |  | script |
| J-LevelMaster | `<hideLevel>` | 1 |  | script |
| J-Message | `<leaderChoiceCondition:ACTOR_ID>` / `<notLeaderChoiceCondition:ACTOR_ID>` | 1 |  | script |
| J-ABS-Pixelistics | `<hitboxReveal:N>` | 0 |  | script |
| J-ABS-StarBattles | `<battleMap:MAP_ID>` | 0 |  | script |
| J-Passive-Affix | `<passive-affix-prefix-chance:PERCENT>` / `<passive-affix-suffix-chance:PERCENT>` | 0 | editable on Enemies | read |
| J-TIME | `<fullDateRangePage:[MINUTE,HOUR,DAY,MONTH,YEAR]-[...]>` / `<fullDateRangeChoice:[...]-... | 0 | shown, not editable | read |

Editable: `<enemyId:ENEMY_ID>`, `<motion:[squish]>`, `<motion:[TYPE]>`, `<motion:[TYPE, PARAM, ...]>` on a state, `<motion:[TYPE, PARAM, ...]>` on a passive state, `<moveSpeed:SPEED>`, `<lv:NUM>`, `<alertDuration:DURATION>`, `<sight:RADIUS>`, `<pursuit:RADIUS>`, `<aiTrait:TRAIT>`, `<aiRole:leader\|follower\|guardian\|ward\|solo\|sentinel>`, `<teamId:TEAM>`.

### Event notes

0 editable, 0 partly, 20 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-ABS | `<moveSpeed:SPEED>` | 1 | shown, not editable | read |
| J-ABS | `<aiRole:leader\|follower\|guardian\|ward\|solo\|sentinel>` | 0 | editable on Enemies | read |
| J-ABS | `<aiTrait:TRAIT>` | 0 | editable on Enemies | read |
| J-ABS | `<alertDuration:DURATION>` / `<alertedSightBoost:RADIUS_BOOST>` / `<alertedPursuitBoost... | 0 | shown, not editable; editable on Enemies | read |
| J-ABS | `<guardRange:NUM>` | 0 |  | read |
| J-ABS | `<jabsConfig:noIdle\|canIdle\|noHpBar\|showHpBar\|hideStates\|showStates\|noName\|showName\|inv... | 0 | editable on Enemies | read |
| J-ABS | `<noCastPreview>` / `<castPreviewWarnAt:FRAMES>` / `<noCastPreviews>` | 0 | editable on Skills | read |
| J-ABS | `<noRespawn>` | 0 |  | read |
| J-ABS | `<prepare:FRAMES>` | 0 | editable on Enemies | read |
| J-ABS | `<pursuit:RADIUS>` | 0 | shown, not editable; editable on Enemies | read |
| J-ABS | `<respawn:[METHOD, PARAM]>` | 0 |  | read |
| J-ABS | `<respawnAnimation:ANIMATION_ID>` | 0 |  | read |
| J-ABS | `<sight:RADIUS>` | 0 | shown, not editable; editable on Enemies | read |
| J-ABS | `<teamId:TEAM>` | 0 | shown, not editable; editable on Enemies | read |
| J-ABS-Juice | `<motion:[squish]>` / `<motion:[tilt]>` / `<motion:[flip]>` / `<motion:[charge]>` | 0 | shown, not editable | read |
| J-ABS-Tools | `<gapClose:key>` / `<gapCloseTarget:key>` / `<gapCloseAny>` / `<blockGapClose>` | 0 | editable on States | read |
| J-HUD-TargetFrame | `<hideTargetFrame>` / `<hideTargetFrameText>` / `<hideTargetHpBar>` / `<hideTargetMpBar... | 0 |  | script |
| J-HUD-TargetFrame | `<targetFrameText:TEXT>` / `<targetFrameIcon:ICON_INDEX>` | 0 |  | script |
| J-LevelMaster | `<hideLevel>` | 0 |  | script |
| J-LevelMaster | `<lv:NUM>` / `<lvl:NUM>` / `<level:NUM>` | 0 | editable on Enemies, States | read |

### Map notes

3 editable, 1 partly, 12 not editable.

| Plugin | Tag | CA uses | Note | Checked |
|---|---|---:|---|---|
| J-RegionEffects-States | `<regionAddState:[REGION_ID, STATE_ID, CHANCE?, ANIMATION_ID?]>` | 15 |  | script |
| J-RegionEffects | `<allowRegions:[REGION_IDS]>` / `<denyRegions:[REGION_IDS]>` | 2 | shown, not editable | read |
| J-RegionEffects-Skills | `<regionSkill:[REGION_ID, SKILL_ID, CHANCE, CASTER_ENEMY_ID, IS_FRIENDLY]>` | 2 |  | script |
| J-ABS | `<enemy-weight-override:[ENEMY_ID, WEIGHT]>` | 0 |  | script |
| J-ABS | `<enemyId:ENEMY_ID>` | 0 | shown, not editable | read |
| J-ABS | `<enemyIds:[ENEMY_IDS]>` | 0 |  | script |
| J-ABS-StarBattles | `<battleMap:MAP_ID>` | 0 |  | script |
| J-CAMods | `<damageFlat:VALUE>` / `<damagePerc:VALUE>` | 0 |  | script |
| J-Level-Sync | `<levelSync:N>` | 0 |  | script |
| J-Level-Sync | `<levelSyncUp>` | 0 |  | script |
| J-Minimap | `<blockMinimap>` | 0 |  | script |
| J-TIME | `<noToneChange>` / `<timeBlock>` | 0 | missing: `timeBlock` | read |
| J-Weather-Time | `<climate:NAME>` | 0 | shown, not editable | read |

Editable: `<weather:PRESET>`, `<ambient:[DARKNESS]>`, `<noWeather>`.

## Config files

Every config file below loads through the editor's strict server models without a refusal. Field coverage was
checked against every key Chef Adventure's copy holds.

| File | Read by | Editor | Gaps |
|---|---|---|---|
| `config.message.json` | J-Message, -Bubbles, -Chatter | none | the whole file |
| `config.lighting.json` | J-Lighting | the map editor reads its light defaults | the whole file: no save route, no board |
| `config.lighting-time.json` | J-Lighting-Time | the map editor previews it | the whole file: no save route, no board |
| `config.difficulty.json` | J-Passive-Difficulty | Difficulty board | each layer's `description` and `unlocked` |
| `config.jabs.json` | J-ABS family | JABS board | the `loot` block: `magnetRadius`, `magnetSpeed`, `magnetAcceleration` |
| `config.motion.json` | J-Motion, J-Motion-ABS | Motion board | none; `presence` is listed among the motion types |
| `config.weather.json` | J-Weather family | Weather board | none |
| `config.crafting.json`, `.level`, `.omni`, `.proficiency`, `.quest`, `.sdp`, `.notetag-lines` | their plugins | their boards | none found |

Not checked: fields a plugin accepts that Chef Adventure's copy of the file never sets.

## Vanilla tables and fields

| Table | Edited in | Gaps |
|---|---|---|
| Actors | nowhere (read for pickers) | the whole table |
| Animations | nowhere (read for pickers) | the whole table |
| Troops | nowhere (no route) | the whole table |
| Common Events, Tilesets, MapInfos, System | map editor | not audited field by field here |
| Enemies | Enemies board | the action list (`skillId`, `conditionType`, `conditionParam1`, `conditionParam2`, `rating`), `battlerName`, `battlerHue`, `dropItems` |
| Classes | Classes board | `expParams` |
| Items | Items board | `animationId` (the Skills and Weapons boards have one; Items does not) |
| Skills, States | their boards | `messageType` |
| Weapons | Weapons board | `etypeId` (always 1 for a weapon, so nothing is lost) |
| Armors | Armors board | none |

A field counts as editable here when the board's own UI names it; the domain models name every field, so they
were left out of that check. The trait editor knows all 25 trait codes and the effect catalog all 13 effect codes,
so every trait and effect Chef Adventure uses can be edited.

## Loose ends found on the way

- `<damageFlat>` and `<damagePerc>` are documented in the notetag reference, but no plugin reads either.
- `<battleMap>` belongs to J-ABS-StarBattles, which is still in flight.
- `<[param]GrowthCurve>` is read through a regex J-LevelMaster builds at runtime, so it is missing from the RegExp tables; the Classes board writes it.

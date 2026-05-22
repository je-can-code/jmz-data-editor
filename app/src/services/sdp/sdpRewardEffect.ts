type UnlockSdpLearnerEffect = { type: 'unlock-sdp-learner'; key: string };
type UnlockSdpPartyEffect = { type: 'unlock-sdp-party'; key: string };
type GainExpEffect = { type: 'gain-exp'; amount: number };
type GainGoldEffect = { type: 'gain-gold'; amount: number };
type GainApEffect = { type: 'gain-ap'; amount: number };
type GainSdpPointsEffect = { type: 'gain-sdp-points'; amount: number };
type GainItemEffect = { type: 'gain-item'; itemId: number; count: number };
type GainWeaponEffect = { type: 'gain-weapon'; weaponId: number; count: number };
type GainArmorEffect = { type: 'gain-armor'; armorId: number; count: number };
type LearnSkillEffect = { type: 'learn-skill'; skillId: number };
type CustomEffect = { type: 'custom'; raw: string };

type SdpRewardEffect =
  | UnlockSdpLearnerEffect
  | UnlockSdpPartyEffect
  | GainExpEffect
  | GainGoldEffect
  | GainApEffect
  | GainSdpPointsEffect
  | GainItemEffect
  | GainWeaponEffect
  | GainArmorEffect
  | LearnSkillEffect
  | CustomEffect;

type SdpEffectType = SdpRewardEffect['type'];

const SDP_EFFECT_TYPE_LABELS: Record<SdpEffectType, string> = {
  'unlock-sdp-learner': 'Unlock SDP (learner)',
  'unlock-sdp-party':   'Unlock SDP (party)',
  'gain-exp':           'Earn EXP',
  'gain-gold':          'Collect Gold',
  'gain-ap':            'Bestow AP',
  'gain-sdp-points':    'Acquire SDP Points',
  'gain-item':          'Gain Item',
  'gain-weapon':        'Gain Weapon',
  'gain-armor':         'Gain Armor',
  'learn-skill':        'Teach Skill (learner)',
  'custom':             'Custom (Raw JS)',
};

const RE_UNLOCK_SDP_LEARNER = /^a\.unlockSdpByKey\((['"]?)([^'")\s]*)\1\)$/;
const RE_UNLOCK_SDP_PARTY   = /^\$gameParty\.unlockSdpByKey\((['"]?)([^'")\s]*)\1\)$/;
const RE_LEARN_SKILL        = /^a\.learnSkill\((\d+)\)$/;
const RE_GAIN_EXP            = /^z\.gainExp\((\d+)\)$/;
const RE_GAIN_GOLD           = /^\$gameParty\.gainGold\((\d+)\)$/;
const RE_GAIN_AP             = /^ApManager\.gainAp\(a,\s*(\d+),\s*['"]on-sdp-rankup['"]\)$/;
const RE_GAIN_SDP_POINTS     = /^a\.modSdpPoints\((\d+)\)$/;
const RE_GAIN_ITEM           = /^\$gameParty\.gainItem\(\$dataItems\[(\d+)\],\s*(\d+)\)$/;
const RE_GAIN_WEAPON         = /^\$gameParty\.gainItem\(\$dataWeapons\[(\d+)\],\s*(\d+)\)$/;
const RE_GAIN_ARMOR          = /^\$gameParty\.gainItem\(\$dataArmors\[(\d+)\],\s*(\d+)\)$/;

function parseRewardEffect(raw: string): SdpRewardEffect
{
  const s = raw.trim().replace(/;$/, '');
  let m: RegExpMatchArray | null;

  m = s.match(RE_UNLOCK_SDP_LEARNER);
  if (m) return { type: 'unlock-sdp-learner', key: m[2] };

  m = s.match(RE_UNLOCK_SDP_PARTY);
  if (m) return { type: 'unlock-sdp-party', key: m[2] };

  m = s.match(RE_GAIN_EXP);
  if (m) return { type: 'gain-exp', amount: parseInt(m[1], 10) };

  m = s.match(RE_GAIN_GOLD);
  if (m) return { type: 'gain-gold', amount: parseInt(m[1], 10) };

  m = s.match(RE_GAIN_AP);
  if (m) return { type: 'gain-ap', amount: parseInt(m[1], 10) };

  m = s.match(RE_GAIN_SDP_POINTS);
  if (m) return { type: 'gain-sdp-points', amount: parseInt(m[1], 10) };

  m = s.match(RE_GAIN_ITEM);
  if (m) return { type: 'gain-item', itemId: parseInt(m[1], 10), count: parseInt(m[2], 10) };

  m = s.match(RE_GAIN_WEAPON);
  if (m) return { type: 'gain-weapon', weaponId: parseInt(m[1], 10), count: parseInt(m[2], 10) };

  m = s.match(RE_GAIN_ARMOR);
  if (m) return { type: 'gain-armor', armorId: parseInt(m[1], 10), count: parseInt(m[2], 10) };

  m = s.match(RE_LEARN_SKILL);
  if (m) return { type: 'learn-skill', skillId: parseInt(m[1], 10) };

  return { type: 'custom', raw };
}

function generateRewardEffect(effect: SdpRewardEffect): string
{
  switch (effect.type)
  {
    case 'unlock-sdp-learner': return `a.unlockSdpByKey('${effect.key}');`;
    case 'unlock-sdp-party':   return `$gameParty.unlockSdpByKey('${effect.key}');`;
    case 'gain-exp':           return `z.gainExp(${effect.amount});`;
    case 'gain-gold':          return `$gameParty.gainGold(${effect.amount});`;
    case 'gain-ap':            return `ApManager.gainAp(a, ${effect.amount}, 'on-sdp-rankup');`;
    case 'gain-sdp-points':    return `a.modSdpPoints(${effect.amount});`;
    case 'gain-item':          return `$gameParty.gainItem($dataItems[${effect.itemId}], ${effect.count});`;
    case 'gain-weapon':        return `$gameParty.gainItem($dataWeapons[${effect.weaponId}], ${effect.count});`;
    case 'gain-armor':         return `$gameParty.gainItem($dataArmors[${effect.armorId}], ${effect.count});`;
    case 'learn-skill':        return `a.learnSkill(${effect.skillId});`;
    case 'custom':             return effect.raw;
  }
}

function rewardEffectSummary(effect: SdpRewardEffect): string
{
  switch (effect.type)
  {
    case 'unlock-sdp-learner': return `Unlock SDP "${effect.key}" for learner`;
    case 'unlock-sdp-party':   return `Unlock SDP "${effect.key}" for party`;
    case 'gain-exp':           return `+${effect.amount} EXP`;
    case 'gain-gold':          return `+${effect.amount} gold`;
    case 'gain-ap':            return `+${effect.amount} AP`;
    case 'gain-sdp-points':    return `+${effect.amount} SDP points`;
    case 'gain-item':          return `Item #${effect.itemId} ×${effect.count}`;
    case 'gain-weapon':        return `Weapon #${effect.weaponId} ×${effect.count}`;
    case 'gain-armor':         return `Armor #${effect.armorId} ×${effect.count}`;
    case 'learn-skill':        return `Learn skill #${effect.skillId}`;
    case 'custom':
    {
      const trimmed = effect.raw.trim();
      return trimmed.length === 0
        ? '(no effect)'
        : trimmed.slice(0, 60) + (trimmed.length > 60 ? '…' : '');
    }
  }
}

function rawEffectSummary(raw: string): string
{
  return rewardEffectSummary(parseRewardEffect(raw));
}

function defaultEffect(type: SdpEffectType): SdpRewardEffect
{
  switch (type)
  {
    case 'unlock-sdp-learner': return { type, key: '' };
    case 'unlock-sdp-party':   return { type, key: '' };
    case 'gain-exp':           return { type, amount: 100 };
    case 'gain-gold':          return { type, amount: 100 };
    case 'gain-ap':            return { type, amount: 100 };
    case 'gain-sdp-points':    return { type, amount: 100 };
    case 'gain-item':          return { type, itemId: 1, count: 1 };
    case 'gain-weapon':        return { type, weaponId: 1, count: 1 };
    case 'gain-armor':         return { type, armorId: 1, count: 1 };
    case 'learn-skill':        return { type, skillId: 1 };
    case 'custom':             return { type, raw: '' };
  }
}

export type {
  SdpRewardEffect,
  SdpEffectType,
  UnlockSdpLearnerEffect,
  UnlockSdpPartyEffect,
  GainExpEffect,
  GainGoldEffect,
  GainApEffect,
  GainSdpPointsEffect,
  GainItemEffect,
  GainWeaponEffect,
  GainArmorEffect,
  LearnSkillEffect,
  CustomEffect,
};

export {
  SDP_EFFECT_TYPE_LABELS,
  parseRewardEffect,
  generateRewardEffect,
  rewardEffectSummary,
  rawEffectSummary,
  defaultEffect,
};

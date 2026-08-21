import React from 'react';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { SystemService } from '@services/SystemService.ts';
import { fromBParamIdToName, fromSParamIdToName, fromXParamIdToName } from '../../mappers/ParameterIdMapper.ts';
import { CollapseEffect, PartyAbility, SpecialFlag } from '@core/enums/TraitValues.ts';
import { Game_Trait } from '../components/traits/Traits';
import {
  Accessibility,
  BookmarkAdd,
  CandlestickChart,
  Diversity2,
  QuestionMark,
  SportsMma,
  StackedBarChart
} from '@mui/icons-material';
import RPG_Trait = Rmmz.Data.RPG_Trait;

/**
 * The lookups a trait's dataId may need resolved against loaded project data.
 * Skills and states are context-backed, so they arrive from the hook rather than a module import.
 */
type TraitNameLookups = {
  skillToName: (id: number) => string;
  stateToName: (id: number) => string;
};

/**
 * The icon standing in for each trait code. Codes sharing a tens digit are one family of trait and
 * deliberately share an icon, so a list of traits reads as groups at a glance.
 */
const TRAIT_CODE_ICONS: Record<number, React.ComponentType> = {
  11: CandlestickChart,
  12: CandlestickChart,
  13: CandlestickChart,
  14: CandlestickChart,
  21: StackedBarChart,
  22: StackedBarChart,
  23: StackedBarChart,
  31: SportsMma,
  32: SportsMma,
  33: SportsMma,
  34: SportsMma,
  35: SportsMma,
  41: BookmarkAdd,
  42: BookmarkAdd,
  43: BookmarkAdd,
  44: BookmarkAdd,
  51: Accessibility,
  52: Accessibility,
  53: Accessibility,
  54: Accessibility,
  55: Accessibility,
  61: Diversity2,
  62: Diversity2,
  63: Diversity2,
  64: Diversity2,
};

/**
 * The short label naming each trait code, as the trait editor presents it.
 */
const TRAIT_CODE_NAMES: Record<number, string> = {
  11: 'Elemental Resistance',
  12: 'Debuff Rate',
  13: 'State Rate',
  14: 'State Immunity',
  21: 'Base Parameter',
  22: 'EX Parameter',
  23: 'SP Parameter',
  31: 'On-Hit Element',
  32: 'On-Hit State',
  33: 'Attack Speed',
  34: 'Attack Count',
  35: 'Attack Skill',
  41: 'Add Skill Category',
  42: 'Seal Skill Category',
  43: 'Add Skill',
  44: 'Seal Skill',
  51: 'Add Weapon Type',
  52: 'Add Armor Type',
  53: 'Lock Slot',
  54: 'Seal Slot',
  55: 'Enable Dual-Wield',
  61: 'Additional Turn Chance',
  62: 'Special Flags',
  63: 'Collapse Effect',
  64: 'Party Ability',
};

/**
 * How each trait code turns its dataId into something readable. A trait's dataId means nothing on its
 * own -- the same number is an element on one code, a skill on another -- so the code picks the reader.
 */
const TRAIT_DATA_NAME_RESOLVERS: Record<number, (dataId: number, lookups: TraitNameLookups) => string> = {
  11: (dataId) => SystemService.elements[ dataId ] ?? 'None',
  12: (dataId) => fromBParamIdToName(dataId),
  13: (dataId, lookups) => lookups.stateToName(dataId),
  14: (dataId, lookups) => lookups.stateToName(dataId),
  21: (dataId) => fromBParamIdToName(dataId),
  22: (dataId) => fromXParamIdToName(dataId),
  23: (dataId) => fromSParamIdToName(dataId),
  31: (dataId) => `"${SystemService.elements[ dataId ] ?? 'None'}" (id:${dataId})`,
  32: (dataId, lookups) => lookups.stateToName(dataId),
  33: () => 'Speed',
  34: () => 'Count',
  35: (dataId, lookups) => `${lookups.skillToName(dataId)} (id:${dataId})`,
  41: (dataId) => SystemService.skillTypes[ dataId ] ?? 'None',
  42: (dataId) => SystemService.skillTypes[ dataId ] ?? 'None',
  43: (dataId, lookups) => `${lookups.skillToName(dataId)} (id:${dataId})`,
  44: (dataId, lookups) => `${lookups.skillToName(dataId)} (id:${dataId})`,
  51: (dataId) => SystemService.weaponTypes[ dataId ] ?? 'None',
  52: (dataId) => SystemService.armorTypes[ dataId ] ?? 'None',
  53: (dataId) => SystemService.equipTypes[ dataId ] ?? 'None',
  54: (dataId) => SystemService.equipTypes[ dataId ] ?? 'None',
  55: () => 'Enable Dual-Wield',
  61: () => 'Chance',
  62: (dataId) => SpecialFlag[ dataId ],
  63: (dataId) => CollapseEffect[ dataId ],
  64: (dataId) => PartyAbility[ dataId ],
};

/**
 * A custom hook providing context-aware trait mapping logic.
 * Replaces the legacy static TraitMapper class.
 */
export function useTraitMapping()
{
  const { toName: skillToName } = useSkills();
  const { toName: stateToName } = useStates();

  const codes = [
    11, 12, 13, 14,
    21, 22, 23,
    31, 32, 33, 34, 35,
    41, 42, 43, 44,
    51, 52, 53, 54, 55,
    61, 62, 63, 64,
  ];

  const codeDescriptions: Record<number, string> = {
    11: 'Modifies elemental damage resistance percentages for specific elements.',
    12: 'Adjusts vulnerability to parameter debuffs by percentage.',
    13: 'Changes probability of being afflicted by specific states/status effects.',
    14: 'Provides complete immunity to specific states/status effects.',
    21: 'Modifies base parameters (HP, MP, ATK, DEF, etc.) by percentage.',
    22: 'Affects extended parameters (HIT, EVA, CRI, etc.) by percentage.',
    23: 'Influences special parameters (TGR, GRD, REC, etc.) by percentage.',
    31: 'Adds elemental properties to normal attacks.',
    32: 'Gives attacks a chance to inflict states/status effects on targets.',
    33: 'Modifies attack speed value for combat.',
    34: 'Increases the number of hits performed in a single attack.',
    35: 'Replaces normal attack with a specific skill.',
    41: 'Grants access to all skills within a specific skill category.',
    42: 'Prevents use of all skills within a specific skill category.',
    43: 'Adds a specific skill to the usable skill list.',
    44: 'Prevents the use of a specific skill.',
    51: 'Enables equipping weapons of a specific type.',
    52: 'Enables equipping armor of a specific type.',
    53: 'Prevents any equipment from being placed in a specific slot.',
    54: 'Disables a specific equipment slot.',
    55: 'Enables wielding two weapons simultaneously.',
    61: 'Provides a percentage chance to gain an extra turn in battle.',
    62: 'Grants special battle or field capabilities.',
    63: 'Changes the visual effect when defeated in battle.',
    64: 'Provides special abilities that affect the entire party.'
  };

  /**
   * Maps a trait's code to an appropriate MUI icon.
   * @param {number} code The trait code.
   * @returns {React.JSX.Element} The icon component.
   */
  const toCodeIcon = (code: number): React.JSX.Element =>
  {
    // an unrecognized code still gets a chip, so it draws a question mark rather than nothing.
    const icon = TRAIT_CODE_ICONS[ code ] ?? QuestionMark;
    return React.createElement(icon);
  };

  /**
   * Maps a trait code to its CSS color/gradient properties.
   * @param {number} code The trait code.
   */
  const toCodeColor = (code: number) =>
  {
    switch (code)
    {
      case 11:
        return { background: 'linear-gradient(to right bottom, #ff0000, #0066ff)' };
      case 21:
        return { bgcolor: '#ff6600' };
      case 22:
        return { bgcolor: '#009933' };
      case 23:
        return { bgcolor: '#3366ff' };
      case 31:
        return {
          background: 'linear-gradient(45deg, white, red, yellow, green, blue, violet, black)'
        };
      case 35:
        return { bgcolor: '#6600cc' };
      default:
        return { bgcolor: '#000000' };
    }
  };

  /**
   * Maps a trait's dataId to a human-readable name based on its code.
   */
  const toDataName = (
    code: number,
    dataId: number
  ): string =>
  {
    const resolve = TRAIT_DATA_NAME_RESOLVERS[ code ];

    // an unrecognized code has no dataId meaning to report, so it names nothing.
    if (resolve === undefined)
    {
      return '';
    }

    return resolve(dataId, {
      skillToName,
      stateToName,
    });
  };

  /**
   * Converts a raw RPG_Trait into a decorated Game_Trait.
   */
  const toGameTrait = (trait: RPG_Trait): Game_Trait =>
  {
    return {
      ...trait,
      codeName: getTraitCodeName(trait.code),
      dataName: toDataName(trait.code, trait.dataId),
      valueString: getTraitValueString(trait.code, trait.value),
    };
  };

  return {
    codes,
    codeDescriptions,
    toCodeIcon,
    toCodeColor,
    toDataName,
    toGameTrait,
    getTraitCodeName,
  };
}

function getTraitCodeName(code: number): string
{
  // an unrecognized code has no name to give, which the trait editor renders as a blank label.
  return TRAIT_CODE_NAMES[ code ] ?? '';
}

function getTraitValueString(
  code: number,
  value: number
): string
{
  switch (code)
  {
    case 11:
    case 12:
    case 13:
      return `${value * 100} %`;
    case 21:
    case 22:
    case 23:
      return `${(value * 100).toFixed(0)} %`;
    case 32:
    case 61:
      return `${(value * 100).toFixed(0)}%`;
    case 33:
      return `${value}`;
    case 34:
      return `+${value}`;
    default:
      return '';
  }
}

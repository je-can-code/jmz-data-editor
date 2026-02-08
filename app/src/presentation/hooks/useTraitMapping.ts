import React from 'react';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { SystemService } from '@services/SystemService.ts';
import {
  fromBParamIdToName,
  fromSParamIdToName,
  fromXParamIdToName
} from '../../mappers/ParameterIdMapper.ts';
import { SpecialFlag, CollapseEffect, PartyAbility } from '@core/enums/TraitValues.ts';
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
    switch (code)
    {
      case 11:
      case 12:
      case 13:
      case 14:
        return React.createElement(CandlestickChart);
      case 21:
      case 22:
      case 23:
        return React.createElement(StackedBarChart);
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
        return React.createElement(SportsMma);
      case 41:
      case 42:
      case 43:
      case 44:
        return React.createElement(BookmarkAdd);
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
        return React.createElement(Accessibility);
      case 61:
      case 62:
      case 63:
      case 64:
        return React.createElement(Diversity2);
      default:
        return React.createElement(QuestionMark);
    }
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
    switch (code)
    {
      case 11:
        return SystemService.elements[ dataId ] ?? 'None';
      case 12:
        return fromBParamIdToName(dataId);
      case 13:
      case 14:
      case 32:
        return stateToName(dataId);
      case 21:
        return fromBParamIdToName(dataId);
      case 22:
        return fromXParamIdToName(dataId);
      case 23:
        return fromSParamIdToName(dataId);
      case 31:
        return `"${SystemService.elements[ dataId ] ?? 'None'}" (id:${dataId})`;
      case 33:
        return 'Speed';
      case 34:
        return 'Count';
      case 35:
      case 43:
      case 44:
        return skillToName(dataId);
      case 41:
      case 42:
        return SystemService.skillTypes[ dataId ] ?? 'None';
      case 51:
        return SystemService.weaponTypes[ dataId ] ?? 'None';
      case 52:
        return SystemService.armorTypes[ dataId ] ?? 'None';
      case 53:
      case 54:
        return SystemService.equipTypes[ dataId ] ?? 'None';
      case 55:
        return 'Enable Dual-Wield';
      case 61:
        return 'Chance';
      case 62:
        return SpecialFlag[ dataId ];
      case 63:
        return CollapseEffect[ dataId ];
      case 64:
        return PartyAbility[ dataId ];
      default:
        return '';
    }
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
  switch (code)
  {
    case 11:
      return 'Elemental Resistance';
    case 12:
      return 'Debuff Rate';
    case 13:
      return 'State Rate';
    case 14:
      return 'State Immunity';
    case 21:
      return 'Base Parameter';
    case 22:
      return 'EX Parameter';
    case 23:
      return 'SP Parameter';
    case 31:
      return 'On-Hit Element';
    case 32:
      return 'On-Hit State';
    case 33:
      return 'Attack Speed';
    case 34:
      return 'Attack Count';
    case 35:
      return 'Attack Skill';
    case 41:
      return 'Add Skill Category';
    case 42:
      return 'Seal Skill Category';
    case 43:
      return 'Add Skill';
    case 44:
      return 'Seal Skill';
    case 51:
      return 'Add Weapon Type';
    case 52:
      return 'Add Armor Type';
    case 53:
      return 'Lock Slot';
    case 54:
      return 'Seal Slot';
    case 55:
      return 'Enable Dual-Wield';
    case 61:
      return 'Additional Turn Chance';
    case 62:
      return 'Special Flags';
    case 63:
      return 'Collapse Effect';
    case 64:
      return 'Party Ability';
    default:
      return '';
  }
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

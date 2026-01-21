import { Game_Trait } from "./Traits";
import { SystemService } from "../../../../services/SystemService.ts";
import {
  fromBParamIdToName,
  fromSParamIdToName,
  fromXParamIdToName
} from "../../../../mappers/ParameterIdMapper.ts";
import {
  CollapseEffect,
  PartyAbility,
  SpecialFlag
} from "../../../../core/enums/TraitValues.ts";
import {
  Accessibility,
  BookmarkAdd,
  CandlestickChart,
  Diversity2,
  QuestionMark,
  SportsMma,
  StackedBarChart
} from "@mui/icons-material";
import RPG_Trait = Rmmz.Data.RPG_Trait;

class TraitMapper
{
  static codes = [
    11, 12, 13, 14,
    21, 22, 23,
    31, 32, 33, 34, 35,
    41, 42, 43, 44,
    51, 52, 53, 54, 55,
    61, 62, 63, 64,
  ];

  static codeDescriptions: Record<number, string> = {
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

  static toCodeIcon(code: number)
  {
    switch (code)
    {
      case 11:
      case 12:
      case 13:
      case 14:
        return <CandlestickChart/>;
      case 21:
      case 22:
      case 23:
        return <StackedBarChart/>;
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
        return <SportsMma/>;
      case 41:
      case 42:
      case 43:
      case 44:
        return <BookmarkAdd/>;
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
        return <Accessibility/>;
      case 61:
      case 62:
      case 63:
      case 64:
        return <Diversity2/>;
      default:
        return <QuestionMark/>;
    }
  };

  static toGameTrait(trait: RPG_Trait): Game_Trait
  {
    const codeName = TraitMapper.toCodeName(trait.code);
    const dataName = TraitMapper.toDataName(trait.code, trait.dataId);
    const valueString = TraitMapper.toValueString(trait.code, trait.value);

    return {
      ...trait,
      codeName,
      dataName,
      valueString,
    } as Game_Trait;
  }

  static toTrait(gameTrait: Game_Trait): RPG_Trait
  {
    return {
      code: gameTrait.code,
      dataId: gameTrait.dataId,
      value: gameTrait.value
    } as RPG_Trait;
  }

  static toCodeName(code: number): string
  {
    switch (code)
    {
      // first tab - rates
      case 11:
        return 'Elemental Resistance';
      case 12:
        return 'Debuff Rate';
      case 13:
        return 'State Rate';
      case 14:
        return 'State Immunity';

      // second tab - parameters
      case 21:
        return 'Base Parameter';
      case 22:
        return 'EX Parameter';
      case 23:
        return 'SP Parameter';

      // third tab
      case 31:
        return 'On-Hit Element';
      case 32:
        return 'On-Hit State';
      case 33:
        return 'Attack';
      case 34:
        return 'Attack';
      case 35:
        return 'Attack Skill';

      // fourth tab - skills
      case 41:
        return 'Add Skill Category';
      case 42:
        return 'Seal Skill Category';
      case 43:
        return 'Add Skill';
      case 44:
        return 'Seal Skill';

      // fifth tab - equipment
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

      // sixth tab - other
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

  static toCodeColor(code: number): {
    background: string
  } | {
    bgcolor: string
  }
  {
    switch (code)
    {
      // first tab - rates
      case 11:
        return { background: 'linear-gradient(to right bottom, #ff0000, #0066ff)' }
      case 12:
        return { bgcolor: '#000000' }
      case 13:
        return { bgcolor: '#000000' }
      case 14:
        return { bgcolor: '#000000' }

      // second tab - parameters
      case 21:
        return { bgcolor: '#ff6600' }
      case 22:
        return { bgcolor: '#009933' }
      case 23:
        return { bgcolor: '#3366ff' }

      // third tab
      case 31:
        return {
          background: 'linear-gradient(45deg, white, red, yellow, green, blue, violet, black)'
          //background: 'linear-gradient(90deg, rgba(255,0,0,1) 0%, rgba(255,154,0,1) 10%, rgba(208,222,33,1) 20%, rgba(79,220,74,1) 30%, rgba(63,218,216,1) 40%, rgba(47,201,226,1) 50%, rgba(28,127,238,1) 60%, rgba(95,21,242,1) 70%, rgba(186,12,248,1) 80%, rgba(251,7,217,1) 90%, rgba(255,0,0,1) 100%)'
        }
      case 32:
        return { bgcolor: '#000000' }
      case 33:
        return { bgcolor: '#000000' }
      case 34:
        return { bgcolor: '#000000' }
      case 35:
        return { bgcolor: '#6600cc' }

      // fourth tab - skills
      case 41:
        return { bgcolor: '#000000' }
      case 42:
        return { bgcolor: '#000000' }
      case 43:
        return { bgcolor: '#000000' }
      case 44:
        return { bgcolor: '#000000' }

      // fifth tab - equipment
      case 51:
        return { bgcolor: '#000000' }
      case 52:
        return { bgcolor: '#000000' }
      case 53:
        return { bgcolor: '#000000' }
      case 54:
        return { bgcolor: '#000000' }
      case 55:
        return { bgcolor: '#000000' }

      // sixth tab - other
      case 61:
        return { bgcolor: '#000000' }
      case 62:
        return { bgcolor: '#000000' }
      case 63:
        return { bgcolor: '#000000' }
      case 64:
        return { bgcolor: '#000000' }

      default:
        return { bgcolor: '#000000' }
    }
  }

  static toDataName(code: number, dataId: number): string
  {
    switch (code)
    {
      // first tab - rates
      case 11:
        return SystemService.elements[dataId];
      case 12:
        return fromBParamIdToName(dataId);
      case 13:
        return SystemService.stateData[dataId].name;
      case 14:
        return SystemService.stateData[dataId].name;

      // second tab - parameters
      case 21:
        return fromBParamIdToName(dataId);
      case 22:
        return fromXParamIdToName(dataId);
      case 23:
        return fromSParamIdToName(dataId);

      // third tab
      case 31:
        return `"${SystemService.elements[dataId]}" (id:${dataId})`;
      case 32:
        return SystemService.stateData[dataId].name;
      case 33:
        return `Speed`;
      case 34:
        return 'Count'; // TODO: implement
      case 35:
        return `"${SystemService.skillData[dataId].name}" (id:${dataId})`;

      // fourth tab - skills
      case 41:
        return SystemService.systemData.skillTypes[dataId];
      case 42:
        return SystemService.systemData.skillTypes[dataId];
      case 43:
        return SystemService.skillData[dataId].name;
      case 44:
        return SystemService.skillData[dataId].name;

      // fifth tab - equipment
      case 51:
        return SystemService.weaponTypes[dataId];
      case 52:
        return SystemService.armorTypes[dataId];
      case 53:
        return SystemService.equipTypes[dataId];
      case 54:
        return SystemService.equipTypes[dataId];
      case 55:
        return 'Enable Dual-Wield'; // TODO: implement

      // sixth tab - other
      case 61:
        return 'Chance';
      case 62:
        return SpecialFlag[dataId];
      case 63:
        return CollapseEffect[dataId];
      case 64:
        return PartyAbility[dataId];

      default:
        return '';
    }
  }

  static toValueString(code: number, value: number): string
  {
    switch (code)
    {
      // first tab - rates
      case 11:
        return `${value * 100} %`;
      case 12:
        return `${value * 100} %`;
      case 13:
        return `${value * 100} %`;
      case 14:
        return ``; // there isn't a value parameter.

      // second tab - parameters
      case 21:
        return `${(value * 100).toFixed(0)} %`;
      case 22:
        return `${(value * 100).toFixed(0)} %`;
      case 23:
        return `${(value * 100).toFixed(0)} %`;

      // third tab
      case 31:
        return ``; // there isn't a value parameter.
      case 32:
        return `${(value * 100).toFixed(0)}%`;
      case 33:
        return `${value}`;
      case 34:
        return `+${value}`;
      case 35:
        return ``; // there isn't a value parameter.

      // fourth tab - skills
      case 41:
        return ``; // there isn't a value parameter.
      case 42:
        return ``; // there isn't a value parameter.
      case 43:
        return ``; // there isn't a value parameter.
      case 44:
        return ``; // there isn't a value parameter.

      // fifth tab - equipment
      case 51:
        return ``; // there isn't a value parameter.
      case 52:
        return ``; // there isn't a value parameter.
      case 53:
        return ``; // there isn't a value parameter.
      case 54:
        return ``; // there isn't a value parameter.
      case 55:
        return ``; // there isn't a value parameter.

      // sixth tab - other
      case 61:
        return `${(value * 100).toFixed(0)}%`;
      case 62:
        return ``; // there isn't a value parameter.
      case 63:
        return ``; // there isn't a value parameter.
      case 64:
        return ``; // there isn't a value parameter.

      default:
        return '';
    }
  }
}

export { TraitMapper }
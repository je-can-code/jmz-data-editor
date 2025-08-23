declare namespace Rmmz
{
  namespace Data
  {
    interface RPG_Trait
    {
      code: number;
      dataId: number;
      value: number;
    }

    interface RPG_SkillDamage
    {
      critical: boolean;
      elementId: number;
      formula: string;
      type: number;
      variance: number;
    }

    interface RPG_UsableEffect
    {
      code: number;
      dataId: number;
      value1: number;
      value2: number;
    }

    interface RPG_ClassLearning
    {
      level: number;
      skillId: number;
      note: string;
    }

    interface RPG_EnemyAction
    {
      conditionParam1: number;
      conditionParam2: number;
      conditionType: number;
      rating: number;
      skillId: number;
    }

    interface RPG_DropItem
    {
      dataId: number;
      denominator: number;
      kind: number;
    }
  }

  namespace Base
  {
    interface RPG_Base
    {
      id: number;
      meta: any;
      name: string;
      note: string;
    }

    interface RPG_BaseBattler
      extends RPG_Base
    {
      battlerName: string;
      traits: Data.RPG_Trait[];
    }

    interface RPG_BaseItem
      extends RPG_Base
    {
      description: string;
      iconIndex: number;
    }

    interface RPG_Traited
      extends RPG_BaseItem
    {
      traits: Data.RPG_Trait[];
    }
  }

  namespace Core
  {
    interface RPG_EquipItem
      extends Base.RPG_Traited
    {
      etypeId: number;
      params: number[];
      price: number;
    }

    interface RPG_UsableItem
      extends Base.RPG_BaseItem
    {
      animationId: number;
      damage: Data.RPG_SkillDamage;
      effects: Data.RPG_UsableEffect[];
      hitType: number;
      occasion: number;
      repeats: number;
      scope: number;
      speed: number;
      successRate: number;
      tpGain: number;
    }
  }

  namespace Implementations
  {
    interface RPG_Actor
      extends Base.RPG_BaseBattler
    {
      characterIndex: number;
      characterName: string;
      classId: number;
      equips: number[];
      faceIndex: number;
      faceName: string;
      initialLevel: number;
      maxLevel: number;
      nickName: string;
      profile: string;
    }

    interface RPG_Armor
      extends Core.RPG_EquipItem
    {
      atypeId: number;
      kind: 3;
    }

    interface RPG_Class
      extends Base.RPG_Base
    {
      expParams: [ number, number, number, number ];
      learnings: Data.RPG_ClassLearning[];
      params: number[];
      traits: Data.RPG_Trait[];
    }

    interface RPG_Enemy
      extends Base.RPG_BaseBattler
    {
      actions: Data.RPG_EnemyAction[];
      battlerHue: number;
      dropItems: Data.RPG_DropItem[];
      exp: number;
      gold: number;
      params: number[];
    }

    interface RPG_Item
      extends Core.RPG_UsableItem
    {
      consumable: boolean;
      itypeId: number;
      price: number;
      kind: 1;
    }

    interface RPG_Skill
      extends Core.RPG_UsableItem
    {
      message1: string;
      message2: string;
      messageType: number;
      mpCost: number;
      requiredWtypeId1: number;
      requiredWtypeId2: number;
      stypeId: number;
      tpCost: number;
    }

    interface RPG_State
      extends Base.RPG_Traited
    {
      autoRemovalTiming: number;
      chanceByDamage: number;
      description: string;
      maxTurns: number;
      message1: string;
      message2: string;
      message3: string;
      message4: string;
      messageType: number;
      minTurns: number;
      motion: number;
      overlay: number;
      priority: number;
      removeAtBattleEnd: boolean;
      removeByDamage: boolean;
      removeByRestriction: boolean;
      removeByWalking: boolean;
      restriction: number;
      stepsToRemove: number;
    }

    interface RPG_Weapon
      extends Core.RPG_EquipItem
    {
      animationId: number;
      wtypeId: number;
      kind: 2;
    }
  }

  namespace System
  {
    interface RPG_System
    {
      armorTypes: string[];
      elements: string[];
      equipTypes: string[];
      skillTypes: string[];
      weaponTypes: string[];

      terms: RPG_SystemTerms;

      switches: string[];
      variables: string[];
    }

    interface RPG_SystemTerms
    {
      basic: string[];
      commands: string[];
      params: string[];
      messages: Record<string, string>;
    }
  }
}
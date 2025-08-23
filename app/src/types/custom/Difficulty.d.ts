declare namespace Difficulty
{
  interface BattlerEffects
  {
    bparams: [ number, number, number, number, number, number, number, number ];
    xparams: [ number, number, number, number, number, number, number, number, number, number ];
    sparams: [ number, number, number, number, number, number, number, number, number, number ];
    cparams: number[];
  }

  interface BattlerRewards
  {
    exp: number;
    gold: number;
    drops: number;
    encounters: number;
    sdp: number;
  }

  interface Difficulty
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;
    cost: number;
    actorEffects: BattlerEffects;
    enemyEffects: BattlerEffects;
    rewards: BattlerRewards;
    enabled: boolean;
    unlocked: boolean;
    hidden: boolean;
  }
}
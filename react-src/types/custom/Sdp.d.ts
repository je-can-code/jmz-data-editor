// TODO: add models for the SDP system.
declare namespace Sdp
{
  interface PanelParameter
  {
    parameterId: number;
    perRank: number;
    isFlat: boolean;
    isCore: boolean;
  }

  interface PanelReward
  {
    rewardName: string;
    rankRequired: number;
    effect: string;
  }

  interface Panel
  {
    name: string;
    key: string;
    iconIndex: number;
    unlockedByDefault: boolean;
    description: string;
    topFlavorText: string;
    maxRank: number;
    baseCost: number;
    flatGrowthCost: number;
    multGrowthCost: number;
    panelParameters: PanelParameter[];
    panelRewards: PanelReward[];
    rarity: number;
  }
}
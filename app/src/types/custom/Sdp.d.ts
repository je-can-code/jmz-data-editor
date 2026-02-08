declare namespace Sdp
{
  interface Configuration
  {
    sdps: StatDistributionPanel[];
  }

  interface StatDistributionPanel
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
    panelParameters: SdpParameter[];
    panelRewards: SdpReward[];
    rarity: number;
  }

  interface SdpParameter
  {
    parameterId: number;
    perRank: number;
    isFlat: boolean;
    isCore: boolean;
  }

  interface SdpReward
  {
    rewardName: string;
    rankRequired: number;
    effect: string;
  }
}

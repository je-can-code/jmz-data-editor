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
    /** Additive offset on J-SDP v3 rarity default base SDP (usually **0**). */
    baseCost: number;
    /** Additive offset on rarity default flat coefficient (usually **0**). */
    flatGrowthCost: number;
    /** Multiplier on rarity default **mult** (usually **1** = defaults only). */
    multGrowthCost: number;
    panelParameters: SdpParameter[];
    panelRewards: SdpReward[];
    /** Panel rarity **0–5** (Common..Godlike). */
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

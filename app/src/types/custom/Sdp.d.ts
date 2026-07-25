declare namespace Sdp
{
  interface Configuration
  {
    sdps: StatDistributionPanel[];
    subgroups: PanelSubgroup[];
    families: PanelFamily[];
  }

  interface PanelIdentity
  {
    name: string;
    iconIndex: number;
    unlockedByDefault: boolean;
    description: string;
    topFlavorText: string;
  }

  interface PanelProgression
  {
    maxRank: number;
    /** Panel rarity **0–5** (Common..Godlike). */
    rarity: number;
    /** Additive offset on J-SDP v3 rarity default base SDP (usually **0**). */
    baseCost: number;
    /** Additive offset on rarity default flat coefficient (usually **0**). */
    flatGrowthCost: number;
    /** Multiplier on rarity default **mult** (usually **1** = defaults only). */
    multGrowthCost: number;
  }

  interface PanelMastery
  {
    subgroupKey: string;
    subgroupTier: number;
    masterySkillId: number;
  }

  interface StatDistributionPanel
  {
    key: string;
    identity: PanelIdentity;
    progression: PanelProgression;
    mastery: PanelMastery;
    panelParameters: SdpParameter[];
    panelRewards: SdpReward[];
  }

  interface PanelSubgroup
  {
    name: string;
    key: string;
    iconIndex: number;
    description: string;
  }

  interface PanelFamily
  {
    name: string;
    key: string;
    iconIndex: number;
    description: string;
    subgroupKeys: string[];
  }

  interface SdpParameter
  {
    parameterKey: string;
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

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

  interface MasteryProse
  {
    /** Template describing tiers 1-3, where the base effect is established. */
    beginning: string;
    /** Template describing tiers 4-9, where potency ramps and behavior layers appear. */
    middle: string;
    /** Template describing the tier 10 capstone. */
    end: string;
  }

  interface PanelSubgroup
  {
    name: string;
    key: string;
    iconIndex: number;
    description: string;
    /**
     * Player-facing mastery descriptions, one per act. Tokens such as `{p.def}` are resolved
     * against live data at draw time, so a rebalance never leaves the prose stale.
     */
    prose: MasteryProse;
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

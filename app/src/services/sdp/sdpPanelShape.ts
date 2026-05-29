import { normalizeSdpRarityFromDisk } from "@services/sdp/sdpPanelRarity.ts";
import { normalizeSdpParameter } from "@services/sdp/sdpParameterKeys.ts";

type Panel = Sdp.StatDistributionPanel;

type LegacyFlatPanel = Panel & {
  name?: string;
  iconIndex?: number;
  unlockedByDefault?: boolean;
  description?: string;
  topFlavorText?: string;
  maxRank?: number;
  rarity?: number;
  baseCost?: number;
  flatGrowthCost?: number;
  multGrowthCost?: number;
  subgroupKey?: string;
  subgroupTier?: number;
  masterySkillId?: number;
};

/**
 * Blank mastery row — panel is outside the subgroup hierarchy.
 */
export function emptyPanelMastery(): Sdp.PanelMastery
{
  return {
    subgroupKey: "",
    subgroupTier: 0,
    masterySkillId: 0,
  };
}

/**
 * Default identity row for new panels.
 */
export function defaultPanelIdentity(name = ""): Sdp.PanelIdentity
{
  return {
    name,
    iconIndex: -1,
    unlockedByDefault: false,
    description: "",
    topFlavorText: "",
  };
}

/**
 * Default progression row for new panels.
 */
export function defaultPanelProgression(): Sdp.PanelProgression
{
  return {
    maxRank: 10,
    rarity: 0,
    baseCost: 0,
    flatGrowthCost: 0,
    multGrowthCost: 1,
  };
}

/**
 * Normalizes one panel row from disk into nested identity / progression / mastery.
 *
 * @param raw Parsed JSON panel row (nested or legacy flat).
 * @returns Canonical nested panel for the editor.
 */
export function normalizeSdpPanelFromDisk(raw: LegacyFlatPanel): Panel
{
  const identitySource = raw.identity ?? {
    name: raw.name ?? "",
    iconIndex: raw.iconIndex ?? 0,
    unlockedByDefault: raw.unlockedByDefault === true,
    description: raw.description ?? "",
    topFlavorText: raw.topFlavorText ?? "",
  };

  const progressionSource = raw.progression ?? {
    maxRank: raw.maxRank ?? 1,
    rarity: raw.rarity ?? 0,
    baseCost: raw.baseCost ?? 0,
    flatGrowthCost: raw.flatGrowthCost ?? 0,
    multGrowthCost: raw.multGrowthCost ?? 1,
  };

  const masterySource = raw.mastery ?? {
    subgroupKey: raw.subgroupKey ?? "",
    subgroupTier: raw.subgroupTier ?? 0,
    masterySkillId: raw.masterySkillId ?? 0,
  };

  return {
    key: raw.key ?? "",
    identity: {
      name: identitySource.name ?? "",
      iconIndex: Number(identitySource.iconIndex) || 0,
      unlockedByDefault: identitySource.unlockedByDefault === true,
      description: identitySource.description ?? "",
      topFlavorText: identitySource.topFlavorText ?? "",
    },
    progression: {
      maxRank: Number(progressionSource.maxRank) || 1,
      rarity: normalizeSdpRarityFromDisk(Number(progressionSource.rarity) || 0),
      baseCost: Number(progressionSource.baseCost) || 0,
      flatGrowthCost: Number(progressionSource.flatGrowthCost) || 0,
      multGrowthCost: Number(progressionSource.multGrowthCost) || 1,
    },
    mastery: {
      subgroupKey: masterySource.subgroupKey ?? "",
      subgroupTier: Number(masterySource.subgroupTier) || 0,
      masterySkillId: Number(masterySource.masterySkillId) || 0,
    },
    panelParameters: (raw.panelParameters ?? []).map(normalizeSdpParameter),
    panelRewards: raw.panelRewards ?? [],
  };
}

/**
 * Applies {@link normalizeSdpPanelFromDisk} to every panel.
 *
 * @param panels Loaded `sdps` array.
 * @returns Updated panel list.
 */
export function normalizeSdpPanelList(panels: LegacyFlatPanel[]): Panel[]
{
  return panels.map(normalizeSdpPanelFromDisk);
}

/**
 * Normalizes the full SDP configuration blob from disk.
 *
 * @param config Parsed config.sdp.json.
 * @returns Canonical nested configuration for the editor.
 */
export function normalizeSdpConfigurationFromDisk(
  config: Partial<Sdp.Configuration> | LegacyFlatPanel[] | null | undefined
): Sdp.Configuration
{
  if (Array.isArray(config))
  {
    return {
      sdps: normalizeSdpPanelList(config),
      subgroups: [],
      families: [],
    };
  }

  return {
    sdps: normalizeSdpPanelList(config?.sdps ?? []),
    subgroups: config?.subgroups ?? [],
    families: (config?.families ?? []).map(normalizeSdpFamilyFromDisk),
  };
}

/**
 * Normalizes one family row from disk.
 *
 * @param raw Parsed family row.
 * @returns Canonical family row for the editor.
 */
export function normalizeSdpFamilyFromDisk(raw: Partial<Sdp.PanelFamily>): Sdp.PanelFamily
{
  const subgroupKeys = Array.isArray(raw.subgroupKeys)
    ? raw.subgroupKeys.filter(key => typeof key === "string" && key.trim() !== "")
    : [];

  return {
    key: raw.key ?? "",
    name: raw.name ?? "",
    iconIndex: Number(raw.iconIndex) || -1,
    description: raw.description ?? "",
    subgroupKeys,
  };
}

/**
 * Serializes one panel row for config.sdp.json (canonical nested shape).
 *
 * @param panel Editor panel state.
 * @returns Disk row.
 */
export function serializeSdpPanelForDisk(panel: Panel): Sdp.StatDistributionPanel
{
  return {
    key: panel.key,
    identity: { ...panel.identity },
    progression: { ...panel.progression },
    mastery: { ...panel.mastery },
    panelParameters: panel.panelParameters.map(parameter => ({ ...parameter })),
    panelRewards: panel.panelRewards.map(reward => ({ ...reward })),
  };
}

/**
 * Serializes the full SDP configuration for save.
 *
 * @param config Editor configuration state.
 * @returns Disk payload.
 */
export function serializeSdpConfigurationForDisk(config: Sdp.Configuration): Sdp.Configuration
{
  return {
    sdps: config.sdps.map(serializeSdpPanelForDisk),
    subgroups: config.subgroups.map(subgroup => ({ ...subgroup })),
    families: config.families.map(family => ({
      ...family,
      subgroupKeys: [ ...family.subgroupKeys ],
    })),
  };
}

/**
 * Patches identity fields on one panel row.
 *
 * @param panel Editor panel state.
 * @param patch Partial identity update.
 * @returns Updated panel.
 */
export function patchPanelIdentity(panel: Panel, patch: Partial<Sdp.PanelIdentity>): Panel
{
  return {
    ...panel,
    identity: {
      ...panel.identity,
      ...patch,
    },
  };
}

/**
 * Patches progression fields on one panel row.
 *
 * @param panel Editor panel state.
 * @param patch Partial progression update.
 * @returns Updated panel.
 */
export function patchPanelProgression(panel: Panel, patch: Partial<Sdp.PanelProgression>): Panel
{
  return {
    ...panel,
    progression: {
      ...panel.progression,
      ...patch,
    },
  };
}

/**
 * Patches mastery fields on one panel row.
 *
 * @param panel Editor panel state.
 * @param patch Partial mastery update.
 * @returns Updated panel.
 */
export function patchPanelMastery(panel: Panel, patch: Partial<Sdp.PanelMastery>): Panel
{
  return {
    ...panel,
    mastery: {
      ...panel.mastery,
      ...patch,
    },
  };
}

/**
 * Blank panel template for insert/clone flows.
 *
 * @param key Unique panel key.
 * @param name Friendly panel name.
 * @returns New panel row.
 */
export function createBlankSdpPanel(key: string, name: string): Panel
{
  return {
    key,
    identity: {
      ...defaultPanelIdentity(name),
      description: "The best panel ever, hands down. You only need to acquire it somehow!",
      topFlavorText: "Get this panel, you will not regret it.",
    },
    progression: defaultPanelProgression(),
    mastery: emptyPanelMastery(),
    panelParameters: [],
    panelRewards: [],
  };
}

/**
 * Legacy SDP panel long-param id → registry key.
 * Keep in sync with {@link LEGACY_LONG_PARAM_TO_KEY} in rmmz-plugins migrate script.
 */
export const LEGACY_LONG_PARAM_TO_KEY: Record<number, string> = {
  0: "mhp",
  1: "mmp",
  2: "atk",
  3: "def",
  4: "mat",
  5: "mdf",
  6: "agi",
  7: "luk",
  8: "hit",
  9: "eva",
  10: "cri",
  11: "cev",
  12: "mev",
  13: "mrf",
  14: "cnt",
  15: "hrg",
  16: "mrg",
  17: "trg",
  18: "tgr",
  19: "grd",
  20: "rec",
  21: "pha",
  22: "mcr",
  23: "tcr",
  24: "pdr",
  25: "mdr",
  26: "fdr",
  27: "exr",
  28: "cdm",
  29: "cdr",
  30: "mtp",
  31: "msb",
  32: "prof",
  33: "sdr",
  35: "lst",
  36: "mst",
  37: "tst",
  38: "sar",
  39: "ser",
  40: "apr",
  41: "gdr",
  42: "dor",
  43: "hcr",
  46: "har",
};

/**
 * Display names for registry-backed SDP panel keys (long-param ids 31+).
 * Keep aligned with in-game TextManager labels where applicable.
 */
export const SDP_REGISTRY_PARAMETER_NAMES: Record<string, string> = {
  msb: "Move Speed Boost",
  prof: "Proficiency Boost",
  sdr: "SDP Multiplier",
  lst: "Lifesteal",
  mst: "Manasteal",
  tst: "Techsteal",
  sar: "Shield Amplification",
  ser: "Shield Effectiveness",
  apr: "AP Multiplier",
  gdr: "Gold Rate",
  dor: "Drop Rate",
  hcr: "HP Cost Reduction",
  har: "Healing Rate",
};

/** Long-param ids offered in the SDP panel parameter picker beyond vanilla custom (28–30). */
export const SDP_REGISTRY_PARAMETER_LONG_IDS = [
  31,
  32,
  33,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  46,
] as const;

export type SdpPanelParameterOption = {
  key: string;
  name: string;
  longParamId: number;
};

/**
 * Registry-backed panel parameter rows for the SDP board picker.
 *
 * @returns Options sorted by legacy long-param id.
 */
export function knownSdpRegistryParameterOptions(): SdpPanelParameterOption[]
{
  return SDP_REGISTRY_PARAMETER_LONG_IDS.map((longParamId) =>
  {
    const key = LEGACY_LONG_PARAM_TO_KEY[longParamId];

    return {
      key,
      name: SDP_REGISTRY_PARAMETER_NAMES[key] ?? key,
      longParamId,
    };
  });
}

/**
 * Resolves a friendly label for an SDP panel parameter key.
 *
 * @param parameterKey Registry key from panel JSON.
 * @returns Display name for UI chrome.
 */
export function sdpParameterDisplayName(parameterKey: string): string
{
  return SDP_REGISTRY_PARAMETER_NAMES[parameterKey] ?? parameterKey;
}

type RawSdpParameter = {
  parameterKey?: string;
  parameterId?: number;
  perRank: number;
  isFlat: boolean;
  isCore: boolean;
};

/**
 * Normalizes one panel parameter row from disk into registry-key form.
 *
 * @param raw Parsed JSON parameter row.
 * @returns Canonical parameter row for the editor and save path.
 */
export function normalizeSdpParameter(raw: RawSdpParameter): Sdp.SdpParameter
{
  if (raw.parameterKey && raw.parameterKey.trim() !== "")
  {
    return {
      parameterKey: raw.parameterKey,
      perRank: Number(raw.perRank) || 0,
      isFlat: raw.isFlat === true,
      isCore: raw.isCore === true,
    };
  }

  const legacyId = Number.parseInt(String(raw.parameterId), 10);
  const parameterKey = LEGACY_LONG_PARAM_TO_KEY[legacyId];

  if (!parameterKey)
  {
    throw new Error(`Unknown legacy SDP parameterId [${raw.parameterId}].`);
  }

  return {
    parameterKey,
    perRank: Number(raw.perRank) || 0,
    isFlat: raw.isFlat === true,
    isCore: raw.isCore === true,
  };
}

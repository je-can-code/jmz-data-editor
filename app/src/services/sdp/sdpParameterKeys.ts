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
};

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

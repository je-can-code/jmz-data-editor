import { grey, green, blue, purple, orange, yellow } from "@mui/material/colors";

/** Panel `rarity` in `config.sdp.json`: **0–5** (Common..Godlike). */
export const SDP_RARITY_COMMON = 0;

export const SDP_RARITY_MAGICAL = 1;

export const SDP_RARITY_RARE = 2;

export const SDP_RARITY_EPIC = 3;

export const SDP_RARITY_LEGENDARY = 4;

export const SDP_RARITY_GODLIKE = 5;

/** Highest valid `rarity` ({@link SDP_RARITY_GODLIKE}). */
export const SDP_RARITY_MAX = SDP_RARITY_GODLIKE;

const WINDOW_COLOR_RARE = 23;

const WINDOW_COLOR_EPIC = 31;

const WINDOW_COLOR_LEGENDARY = 20;

const WINDOW_COLOR_GODLIKE = 25;

/**
 * Normalizes a numeric `rarity` from disk into **0–5**.
 *
 * @param raw Value from JSON.
 * @returns Rarity index.
 */
export function normalizeSdpRarityFromDisk(raw: number): number
{
  switch (raw)
  {
    case WINDOW_COLOR_RARE:
      return SDP_RARITY_RARE;
    case WINDOW_COLOR_EPIC:
      return SDP_RARITY_EPIC;
    case WINDOW_COLOR_LEGENDARY:
      return SDP_RARITY_LEGENDARY;
    case WINDOW_COLOR_GODLIKE:
      return SDP_RARITY_GODLIKE;
    default:
      break;
  }

  if (raw >= SDP_RARITY_COMMON && raw <= SDP_RARITY_MAX)
  {
    return raw;
  }

  return SDP_RARITY_COMMON;
}

/**
 * Applies {@link normalizeSdpRarityFromDisk} to every panel's `rarity`.
 *
 * @param panels Loaded `sdps` array.
 * @returns Updated panel list.
 */
export function normalizeSdpPanelList<T extends { rarity: number }>(panels: T[]): T[]
{
  return panels.map(panel =>
    ({
      ...panel,
      rarity: normalizeSdpRarityFromDisk(panel.rarity),
    }));
}

/**
 * Editor sidebar row color for this rarity.
 *
 * @param rarityIndex **0–5**.
 * @returns CSS color string.
 */
export function sdpRarityToMuiColor(rarityIndex: number): string
{
  switch (rarityIndex)
  {
    case SDP_RARITY_COMMON:
      return grey[600];
    case SDP_RARITY_MAGICAL:
      return green[600];
    case SDP_RARITY_RARE:
      return blue[600];
    case SDP_RARITY_EPIC:
      return purple[500];
    case SDP_RARITY_LEGENDARY:
      return orange[600];
    case SDP_RARITY_GODLIKE:
      return yellow[600];
    default:
      return grey[100];
  }
}

/**
 * Dropdown label (**Tier** is 1-based for display: Common = Tier 1).
 *
 * @param rarityIndex **0–5**.
 * @returns Label string.
 */
export function sdpRarityMenuLabel(rarityIndex: number): string
{
  const slot = rarityIndex + 1;
  switch (rarityIndex)
  {
    case SDP_RARITY_COMMON:
      return `Common (Tier ${slot})`;
    case SDP_RARITY_MAGICAL:
      return `Magical (Tier ${slot})`;
    case SDP_RARITY_RARE:
      return `Rare (Tier ${slot})`;
    case SDP_RARITY_EPIC:
      return `Epic (Tier ${slot})`;
    case SDP_RARITY_LEGENDARY:
      return `Legendary (Tier ${slot})`;
    case SDP_RARITY_GODLIKE:
      return `Godlike (Tier ${slot})`;
    default:
      return `UNKNOWN (Tier ${slot})`;
  }
}

/** Values for `rarity` in JSON and the editor Select (**0–5**). */
export const SDP_RARITY_VALUES: readonly number[] = [
  SDP_RARITY_COMMON,
  SDP_RARITY_MAGICAL,
  SDP_RARITY_RARE,
  SDP_RARITY_EPIC,
  SDP_RARITY_LEGENDARY,
  SDP_RARITY_GODLIKE,
];

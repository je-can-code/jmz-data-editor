/**
 * Named tier stripe colors for J-Passive-ABS (editor presets). First entry clears the tag.
 */
type TierColorPreset = {
  label: string;
  hex: string;
};

/**
 * Thirty-two choices: none plus 31 distinct hues / neutrals. Hex is always {@code #RRGGBB} when set.
 */
const TIER_COLOR_PRESETS: TierColorPreset[] = [
  { label: "None", hex: "" },
  { label: "Crimson", hex: "#DC143C" },
  { label: "Tomato", hex: "#FF6347" },
  { label: "Orange", hex: "#FF8C00" },
  { label: "Amber", hex: "#FFB300" },
  { label: "Gold", hex: "#FFD700" },
  { label: "Yellow", hex: "#FFEB3B" },
  { label: "Lime", hex: "#CDDC39" },
  { label: "Chartreuse", hex: "#7FFF00" },
  { label: "Green", hex: "#22C55E" },
  { label: "Emerald", hex: "#10B981" },
  { label: "Teal", hex: "#14B8A6" },
  { label: "Cyan", hex: "#06B6D4" },
  { label: "Sky", hex: "#38BDF8" },
  { label: "Blue", hex: "#3B82F6" },
  { label: "Indigo", hex: "#6366F1" },
  { label: "Violet", hex: "#8B5CF6" },
  { label: "Purple", hex: "#A855F7" },
  { label: "Fuchsia", hex: "#D946EF" },
  { label: "Pink", hex: "#EC4899" },
  { label: "Rose", hex: "#F43F5E" },
  { label: "Brown", hex: "#8B4513" },
  { label: "Tan", hex: "#D2B48C" },
  { label: "Slate", hex: "#64748B" },
  { label: "Gray", hex: "#9CA3AF" },
  { label: "Silver", hex: "#CBD5E1" },
  { label: "Charcoal", hex: "#374151" },
  { label: "Navy", hex: "#1E3A8A" },
  { label: "Maroon", hex: "#7F1D1D" },
  { label: "Olive", hex: "#556B2F" },
  { label: "Mint", hex: "#98FB98" },
  { label: "Ice", hex: "#E0F2FE" },
];

/**
 * Finds a preset whose hex matches (case-insensitive), or null if the value is custom / absent.
 *
 * @param hex Raw {@code #RRGGBB} or empty.
 */
const findTierColorPresetByHex = (hex: string): TierColorPreset | null =>
{
  const t = hex.trim()
    .toUpperCase();
  if (t === "")
  {
    return TIER_COLOR_PRESETS[ 0 ];
  }
  const found = TIER_COLOR_PRESETS.find((p) => p.hex.toUpperCase() === t);
  return found ?? null;
};

export { TIER_COLOR_PRESETS, findTierColorPresetByHex };
export type { TierColorPreset };

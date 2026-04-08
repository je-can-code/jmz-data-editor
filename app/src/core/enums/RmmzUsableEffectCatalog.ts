import { fromBParamIdToName } from "../../mappers/ParameterIdMapper.ts";

/** Vanilla MZ {@link Game_Action} usable effect codes (skills / items). */
const RMMZ_EFFECT_RECOVER_HP = 11;
const RMMZ_EFFECT_RECOVER_MP = 12;
const RMMZ_EFFECT_GAIN_TP = 13;
const RMMZ_EFFECT_ADD_STATE = 21;
const RMMZ_EFFECT_REMOVE_STATE = 22;
const RMMZ_EFFECT_ADD_BUFF = 31;
const RMMZ_EFFECT_ADD_DEBUFF = 32;
const RMMZ_EFFECT_REMOVE_BUFF = 33;
const RMMZ_EFFECT_REMOVE_DEBUFF = 34;
const RMMZ_EFFECT_SPECIAL = 41;
const RMMZ_EFFECT_GROW = 42;
const RMMZ_EFFECT_LEARN_SKILL = 43;
const RMMZ_EFFECT_COMMON_EVENT = 44;

/** Vanilla special effect ids under {@link RMMZ_EFFECT_SPECIAL}. */
const RMMZ_SPECIAL_EFFECT_ESCAPE = 0;

type RmmzUsableEffectDataIdRole =
  | "none"
  | "state_add"
  | "state_remove"
  | "param"
  | "special"
  | "skill"
  | "common_event";

type RmmzUsableEffectValue1Role =
  | "recover_fraction"
  | "tp_amount"
  | "state_chance"
  | "buff_turns"
  | "debuff_turns"
  | "grow_delta"
  | "unused";

type RmmzUsableEffectValue2Role =
  | "recover_flat"
  | "unused";

type RmmzUsableEffectCatalogRow = {
  code: number;
  label: string;
  dataId: RmmzUsableEffectDataIdRole;
  value1: RmmzUsableEffectValue1Role;
  value2: RmmzUsableEffectValue2Role;
};

const RMMZ_USABLE_EFFECT_CATALOG: RmmzUsableEffectCatalogRow[] = [
  {
    code: RMMZ_EFFECT_RECOVER_HP,
    label: "Recover HP",
    dataId: "none",
    value1: "recover_fraction",
    value2: "recover_flat",
  },
  {
    code: RMMZ_EFFECT_RECOVER_MP,
    label: "Recover MP",
    dataId: "none",
    value1: "recover_fraction",
    value2: "recover_flat",
  },
  {
    code: RMMZ_EFFECT_GAIN_TP,
    label: "Gain TP",
    dataId: "none",
    value1: "tp_amount",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_ADD_STATE,
    label: "Add state",
    dataId: "state_add",
    value1: "state_chance",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_REMOVE_STATE,
    label: "Remove state",
    dataId: "state_remove",
    value1: "state_chance",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_ADD_BUFF,
    label: "Add buff",
    dataId: "param",
    value1: "buff_turns",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_ADD_DEBUFF,
    label: "Add debuff",
    dataId: "param",
    value1: "debuff_turns",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_REMOVE_BUFF,
    label: "Remove buff",
    dataId: "param",
    value1: "unused",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_REMOVE_DEBUFF,
    label: "Remove debuff",
    dataId: "param",
    value1: "unused",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_SPECIAL,
    label: "Special effect",
    dataId: "special",
    value1: "unused",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_GROW,
    label: "Grow parameter",
    dataId: "param",
    value1: "grow_delta",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_LEARN_SKILL,
    label: "Learn skill",
    dataId: "skill",
    value1: "unused",
    value2: "unused",
  },
  {
    code: RMMZ_EFFECT_COMMON_EVENT,
    label: "Common event",
    dataId: "common_event",
    value1: "unused",
    value2: "unused",
  },
];

const catalogByCode = new Map(
  RMMZ_USABLE_EFFECT_CATALOG.map((row) => [ row.code, row ])
);

type RmmzUsableEffectCatalogOption = RmmzUsableEffectCatalogRow & {
  optionKey: string;
};

/**
 * Autocomplete options for vanilla usable effect types (primary label, secondary shows {@code code}).
 */
const RMMZ_USABLE_EFFECT_OPTIONS: RmmzUsableEffectCatalogOption[] =
  RMMZ_USABLE_EFFECT_CATALOG.map((row) => ({
    ...row,
    optionKey: String(row.code),
  }));

/**
 * @param code Effect {@code code} from {@link Rmmz.Data.RPG_UsableEffect}.
 * @returns Catalog row when {@code code} is vanilla; otherwise {@code null}.
 */
function catalogRowForEffectCode(code: number): RmmzUsableEffectCatalogRow | null
{
  return catalogByCode.get(code) ?? null;
}

/**
 * Default {@link Rmmz.Data.RPG_UsableEffect} row for a vanilla {@code code} (MZ editor-style starting values).
 * @param code Vanilla effect code.
 */
function defaultUsableEffectForCode(code: number): Rmmz.Data.RPG_UsableEffect
{
  switch (code)
  {
    case RMMZ_EFFECT_RECOVER_HP:
    case RMMZ_EFFECT_RECOVER_MP:
      return {
        code,
        dataId: 0,
        value1: 0,
        value2: 0,
      };
    case RMMZ_EFFECT_GAIN_TP:
      return {
        code,
        dataId: 0,
        value1: 0,
        value2: 0,
      };
    case RMMZ_EFFECT_ADD_STATE:
      return {
        code,
        dataId: 0,
        value1: 1,
        value2: 0,
      };
    case RMMZ_EFFECT_REMOVE_STATE:
      return {
        code,
        dataId: 1,
        value1: 1,
        value2: 0,
      };
    case RMMZ_EFFECT_ADD_BUFF:
    case RMMZ_EFFECT_ADD_DEBUFF:
      return {
        code,
        dataId: 0,
        value1: 5,
        value2: 0,
      };
    case RMMZ_EFFECT_REMOVE_BUFF:
    case RMMZ_EFFECT_REMOVE_DEBUFF:
      return {
        code,
        dataId: 0,
        value1: 0,
        value2: 0,
      };
    case RMMZ_EFFECT_SPECIAL:
      return {
        code,
        dataId: RMMZ_SPECIAL_EFFECT_ESCAPE,
        value1: 0,
        value2: 0,
      };
    case RMMZ_EFFECT_GROW:
      return {
        code,
        dataId: 0,
        value1: 1,
        value2: 0,
      };
    case RMMZ_EFFECT_LEARN_SKILL:
      return {
        code,
        dataId: 1,
        value1: 0,
        value2: 0,
      };
    case RMMZ_EFFECT_COMMON_EVENT:
      return {
        code,
        dataId: 1,
        value1: 0,
        value2: 0,
      };
    default:
      return {
        code,
        dataId: 0,
        value1: 0,
        value2: 0,
      };
  }
}

/**
 * Buff / debuff / grow parameter ids (0–7) with editor labels.
 */
function buildBparamAutocompleteOptions(): { id: number; label: string }[]
{
  return [ 0, 1, 2, 3, 4, 5, 6, 7 ].map((id) => ({
    id,
    label: `${id}: ${fromBParamIdToName(id)}`,
  }));
}

/**
 * @param raw Unknown JSON row shape.
 * @returns Normalized {@link Rmmz.Data.RPG_UsableEffect} with finite numeric fields.
 */
function normalizeUsableEffect(raw: unknown): Rmmz.Data.RPG_UsableEffect
{
  if (raw === null || typeof raw !== "object")
  {
    return defaultUsableEffectForCode(RMMZ_EFFECT_RECOVER_HP);
  }
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
  {
    const n = typeof v === "number"
      ? v
      : Number(v);
    return Number.isFinite(n)
      ? n
      : fallback;
  };
  return {
    code: num(o["code"], RMMZ_EFFECT_RECOVER_HP),
    dataId: num(o["dataId"], 0),
    value1: num(o["value1"], 0),
    value2: num(o["value2"], 0),
  };
}

/**
 * @param list Raw {@code effects} array from database JSON.
 * @returns Cloned, normalized effects safe to mutate in the editor.
 */
function cloneUsableEffectsFromRmmz(list: unknown): Rmmz.Data.RPG_UsableEffect[]
{
  if (!Array.isArray(list))
  {
    return [];
  }
  return list.map((row) => normalizeUsableEffect(row));
}

export {
  RMMZ_EFFECT_RECOVER_HP,
  RMMZ_EFFECT_RECOVER_MP,
  RMMZ_EFFECT_GAIN_TP,
  RMMZ_EFFECT_ADD_STATE,
  RMMZ_EFFECT_REMOVE_STATE,
  RMMZ_EFFECT_ADD_BUFF,
  RMMZ_EFFECT_ADD_DEBUFF,
  RMMZ_EFFECT_REMOVE_BUFF,
  RMMZ_EFFECT_REMOVE_DEBUFF,
  RMMZ_EFFECT_SPECIAL,
  RMMZ_EFFECT_GROW,
  RMMZ_EFFECT_LEARN_SKILL,
  RMMZ_EFFECT_COMMON_EVENT,
  RMMZ_SPECIAL_EFFECT_ESCAPE,
  RMMZ_USABLE_EFFECT_OPTIONS,
  catalogRowForEffectCode,
  defaultUsableEffectForCode,
  buildBparamAutocompleteOptions,
  normalizeUsableEffect,
  cloneUsableEffectsFromRmmz,
  type RmmzUsableEffectCatalogOption,
  type RmmzUsableEffectDataIdRole,
  type RmmzUsableEffectValue1Role,
  type RmmzUsableEffectValue2Role,
};

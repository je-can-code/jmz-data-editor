import { describe, expect, it } from "vitest";
import {
  parseRmmzDamageElementId,
  RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK,
} from "../../../src/core/enums/RmmzDamageElementId.ts";

describe("RmmzDamageElementId", () =>
{
  it("preserves normal attack sentinel", () =>
  {
    expect(RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK).toBe(-1);
    expect(parseRmmzDamageElementId(-1)).toBe(-1);
  });

  it("preserves non-negative indices", () =>
  {
    expect(parseRmmzDamageElementId(0)).toBe(0);
    expect(parseRmmzDamageElementId(12)).toBe(12);
  });

  it("coerces invalid values to 0", () =>
  {
    expect(parseRmmzDamageElementId(-2)).toBe(0);
    expect(parseRmmzDamageElementId(1.5)).toBe(0);
    expect(parseRmmzDamageElementId(NaN)).toBe(0);
  });
});

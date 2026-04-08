import { describe, expect, it } from "vitest";
import { SkillSksSkillNoteParser } from "../../../src/services/parsers/SkillSksSkillNoteParser.ts";

describe("SkillSksSkillNoteParser", () =>
{
  it("reads slot cost and explicit unslotted", () =>
  {
    expect(
      SkillSksSkillNoteParser.readSlotCost("<slotCost:3>\n<foo>")
    ).toBe(3);
    expect(SkillSksSkillNoteParser.readExplicitUnslotted("<unslotted>")).toBe(true);
    expect(SkillSksSkillNoteParser.readExplicitUnslotted("plain")).toBe(false);
  });

  it("writeSksSkillTags replaces prior tags and prepends", () =>
  {
    const out = SkillSksSkillNoteParser.writeSksSkillTags(
      "<slotCost:9>\n<unslotted>\nkeep",
      2,
      false
    );
    expect(out).toContain("<slotCost:2>");
    expect(out).toContain("keep");
    expect(out.includes("9")).toBe(false);
    expect(out.includes("unslotted")).toBe(false);
  });

  it("writeSksSkillTags can emit only unslotted", () =>
  {
    const out = SkillSksSkillNoteParser.writeSksSkillTags("x", null, true);
    expect(out).toContain("<unslotted>");
    expect(out).toContain("x");
    expect(out).not.toMatch(/slotCost/i);
  });
});

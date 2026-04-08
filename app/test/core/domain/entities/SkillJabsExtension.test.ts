import { describe, expect, it } from "vitest";
import { SkillJabsExtension } from "../../../../src/core/domain/entities/jabs/SkillJabsExtension.ts";

describe("SkillJabsExtension", () =>
{
  it("fromSkillNote reads actionId", () =>
  {
    const j = SkillJabsExtension.fromSkillNote("<actionId:4>");
    expect(j.actionId).toBe(4);
  });

  it("applyToNote writes actionId", () =>
  {
    const j = new SkillJabsExtension();
    j.actionId = 2;
    expect(j.applyToNote("")).toContain("<actionId:2>");
  });

  it("clone copies and patch overrides actionId", () =>
  {
    const a = SkillJabsExtension.fromSkillNote("<actionId:3>");
    const b = a.clone({ actionId: 5 });
    expect(a.actionId).toBe(3);
    expect(b.actionId).toBe(5);
    const c = a.clone();
    expect(c.actionId).toBe(3);
  });
});
